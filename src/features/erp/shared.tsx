import type { ReactNode } from "react";
import { useCountUp } from "../../components/demo/useCountUp";
import { formatKpi } from "../../components/demo/format";
import type { KpiFormat } from "../../demo/kpis/dashboard";

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; badge?: number }[]; onChange: (value: T) => void }) {
  return (
    <nav className="ck-rail erp-tabs" aria-label="Seções">
      {options.map((option) => (
        <button key={option.id} type="button" aria-current={value === option.id ? "page" : undefined} onClick={() => onChange(option.id)}>
          {option.label}
          {option.badge ? <span className="ck-rail-badge is-bad">{option.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function Stat({ label, value, format, caption, tone, onClick, index = 0 }: { label: string; value: number; format: KpiFormat; caption?: ReactNode; tone?: "good" | "warn" | "bad"; onClick?: () => void; index?: number }) {
  const animated = useCountUp(value, 800);
  return (
    <button type="button" className={`strip-card${tone ? ` is-${tone}` : ""}`} style={{ animationDelay: `${index * 50}ms` }} onClick={onClick}>
      <span className="strip-label">{label}</span>
      <strong className="strip-value">{formatKpi(animated, format, true)}</strong>
      {caption && <span className="strip-caption">{caption}</span>}
    </button>
  );
}

export function money(value: number) {
  return formatKpi(value, "currency");
}

export function dateBr(iso: string | null) {
  if (!iso) return "—";
  const key = iso.length > 10 ? new Date(iso).toISOString().slice(0, 10) : iso;
  return key.split("-").reverse().join("/");
}

export function Chip({ tone, children }: { tone: "good" | "warn" | "bad" | "info" | "muted"; children: ReactNode }) {
  return <span className={`erp-chip is-${tone}`}>{children}</span>;
}
