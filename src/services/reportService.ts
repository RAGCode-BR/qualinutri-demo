import { supabase } from "../lib/supabase";
import type { DateRange } from "../features/reports/reportPeriod";

export type RankingRow = {
  name: string;
  revenue: number;
  orders: number;
  bags?: number;
};

export type SalesReport = {
  /** "own": perfil comercial, só os próprios orçamentos. */
  scope: "all" | "own";
  totals: { revenue: number; orders: number; bags: number };
  customers: RankingRow[];
  products: RankingRow[];
  categories: RankingRow[];
  /** Ausente para o perfil comercial. */
  sellers: RankingRow[] | null;
};

export class ReportServiceError extends Error {
  constructor(message = "Não foi possível carregar o relatório.") {
    super(message);
    this.name = "ReportServiceError";
  }
}

type RawRow = { name: string; revenue: number | string; orders: number | string; bags?: number | string };

function toRows(rows: RawRow[] | null | undefined): RankingRow[] {
  return (rows ?? []).map((row) => ({
    name: row.name,
    revenue: Number(row.revenue),
    orders: Number(row.orders),
    ...(row.bags !== undefined && { bags: Number(row.bags) }),
  }));
}

/** Rankings de orçamentos aprovados no período (datas inclusivas). */
export async function loadSalesReport(range: DateRange): Promise<SalesReport> {
  if (!supabase) throw new ReportServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  const { data, error } = await supabase.rpc("sales_report", { p_from: range.from, p_to: range.to });
  if (error || !data || typeof data !== "object") {
    throw new ReportServiceError(error?.code === "22023" && error.message ? error.message : undefined);
  }
  const raw = data as {
    scope: "all" | "own";
    totals: { revenue: number | string; orders: number | string; bags: number | string };
    customers: RawRow[];
    products: RawRow[];
    categories: RawRow[];
    sellers: RawRow[] | null;
  };
  return {
    scope: raw.scope,
    totals: { revenue: Number(raw.totals.revenue), orders: Number(raw.totals.orders), bags: Number(raw.totals.bags) },
    customers: toRows(raw.customers),
    products: toRows(raw.products),
    categories: toRows(raw.categories),
    sellers: raw.sellers === null ? null : toRows(raw.sellers),
  };
}
