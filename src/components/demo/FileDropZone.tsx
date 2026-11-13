import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";

type FileDropZoneProps = { onFiles: (files: FileList) => void; accept?: string; label?: ReactNode; hint?: string; compact?: boolean; disabled?: boolean };

/** Área para arrastar e soltar arquivos (ou clicar para escolher). Usada em todos os anexos. */
export function FileDropZone({ onFiles, accept = "image/*,application/pdf", label = "Arraste os arquivos aqui", hint = "ou clique para escolher · fotos e PDF", compact = false, disabled = false }: FileDropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  function drop(event: DragEvent) {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
  }

  return (
    <div
      className={`dropzone${over ? " is-over" : ""}${compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => { if (!disabled) input.current?.click(); }}
      onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); input.current?.click(); } }}
      onDragEnter={(event) => { event.preventDefault(); depth.current += 1; setOver(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) setOver(false); }}
      onDrop={drop}
    >
      <UploadCloud size={compact ? 20 : 26} aria-hidden="true" />
      <span><strong>{over ? "Solte para anexar" : label}</strong><small>{hint}</small></span>
      <input ref={input} type="file" multiple accept={accept} hidden onChange={(event) => { if (event.target.files?.length) onFiles(event.target.files); event.target.value = ""; }} />
    </div>
  );
}
