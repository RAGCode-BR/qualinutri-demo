import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { FileText, Minus, Plus, X } from "lucide-react";

type DocViewerProps = { title: string; subtitle?: string; actions?: ReactNode; onClose: () => void; children: ReactNode };

/** Visualizador de documento na tela (página A4, zoom), no lugar de abrir direto a impressão. */
export function DocViewer({ title, subtitle, actions, onClose, children }: DocViewerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 900 ? 0.55 : 1));
  const [printing, setPrinting] = useState(false);
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
  return (
    <>
    {printing && createPortal(<div className="print-root doc-print-root">{children}</div>, document.body)}
    <dialog ref={ref} className="doc-viewer" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="doc-viewer-inner">
        <header className="doc-viewer-bar">
          <FileText size={18} aria-hidden="true" />
          <div className="doc-viewer-title"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
          <div className="doc-viewer-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.4, Math.round((value - 0.1) * 10) / 10))} aria-label="Diminuir"><Minus size={15} aria-hidden="true" /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))} aria-label="Aumentar"><Plus size={15} aria-hidden="true" /></button>
          </div>
          {actions}
          <button type="button" className="doc-viewer-close" onClick={onClose} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="doc-viewer-canvas">
          <div className="doc-viewer-page" style={{ zoom }}>{children}</div>
        </div>
      </div>
    </dialog>
    </>
  );
}
