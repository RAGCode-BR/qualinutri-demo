import type { DateRange } from "../../features/reports/reportPeriod";
import { getDemoViewer } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { isoDate, today } from "../store/ids";
import { validateRange } from "./reportService";

export type VisitsReport = {
  scope: "all" | "own";
  totals: { completed: number; not_done: number; planned: number; overdue: number; customers_visited: number };
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

function countBy<T>(items: T[], key: (item: T) => string | null) {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/** Mesma regra de visits_report: data de realização ou, se não realizada, a agendada. */
export async function loadVisitsReport(range: DateRange, staleDays = 30): Promise<VisitsReport> {
  const viewer = getDemoViewer();
  if (viewer.role !== "administrador" && viewer.role !== "comercial") throw new VisitReportError("Acesso não permitido.");
  validateRange(range, VisitReportError);
  if (staleDays < 1 || staleDays > 365) throw new VisitReportError("Informe de 1 a 365 dias.");
  return simulateLatency(() => {
    const tables = db.read();
    const own = viewer.role === "comercial";
    const todayKey = isoDate(today());
    const period = tables.visits.filter((visit) => {
      const date = visit.visited_date ?? visit.scheduled_date;
      return date !== null && date >= range.from && date <= range.to && (!own || visit.seller_id === viewer.id);
    });
    const completed = period.filter((visit) => visit.status === "completed");
    const sellers = new Map<string, { name: string; completed: number; not_done: number; planned: number }>();
    for (const visit of period) {
      const profile = tables.profiles.find((item) => item.id === visit.seller_id);
      const name = profile ? profile.displayName || profile.login : "Usuário removido";
      const row = sellers.get(name) ?? { name, completed: 0, not_done: 0, planned: 0 };
      if (visit.status === "completed") row.completed += 1;
      if (visit.status === "not_done") row.not_done += 1;
      if (visit.status === "planned") row.planned += 1;
      sellers.set(name, row);
    }
    const closingVisits = completed.filter((visit) => visit.visit_types.includes("closing"));
    const linked = closingVisits.map((visit) => tables.quotes.find((quote) => quote.id === visit.quote_id)).filter((quote) => quote !== undefined);
    const approved = linked.filter((quote) => quote.status === "approved");
    const lastVisits = tables.customers.filter((customer) => customer.active).map((customer) => {
      const dates = tables.visits.filter((visit) => visit.customer_id === customer.id && visit.status === "completed" && visit.visited_date && (!own || visit.seller_id === viewer.id)).map((visit) => visit.visited_date!);
      const last = dates.sort().at(-1) ?? null;
      const days = last ? Math.round((new Date(todayKey).getTime() - new Date(last).getTime()) / 86_400_000) : null;
      return { name: customer.legal_name, last_visit: last, days };
    });
    const stale = lastVisits.filter((row) => row.days === null || row.days > staleDays)
      .sort((a, b) => (a.last_visit ?? "").localeCompare(b.last_visit ?? "") || a.name.localeCompare(b.name, "pt-BR"));
    return {
      scope: own ? "own" : "all",
      totals: {
        completed: completed.length,
        not_done: period.filter((visit) => visit.status === "not_done").length,
        planned: period.filter((visit) => visit.status === "planned").length,
        overdue: period.filter((visit) => visit.status === "planned" && (visit.scheduled_date ?? "") < todayKey).length,
        customers_visited: new Set(completed.map((visit) => visit.customer_id)).size,
      },
      sellers: own ? null : [...sellers.values()].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, "pt-BR")),
      types: countBy(completed.flatMap((visit) => visit.visit_types), (type) => type).map(([type, total]) => ({ type, total })),
      reasons: countBy(period.filter((visit) => visit.status === "not_done"), (visit) => visit.not_done_reason).map(([reason, total]) => ({ reason, total })),
      closings: { closing_visits: closingVisits.length, with_quote: closingVisits.filter((visit) => visit.quote_id).length, approved: approved.length, approved_value: approved.reduce((total, quote) => total + quote.product_subtotal, 0) },
      stale_customers: stale.slice(0, 15),
      stale_total: stale.length,
      stale_days: staleDays,
    };
  });
}
