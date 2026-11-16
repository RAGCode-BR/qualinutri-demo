/**
 * Gera um PDF A4 a partir da página mostrada no DocViewer.
 *
 * A página é fotografada (html2canvas) e fatiada em folhas A4. Os cortes caem
 * no fim de linhas, parágrafos e linhas de tabela, para não partir texto ao
 * meio; vários documentos na mesma página (ex.: fichas de entrega) começam
 * cada um numa folha nova.
 */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const TOP_MARGIN_MM = 10;
const BREAK_SELECTOR = "tr, p, li, h1, h2, h3, h4, header, footer, section, table, dl, figure, img, svg, .quote-doc > *";

function breakPoints(page: HTMLElement) {
  const top = page.getBoundingClientRect().top;
  const ends = new Set<number>();
  page.querySelectorAll<HTMLElement>(BREAK_SELECTOR).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.height > 0) ends.add(Math.round(rect.bottom - top));
  });
  const documents = [...page.children].filter((child) => child.tagName === "ARTICLE");
  const forced = documents.length > 1 ? documents.slice(1).map((child) => Math.round(child.getBoundingClientRect().top - top)) : [];
  return { ends: [...ends].sort((a, b) => a - b), forced };
}

function slices(total: number, firstHeight: number, nextHeight: number, ends: number[], forced: number[]) {
  const result: Array<[number, number]> = [];
  let start = 0;
  while (start < total - 2) {
    const room = result.length === 0 ? firstHeight : nextHeight;
    let end = Math.min(total, start + room);
    const hard = forced.find((value) => value > start + 4 && value <= end);
    if (hard !== undefined) end = hard;
    else if (end < total) {
      const soft = ends.filter((value) => value > start + room * 0.55 && value <= end).pop();
      if (soft !== undefined) end = soft;
    }
    result.push([start, end]);
    start = end;
  }
  return result;
}

export async function elementToPdf(page: HTMLElement, title: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const width = page.offsetWidth;
  // Até o fim do conteúdo (mais a margem de baixo), não até a altura mínima A4 da página na tela.
  const pageTop = page.getBoundingClientRect().top;
  const contentEnd = Math.max(0, ...[...page.children].map((child) => child.getBoundingClientRect().bottom - pageTop));
  const total = Math.min(page.scrollHeight, Math.ceil(contentEnd + parseFloat(getComputedStyle(page).paddingBottom || "0")));
  const { ends, forced } = breakPoints(page);
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1) * 1.5);
  const canvas = await html2canvas(page, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: Math.max(document.documentElement.clientWidth, width + 64),
    onclone: (_doc, clone) => {
      clone.style.boxShadow = "none";
      clone.style.animation = "none";
      clone.style.borderRadius = "0";
      clone.style.zoom = "1";
    },
  });

  const pxPerMm = width / A4_WIDTH_MM;
  const pageHeight = A4_HEIGHT_MM * pxPerMm;
  const nextHeight = (A4_HEIGHT_MM - TOP_MARGIN_MM) * pxPerMm;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title, subject: "Qualinutri · Dados de demonstração" });

  slices(total, pageHeight, nextHeight, ends, forced).forEach(([from, to], index) => {
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((to - from) * scale));
    const context = slice.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, Math.round(from * scale), canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (index > 0) pdf.addPage();
    const offset = index === 0 ? 0 : TOP_MARGIN_MM;
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, offset, A4_WIDTH_MM, (to - from) / pxPerMm, undefined, "FAST");
  });
  return pdf.output("blob");
}

/** Nome de arquivo seguro a partir do título do documento. */
export function pdfFileName(title: string) {
  const slug = title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `qualinutri-${slug || "documento"}.pdf`;
}
