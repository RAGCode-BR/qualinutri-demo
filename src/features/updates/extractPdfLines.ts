/**
 * Extrai o texto de um PDF no próprio navegador e o devolve em linhas, na
 * ordem de leitura. O pdf.js só é carregado quando esta função é chamada.
 */

export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfReadError";
  }
}

type TextPiece = { text: string; x: number; y: number; height: number };

/** Uma linha visual do PDF, com a posição horizontal de cada pedaço de texto. */
export type PdfLine = { text: string; pieces: Array<{ text: string; x: number }> };

export async function extractPdfLines(file: File): Promise<PdfLine[]> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let document;
  try {
    document = await loadingTask.promise;
  } catch {
    throw new PdfReadError("Não foi possível abrir o arquivo. Confira se é um PDF válido e sem senha.");
  }

  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pieces: TextPiece[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      pieces.push({ text: item.str, x, y, height: Math.abs(item.height) || 10 });
    }
    lines.push(...groupIntoLines(pieces));
  }
  await loadingTask.destroy();

  if (lines.length === 0) {
    throw new PdfReadError("O PDF não tem texto para ler. Ele pode ser uma imagem escaneada; use o PDF gerado pelo sistema de origem.");
  }
  return lines;
}

/** Junta pedaços de texto que estão na mesma altura da página, da esquerda para a direita. */
export function groupIntoLines(pieces: TextPiece[]): PdfLine[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const piece of sorted) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, piece.height * 0.4);
    if (row && Math.abs(row[0].y - piece.y) <= tolerance) row.push(piece);
    else rows.push([piece]);
  }
  return rows
    .map((row) => {
      const sorted = row.sort((a, b) => a.x - b.x);
      return {
        text: sorted.map((piece) => piece.text.trim()).join(" ").replace(/\s+/g, " ").trim(),
        pieces: sorted.map((piece) => ({ text: piece.text.trim(), x: piece.x })),
      };
    })
    .filter((line) => line.text.length > 0);
}
