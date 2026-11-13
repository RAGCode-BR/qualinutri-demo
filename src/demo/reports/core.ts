import type { DemoTables } from "../store/types";
import { addDays, isoDate } from "../store/ids";

export type Fmt = "currency" | "number" | "percent" | "tons" | "kg" | "date" | "text" | "days";

export type ReportFilters = {
  from: string;
  to: string;
  seller: string;
  customer: string;
  product: string;
  group: string;
  city: string;
  status: string;
  vehicle: string;
};
export type FilterKey = Exclude<keyof ReportFilters, "from" | "to">;

/** Para onde leva um clique (linha, barra, fatia, KPI). */
export type Drill =
  | { kind: "quote"; id: string }
  | { kind: "load"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "filter"; key: FilterKey; value: string }
  | { kind: "period"; from: string; to: string };

export const fd = (key: FilterKey, value: string): Drill => ({ kind: "filter", key, value });
export const toQuote = (id: string): Drill => ({ kind: "quote", id });
export const toCustomer = (id: string): Drill => ({ kind: "customer", id });
export const toLoad = (id: string): Drill => ({ kind: "load", id });

export type Column = { key: string; label: string; format?: Fmt };
export type Cell = string | number | null;
export type Row = { [key: string]: Cell | Drill | undefined; _drill?: Drill | null };
/** Valor de uma célula (ignora o _drill). */
export const cell = (row: Row, key: string): Cell => { const value = row[key]; return value === undefined || (typeof value === "object" && value !== null) ? null : value as Cell; };
export type Table = { title: string; columns: Column[]; rows: Row[]; total?: Row };

export type ReportKpi = {
  id: string;
  label: string;
  value: number;
  format: Fmt;
  /** Valor no período anterior de mesmo tamanho (para a variação). */
  previous?: number;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  /** Para KPI de texto (ex.: produto mais vendido). */
  text?: string;
  /** O que abre ao clicar no KPI. */
  detail?: Table;
};

export type ChartPoint = { label: string; value: number; drill?: Drill | null };
export type ChartSpec =
  | { kind: "line"; id: string; title: string; format: Fmt; points: ChartPoint[] }
  | { kind: "bar"; id: string; title: string; format: Fmt; items: ChartPoint[]; horizontal?: boolean }
  | { kind: "donut"; id: string; title: string; format: Fmt; items: ChartPoint[] };

export type ReportResult = { kpis: ReportKpi[]; charts: ChartSpec[]; table: Table; notes?: string[] };

export type Area = "vendas" | "clientes" | "financeiro" | "logistica" | "producao" | "qualidade" | "fiscal";

export type ReportDef = {
  id: string;
  area: Area;
  title: string;
  description: string;
  /** Filtros que fazem sentido neste relatório (o período vale para todos). */
  filters: FilterKey[];
  run: (tables: DemoTables, filters: ReportFilters, today: Date) => ReportResult;
};

export const AREA_LABEL: Record<Area, string> = {
  vendas: "Vendas",
  clientes: "Clientes",
  financeiro: "Financeiro",
  logistica: "Logística e frota",
  producao: "Produção e estoque",
  qualidade: "Qualidade e checklist",
  fiscal: "Fiscal",
};

export const FILTER_LABEL: Record<FilterKey, string> = {
  seller: "Vendedor",
  customer: "Cliente",
  product: "Produto",
  group: "Linha de produto",
  city: "Cidade",
  status: "Situação",
  vehicle: "Veículo",
};

export function defaultFilters(today: Date): ReportFilters {
  return { from: isoDate(addDays(today, -89)), to: isoDate(today), seller: "", customer: "", product: "", group: "", city: "", status: "", vehicle: "" };
}

/* ---------- ajudantes ---------- */

export const localDay = (iso: string | null | undefined) => (iso ? isoDate(new Date(iso)) : "");
export const inPeriod = (iso: string | null | undefined, filters: Pick<ReportFilters, "from" | "to">) => {
  const day = iso && iso.length === 10 ? iso : localDay(iso);
  return !!day && day >= filters.from && day <= filters.to;
};

