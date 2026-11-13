import type { DragEvent, KeyboardEvent } from "react";
import { GripVertical, TrendingDown, TrendingUp } from "lucide-react";
import type { Kpi } from "../../demo/kpis/dashboard";
import { formatKpi } from "./format";
import { Sparkline } from "./Sparkline";
import { useCountUp } from "./useCountUp";

type KpiCardProps = {
  kpi: Kpi;
  index: number;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
  onMove: (delta: -1 | 1) => void;
};

export function KpiCard({ kpi, index, dragging, onOpen, onDragStart, onDragOver, onDrop, onDragEnd, onMove }: KpiCardProps) {
  const animated = useCountUp(kpi.value);
  const change = kpi.previous ? ((kpi.value - kpi.previous) / Math.abs(kpi.previous)) * 100 : null;
  const good = change === null ? null : kpi.higherIsWorse ? change <= 0 : change >= 0;

  function handleKey(event: KeyboardEvent) {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onMove(-1); }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onMove(1); }
  }

  return (
    <article
      className={`kpi-card${dragging ? " is-dragging" : ""}${kpi.id === "overdue" && kpi.value > 0 ? " is-alert" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="kpi-card-main" onClick={onOpen}>
        <span className="kpi-card-label">
          {kpi.label}
          {kpi.simulated && <span className="kpi-sim">simulado</span>}
        </span>
        <strong className="kpi-card-value">{formatKpi(animated, kpi.format, true)}</strong>
        <span className="kpi-card-foot">
          {change !== null && Number.isFinite(change) && (
            <span className={`kpi-change ${good ? "is-good" : "is-bad"}`}>
              {change >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
              {Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
            </span>
          )}
          {kpi.caption && <span className="kpi-caption">{kpi.caption}</span>}
        </span>
        {kpi.trend.length > 1 && <Sparkline values={kpi.trend} />}
      </button>
      <button type="button" className="kpi-grip" aria-label={`Mover cartão ${kpi.label} (setas)`} onKeyDown={handleKey}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
    </article>
  );
}
