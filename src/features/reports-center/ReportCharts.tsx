import { useLayoutEffect, useRef, useState } from "react";
import type { ChartPoint, ChartSpec, Drill, Fmt } from "../../demo/reports/core";
import { formatValue } from "../../demo/reports/export";

/** Paleta categórica validada (verde da marca primeiro); a ordem é fixa e nunca cicla. */
export const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)"];

export function compact(value: number, format: Fmt) {
  const abs = Math.abs(value);
  const short = (n: number) => abs >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : abs >= 1_000 ? `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (format === "currency") return `R$ ${short(value)}`;
  if (format === "percent") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  if (format === "tons") return `${short(value)} t`;
  return short(value);
}

type ChartProps = { chart: ChartSpec; onDrill?: (drill: Drill) => void; still?: boolean };

export function ReportChart({ chart, onDrill, still = false }: ChartProps) {
  const empty = chart.kind === "line" ? chart.points.every((point) => !point.value) : chart.items.every((item) => !item.value);
  return (
    <figure className={`rc-chart is-${chart.kind}${chart.kind === "bar" && chart.horizontal ? " is-horizontal" : ""}`}>
      <figcaption>{chart.title}</figcaption>
      {empty ? <p className="rc-empty">Sem dados para os filtros escolhidos.</p>
        : chart.kind === "line" ? <LineChart points={chart.points} format={chart.format} onDrill={onDrill} still={still} />
        : chart.kind === "donut" ? <Donut items={chart.items} format={chart.format} onDrill={onDrill} still={still} />
        : chart.horizontal ? <HBars items={chart.items} format={chart.format} onDrill={onDrill} />
        : <VBars items={chart.items} format={chart.format} onDrill={onDrill} still={still} />}
    </figure>
  );
}

/** Largura real do gráfico (o desenho usa a largura medida e altura fixa; o texto não estica). */
function useWidth(fixed: boolean, fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || fixed) return;
    const measure = () => setWidth(Math.max(260, Math.round(element.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fixed]);
  return [ref, width] as const;
}

function Tooltip({ x, y, title, value }: { x: number; y: number; title: string; value: string }) {
  return <div className="rc-tooltip" style={{ left: x, top: y }} role="status"><span>{title}</span><strong>{value}</strong></div>;
}

function niceMax(max: number) {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * exp;
}

function LineChart({ points, format, onDrill, still }: { points: ChartPoint[]; format: Fmt; onDrill?: (drill: Drill) => void; still: boolean }) {
  const [ref, W] = useWidth(still, 720);
  const [hover, setHover] = useState<number | null>(null);
  const H = 230, L = 64, R = 14, T = 12, B = 28;
  const max = niceMax(Math.max(...points.map((point) => point.value), 0));
  const min = Math.min(0, ...points.map((point) => point.value));
  const x = (index: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (index / (points.length - 1)) * (W - L - R));
  const y = (value: number) => T + (1 - (value - min) / (max - min || 1)) * (H - T - B);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
  const area = `${path}L${x(points.length - 1).toFixed(1)},${y(min)}L${x(0).toFixed(1)},${y(min)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);
  const every = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor(W / 90))));

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const index = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  }

  const point = hover !== null ? points[hover] : null;
  return (
    <div className="rc-plot" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de linha" onPointerMove={still ? undefined : onMove} onPointerLeave={() => setHover(null)} onClick={() => { if (point?.drill && onDrill) onDrill(point.drill); }} style={{ cursor: point?.drill && onDrill ? "pointer" : undefined }}>
        {ticks.map((tick) => <g key={tick}><line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className="rc-grid" /><text x={L - 8} y={y(tick) + 4} className="rc-axis" textAnchor="end">{compact(tick, format)}</text></g>)}
        <path d={area} className="rc-line-fill" />
        <path d={path} className="rc-line" />
        {points.map((p, index) => index % every === 0 || index === points.length - 1 ? <text key={index} x={x(index)} y={H - 8} className="rc-axis" textAnchor="middle">{p.label}</text> : null)}
        {point && hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="rc-cross" />
          <circle cx={x(hover)} cy={y(point.value)} r={5} className="rc-dot" />
        </>}
      </svg>
      {point && hover !== null && <Tooltip x={x(hover)} y={y(point.value)} title={point.label} value={formatValue(point.value, format)} />}
    </div>
  );
}

