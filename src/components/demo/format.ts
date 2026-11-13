import type { KpiFormat } from "../../demo/kpis/dashboard";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatKpi(value: number, format: KpiFormat | "date" | "text" | undefined, compact = false): string {
  if (format === "currency") return compact && Math.abs(value) >= 100_000 ? compactCurrency.format(value) : currency.format(value);
  if (format === "percent") return `${number.format(value)}%`;
  if (format === "tons") return `${number.format(value)} t`;
  return number.format(value);
}

export function formatCell(value: string | number | null, format: KpiFormat | "date" | "text" | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "date" && typeof value === "string") {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  if (typeof value === "number") return formatKpi(value, format);
  return value;
}
