import { useId } from "react";

type SparklineProps = { values: number[]; width?: number; height?: number; tone?: "light" | "dark" };

/** Minigráfico de linha com área, sem eixos. */
export function Sparkline({ values, width = 120, height = 36, tone = "light" }: SparklineProps) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 3 - (value / max) * (height - 6)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const stroke = tone === "dark" ? "#b6e52b" : "#1a7038";
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path className="sparkline-line" d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="3" fill={stroke} />
    </svg>
  );
}