function VBars({ items, format, onDrill, still }: { items: ChartPoint[]; format: Fmt; onDrill?: (drill: Drill) => void; still: boolean }) {
  const [ref, W] = useWidth(still, 420);
  const [hover, setHover] = useState<number | null>(null);
  const H = 230, L = 64, R = 8, T = 18, B = 30;
  const max = niceMax(Math.max(...items.map((item) => item.value), 0));
  const min = Math.min(0, ...items.map((item) => item.value));
  const span = max - min || 1;
  const band = (W - L - R) / items.length;
  const bar = Math.min(56, band * 0.62);
  const y = (value: number) => T + (1 - (value - min) / span) * (H - T - B);
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const showLabels = items.length <= 8 && band > 56;
  const maxChars = Math.max(4, Math.floor(band / 7));
  return (
    <div className="rc-plot" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras">
        {ticks.map((tick) => <g key={tick}><line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className="rc-grid" /><text x={L - 8} y={y(tick) + 4} className="rc-axis" textAnchor="end">{compact(tick, format)}</text></g>)}
        {items.map((item, index) => {
          const cx = L + band * index + band / 2;
          const top = y(Math.max(0, item.value));
          const height = Math.max(1, Math.abs(y(item.value) - y(0)));
          const clickable = !!(item.drill && onDrill);
          return (
            <g key={item.label} onPointerEnter={() => !still && setHover(index)} onPointerLeave={() => setHover(null)} onClick={() => { if (item.drill && onDrill) onDrill(item.drill); }} style={{ cursor: clickable ? "pointer" : undefined }}>
              <rect x={cx - band / 2} y={T} width={band} height={H - T - B} fill="transparent" />
              <path d={roundedBar(cx - bar / 2, item.value >= 0 ? top : y(0), bar, height, item.value >= 0)} className={`rc-bar${item.value < 0 ? " is-negative" : ""}${hover === index ? " is-hover" : ""}`} />
              {showLabels && <text x={cx} y={item.value >= 0 ? top - 5 : top + height + 12} className="rc-value" textAnchor="middle">{compact(item.value, format)}</text>}
              <text x={cx} y={H - 10} className="rc-axis" textAnchor="middle">{item.label.length > maxChars ? `${item.label.slice(0, maxChars - 1)}…` : item.label}</text>
              {hover === index && <title>{`${item.label}: ${formatValue(item.value, format)}`}</title>}
            </g>
          );
        })}
      </svg>
      {hover !== null && <div className="rc-bar-tip" role="status"><span>{items[hover].label}</span><strong>{formatValue(items[hover].value, format)}</strong>{items[hover].drill && onDrill && <small>clique para filtrar</small>}</div>}
    </div>
  );
}

function roundedBar(x: number, y: number, w: number, h: number, up: boolean) {
  const r = Math.min(4, w / 2, h);
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

function HBars({ items, format, onDrill }: { items: ChartPoint[]; format: Fmt; onDrill?: (drill: Drill) => void }) {
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  return (
    <ul className="rc-hbars">
      {items.map((item) => {
        const clickable = !!(item.drill && onDrill);
        const content = (
          <>
            <span className="rc-hbar-label" title={item.label}>{item.label}</span>
            <span className="rc-hbar-track"><i className={item.value < 0 ? "is-negative" : undefined} style={{ width: `${Math.max(1, (Math.abs(item.value) / max) * 100)}%` }} /></span>
            <strong>{formatValue(item.value, format)}</strong>
          </>
        );
        return <li key={item.label}>{clickable ? <button type="button" onClick={() => onDrill!(item.drill!)} title="Clique para filtrar ou abrir">{content}</button> : <div>{content}</div>}</li>;
      })}
    </ul>
  );
}

function Donut({ items, format, onDrill, still }: { items: ChartPoint[]; format: Fmt; onDrill?: (drill: Drill) => void; still: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const visible = items.filter((item) => item.value > 0);
  const total = visible.reduce((sum, item) => sum + item.value, 0) || 1;
  const R = 80, r = 52, C = 100;
  let angle = -Math.PI / 2;
  const arcs = visible.map((item) => {
    const sweep = (item.value / total) * Math.PI * 2;
    const gap = visible.length > 1 ? 0.02 : 0;
    const a0 = angle + gap / 2, a1 = angle + sweep - gap / 2;
    angle += sweep;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, radius: number) => `${(C + radius * Math.cos(rad)).toFixed(2)},${(C + radius * Math.sin(rad)).toFixed(2)}`;
    const d = visible.length === 1
      ? `M${C},${C - R}A${R},${R} 0 1 1 ${C - 0.01},${C - R}L${C - 0.01},${C - r}A${r},${r} 0 1 0 ${C},${C - r}Z`
      : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
    return { item, d };
  });
  const focus = hover !== null ? visible[hover] : null;
  return (
    <div className="rc-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de rosca">
        {arcs.map(({ item, d }, index) => (
          <path key={item.label} d={d} fill={VIZ[index % VIZ.length]} className={`rc-slice${hover !== null && hover !== index ? " is-dim" : ""}`} onPointerEnter={() => !still && setHover(index)} onPointerLeave={() => setHover(null)} onClick={() => { if (item.drill && onDrill) onDrill(item.drill); }} style={{ cursor: item.drill && onDrill ? "pointer" : undefined }} />
        ))}
        <text x={C} y={C - 4} textAnchor="middle" className="rc-donut-value">{focus ? `${Math.round((focus.value / total) * 100)}%` : compact(total, format)}</text>
        <text x={C} y={C + 14} textAnchor="middle" className="rc-donut-caption">{focus ? (focus.label.length > 16 ? `${focus.label.slice(0, 15)}…` : focus.label) : "total"}</text>
      </svg>
      <ul className="rc-legend">
        {visible.map((item, index) => (
          <li key={item.label} onPointerEnter={() => !still && setHover(index)} onPointerLeave={() => setHover(null)} className={hover === index ? "is-hover" : undefined}>
            <button type="button" disabled={!item.drill || !onDrill} onClick={() => { if (item.drill && onDrill) onDrill(item.drill); }}>
              <i style={{ background: VIZ[index % VIZ.length] }} aria-hidden="true" />
              <span>{item.label}</span>
              <strong>{formatValue(item.value, format)}</strong>
              <small>{Math.round((item.value / total) * 100)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
