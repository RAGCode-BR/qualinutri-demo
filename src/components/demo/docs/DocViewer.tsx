import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { Download, FileText, Loader2, Minus, Plus, Printer, X } from "lucide-react";
import { elementToPdf, pdfFileName } from "./domPdf";

type DocViewerProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Gera o PDF de outro jeito (ex.: tabelas vetoriais do caixa). Sem ele, o PDF é feito da página na tela. */
  pdf?: () => Promise<Blob>;
  /** Nome do arquivo baixado; por padrão vem do título. */
  fileName?: string;
  /** Muda quando o conteúdo muda (ex.: outra ficha escolhida) e descarta o PDF já gerado. */
  docKey?: string;
};

/** Visualizador de documento na tela (página A4, zoom) com o PDF de verdade: ver, baixar e imprimir. */
export function DocViewer({ title, subtitle, actions, onClose, children, pdf, fileName, docKey }: DocViewerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 900 ? 0.55 : 1));
  const [printing, setPrinting] = useState(false);
  const [mode, setMode] = useState<"page" | "pdf">("page");
  const [pdfUrl, setPdfUrl] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const name = fileName ?? pdfFileName(title);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  // Na impressão (botão "Imprimir" ou Ctrl+P), a página vai para um .print-root no <body>,
  // o mesmo esquema do PDF original: só o documento sai no papel / no PDF.
  useEffect(() => {
    const before = () => { flushSync(() => setPrinting(true)); document.body.classList.add("is-printing"); };
    const after = () => { document.body.classList.remove("is-printing"); setPrinting(false); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); after(); };
  }, []);
  // Conteúdo trocado: o PDF gerado antes não vale mais.
  useEffect(() => { setPdfUrl(""); setMode("page"); setError(""); }, [docKey]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function build() {
    if (pdfUrl) return pdfUrl;
    setBuilding(true); setError("");
    const previousZoom = zoom;
    try {
      let blob: Blob;
      if (pdf) blob = await pdf();
      else {
        flushSync(() => setZoom(1));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        blob = await elementToPdf(pageRef.current!, title);
      }
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      return url;
    } catch {
      setError("Não foi possível gerar o PDF. Use Imprimir e escolha “Salvar como PDF”.");
      return "";
    } finally {
      setZoom(previousZoom);
      setBuilding(false);
    }
  }

  async function showPdf() {
    if (mode === "pdf") { setMode("page"); return; }
    if (await build()) setMode("pdf");
  }

  async function download() {
    const url = await build();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function printPdf() {
    const frame = frameRef.current?.contentWindow;
    try { frame?.focus(); frame?.print(); } catch { window.open(pdfUrl, "_blank", "noopener"); }
  }

  return (
    <>
    {printing && createPortal(<div className="print-root doc-print-root">{children}</div>, document.body)}
    <dialog ref={ref} className="doc-viewer" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="doc-viewer-inner">
        <header className="doc-viewer-bar">
          <FileText size={18} aria-hidden="true" />
          <div className="doc-viewer-title"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
          {mode === "page" && <div className="doc-viewer-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.4, Math.round((value - 0.1) * 10) / 10))} aria-label="Diminuir"><Minus size={15} aria-hidden="true" /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))} aria-label="Aumentar"><Plus size={15} aria-hidden="true" /></button>
          </div>}
          <div className="doc-viewer-actions doc-viewer-pdf-actions">
            <button type="button" className="secondary-button compact-secondary" onClick={() => void showPdf()} disabled={building} aria-pressed={mode === "pdf"}>
              {building ? <Loader2 size={15} aria-hidden="true" className="doc-viewer-spin" /> : <FileText size={15} aria-hidden="true" />}&nbsp;{building ? "Gerando PDF…" : mode === "pdf" ? "Voltar à página" : "Ver PDF"}
            </button>
            <button type="button" className="secondary-button compact-secondary" onClick={() => void download()} disabled={building}><Download size={15} aria-hidden="true" />&nbsp;Baixar PDF</button>
            {mode === "pdf" && pdfUrl && <button type="button" className="secondary-button compact-secondary" onClick={printPdf}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir PDF</button>}
          </div>
          {mode === "page" && actions}
          <button type="button" className="doc-viewer-close" onClick={onClose} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
        </header>
        {error && <p className="doc-viewer-error" role="alert">{error}</p>}
        <div className={`doc-viewer-canvas${mode === "pdf" ? " is-pdf" : ""}`}>
          {mode === "pdf" && pdfUrl && <iframe ref={frameRef} className="doc-viewer-pdf" title={`${title} · PDF`} src={pdfUrl} />}
          <div ref={pageRef} className="doc-viewer-page" style={{ zoom }} hidden={mode === "pdf"}>{children}</div>
        </div>
      </div>
    </dialog>
    </>
  );
}