/** Período anterior com o mesmo número de dias. */
export function previousOf(filters: ReportFilters): ReportFilters {
  const from = new Date(`${filters.from}T12:00:00`);
  const to = new Date(`${filters.to}T12:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return { ...filters, from: isoDate(addDays(from, -days)), to: isoDate(addDays(from, -1)) };
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(`${toIso.slice(0, 10)}T12:00:00`).getTime() - new Date(`${fromIso.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);
}

export const sum = <T>(list: T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);
export const round2 = (value: number) => Math.round(value * 100) / 100;

export function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item); else map.set(k, [item]);
  }
  return map;
}

/** Série no tempo: por dia até 62 dias, por semana até 6 meses, depois por mês. */
export function timeBuckets(filters: Pick<ReportFilters, "from" | "to">): { key: (day: string) => string; buckets: { key: string; label: string; from: string; to: string }[] } {
  const from = new Date(`${filters.from}T12:00:00`);
  const to = new Date(`${filters.to}T12:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const buckets: { key: string; label: string; from: string; to: string }[] = [];
  if (days <= 62) {
    for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
      const key = isoDate(cursor);
      buckets.push({ key, label: cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), from: key, to: key });
    }
    return { key: (day) => day, buckets };
  }
  if (days <= 186) {
    const start = addDays(from, -((from.getDay() + 6) % 7));
    for (let cursor = new Date(start); cursor <= to; cursor = addDays(cursor, 7)) {
      const key = isoDate(cursor);
      buckets.push({ key, label: cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), from: key < filters.from ? filters.from : key, to: isoDate(addDays(cursor, 6)) > filters.to ? filters.to : isoDate(addDays(cursor, 6)) });
    }
    return { key: (day) => { const date = new Date(`${day}T12:00:00`); return isoDate(addDays(date, -((date.getDay() + 6) % 7))); }, buckets };
  }
  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1, 12); cursor <= to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12)) {
    const key = isoDate(cursor).slice(0, 7);
    const last = isoDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12));
    buckets.push({ key, label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), from: `${key}-01` < filters.from ? filters.from : `${key}-01`, to: last > filters.to ? filters.to : last });
  }
  return { key: (day) => day.slice(0, 7), buckets };
}

export function series<T>(list: T[], filters: ReportFilters, day: (item: T) => string, value: (item: T) => number) {
  const { key, buckets } = timeBuckets(filters);
  const totals = new Map<string, number>();
  for (const item of list) {
    const d = day(item);
    if (!d) continue;
    const k = key(d);
    totals.set(k, (totals.get(k) ?? 0) + value(item));
  }
  return buckets.map((bucket) => ({ label: bucket.label, value: round2(totals.get(bucket.key) ?? 0), drill: { kind: "period" as const, from: bucket.from, to: bucket.to } }));
}

/** Maiores N + "Outros" (nunca mais cores do que a paleta tem). */
export function topWithOthers(items: ChartPoint[], limit: number): ChartPoint[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1);
  return [...sorted.slice(0, limit - 1), { label: `Outros (${rest.length})`, value: round2(sum(rest, (item) => item.value)), drill: null }];
}

/* ---------- dimensões comuns ---------- */

export function sellerName(tables: DemoTables, id: string | null) {
  const user = tables.profiles.find((profile) => profile.id === id);
  return user ? user.displayName || user.login : "Sem vendedor";
}

export function customerCity(tables: DemoTables, customerId: string | null) {
  const customer = customerId ? tables.customers.find((item) => item.id === customerId) : undefined;
  const address = customer?.address && typeof customer.address === "object" && !Array.isArray(customer.address) ? customer.address as Record<string, string | null> : {};
  return address.city ?? "Sem cidade";
}

export function productGroup(tables: DemoTables, productName: string, category: string | null) {
  return tables.catalog.products.find((product) => product.name === productName)?.group ?? category ?? "Outros";
}
