import { useState } from "react";
import { formatKpi } from "./format";

type AreaChartProps = { values: number[]; labels: string[]; height?: number; onSelect?: (index: number) => void };

/** Gráfico de área responsivo (viewBox), com ponto destacado ao passar o mouse. */
export function AreaChart({ values, labels, height = 150, onSelect }: AreaChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 560;
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => [index * step, height - 18 - (value / max) * (height - 34)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const active = hover ?? values.length - 1;
  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Vendas aprovadas por dia nos últimos 14 dias" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b6e52b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#b6e52b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={width} y1={(height - 18) * ratio} y2={(height - 18) * ratio} className="area-grid" />)}
        <path d={`${line} L${width},${height - 18} L0,${height - 18} Z`} fill="url(#area-fill)" className="area-fill" />
        <path d={line} fill="none" className="area-line" pathLength={1} />
        {points.map(([x], index) => (
          <rect key={index} x={x - step / 2} y="0" width={step} height={height} fill="transparent" style={{ cursor: onSelect ? "pointer" : undefined }} onMouseEnter={() => setHover(index)} onClick={() => onSelect?.(index)} />
        ))}
        <line x1={points[active][0]} x2={points[active][0]} y1="0" y2={height - 18} className="area-cursor" />
        <circle cx={points[active][0]} cy={points[active][1]} r="5" className="area-dot" />
      </svg>
      <div className="area-tip" style={{ left: `${Math.min(78, Math.max(22, (points[active][0] / width) * 100))}%` }}>
        <strong>{formatKpi(values[active], "currency", true)}</strong>
        <span>{labels[active]}{onSelect ? " · clique para ver" : ""}</span>
      </div>
    </div>
  );
}

type BarListProps = { items: { label: string; value: number; sub?: string }[]; format: "currency" | "number" | "tons"; onSelect?: (index: number) => void };

export function BarList({ items, format, onSelect }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), 1);
  if (items.length === 0) return <p className="muted">Sem dados no período.</p>;
  return (
    <ol className="bar-list">
      {items.map((item, index) => (
        <li key={item.label} style={{ animationDelay: `${index * 70}ms` }}>
          <button type="button" onClick={() => onSelect?.(index)}>
            <span className="bar-list-head">
              <span className="bar-list-label"><span className="bar-rank">{index + 1}</span>{item.label}</span>
              <strong>{formatKpi(item.value, format, true)}</strong>
            </span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(item.value / max) * 100}%` }} /></span>
            {item.sub && <small>{item.sub}</small>}
          </button>
        </li>
      ))}
    </ol>
  );
}

type CashflowProps = { weeks: { label: string; incoming: number; outgoing: number }[]; onSelect?: (index: number) => void };

export function CashflowBars({ weeks, onSelect }: CashflowProps) {
  const max = Math.max(...weeks.flatMap((week) => [week.incoming, week.outgoing]), 1);
  return (
    <div className="cashflow">
      {weeks.map((week, index) => (
        <button type="button" className="cashflow-week" key={week.label} onClick={() => onSelect?.(index)} title="Ver contas da semana">
          <div className="cashflow-bars">
            <span className="cashflow-in" style={{ height: `${(week.incoming / max) * 100}%`, animationDelay: `${index * 80}ms` }} title={`Entradas: ${formatKpi(week.incoming, "currency")}`} />
            <span className="cashflow-out" style={{ height: `${(week.outgoing / max) * 100}%`, animationDelay: `${index * 80 + 40}ms` }} title={`Saídas: ${formatKpi(week.outgoing, "currency")}`} />
          </div>
          <small>{week.label}</small>
        </button>
      ))}
    </div>
  );
}
