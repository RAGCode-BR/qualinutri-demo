import { supabase } from "../lib/supabase";
import type { DateRange } from "../features/reports/reportPeriod";

export type VisitsReport = {
  scope: "all" | "own";
  totals: { completed: number; not_done: number; planned: number; overdue: number; customers_visited: number };
  /** Ausente para o perfil comercial. */
  sellers: Array<{ name: string; completed: number; not_done: number; planned: number }> | null;
  types: Array<{ type: string; total: number }>;
  reasons: Array<{ reason: string; total: number }>;
  closings: { closing_visits: number; with_quote: number; approved: number; approved_value: number };
  stale_customers: Array<{ name: string; last_visit: string | null; days: number | null }>;
  stale_total: number;
  stale_days: number;
};

export class VisitReportError extends Error {
  constructor(message = "Não foi possível carregar o relatório de visitação.") {
    super(message);
    this.name = "VisitReportError";
  }
}

export async function loadVisitsReport(range: DateRange, staleDays = 30): Promise<VisitsReport> {
  if (!supabase) throw new VisitReportError("O sistema está sem conexão com o servidor. Contate o administrador.");
  const { data, error } = await supabase.rpc("visits_report", { p_from: range.from, p_to: range.to, p_stale_days: staleDays });
  if (error || !data || typeof data !== "object") {
    throw new VisitReportError(error?.code === "22023" && error.message ? error.message : undefined);
  }
  const raw = data as unknown as VisitsReport;
  const num = (value: unknown) => Number(value ?? 0);
  return {
    ...raw,
    totals: {
      completed: num(raw.totals.completed), not_done: num(raw.totals.not_done), planned: num(raw.totals.planned),
      overdue: num(raw.totals.overdue), customers_visited: num(raw.totals.customers_visited),
    },
    sellers: raw.sellers?.map((seller) => ({ ...seller, completed: num(seller.completed), not_done: num(seller.not_done), planned: num(seller.planned) })) ?? null,
    types: raw.types.map((row) => ({ ...row, total: num(row.total) })),
    reasons: raw.reasons.map((row) => ({ ...row, total: num(row.total) })),
    closings: {
      closing_visits: num(raw.closings.closing_visits), with_quote: num(raw.closings.with_quote),
      approved: num(raw.closings.approved), approved_value: num(raw.closings.approved_value),
    },
    stale_customers: raw.stale_customers.map((row) => ({ ...row, days: row.days === null ? null : num(row.days) })),
    stale_total: num(raw.stale_total),
  };
}
