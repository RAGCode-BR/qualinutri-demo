import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import { loadEvidence, placeholderSvg } from "../../demo/checklist/evidence";
import type { EvidenceRef, RecordStatus } from "../../demo/checklist/types";
import { stableHash } from "../../demo/store/ids";

export const statusLabels: Record<RecordStatus, string> = { conforme: "Conforme", pendente: "Pendente", nao_conforme: "Fora de conformidade" };

export function StatusChip({ status }: { status: RecordStatus }) {
  const Icon = status === "conforme" ? CheckCircle2 : status === "pendente" ? Clock3 : CircleAlert;
  return <span className={`ck-status is-${status}`}><Icon size={14} aria-hidden="true" />{statusLabels[status]}</span>;
}

/** Miniatura da evidência: arquivo salvo no navegador ou imagem de exemplo. */
export function EvidenceThumb({ evidence, onOpen }: { evidence: EvidenceRef; onOpen?: (url: string, type?: string) => void }) {
  const [url, setUrl] = useState<string | null>(evidence.placeholder ? placeholderSvg(evidence.placeholder, stableHash(evidence.id)) : null);
  useEffect(() => {
    if (evidence.placeholder) return;
    let objectUrl: string | null = null;
    let active = true;
    void loadEvidence(evidence.id).then((blob) => {
      if (!blob || !active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [evidence.id, evidence.placeholder]);
  const isImage = evidence.type.startsWith("image/");
  return (
    <button type="button" className="ck-thumb" title={evidence.name} onClick={(event) => { event.stopPropagation(); if (url) onOpen?.(url, evidence.placeholder ? "image/svg+xml" : evidence.type); }}>
      {url && isImage ? <img src={url} alt={evidence.name} loading="lazy" /> : <span className="ck-thumb-file">{evidence.name.split(".").pop()?.toUpperCase() ?? "ARQ"}</span>}
    </button>
  );
}

/** Anel de porcentagem animado. */
export function Ring({ value, size = 64, stroke = 7, tone }: { value: number; size?: number; stroke?: number; tone?: "good" | "warn" | "bad" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = tone === "bad" ? "#c4392b" : tone === "warn" ? "#e0a800" : "#25914a";
  return (
    <svg className="ck-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% de conformidade`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgb(14 64 34 / 10%)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ck-ring-value" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ck-ring-text" style={{ fontSize: size * 0.24 }}>{value}%</text>
    </svg>
  );
}

export function toneFor(pct: number): "good" | "warn" | "bad" {
  return pct >= 85 ? "good" : pct >= 70 ? "warn" : "bad";
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Visualizador de anexo em tela cheia: imagem ou PDF. */
export function Lightbox({ url, type, onClose }: { url: string; type?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ck-lightbox" role="dialog" aria-label="Anexo" onClick={onClose}>
      {type === "application/pdf" ? <iframe className="ck-lightbox-pdf" title="Anexo em PDF" src={url} onClick={(event) => event.stopPropagation()} /> : <img src={url} alt="Anexo" />}
    </div>
  );
}
