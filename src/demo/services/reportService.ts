import type { DateRange } from "../../features/reports/reportPeriod";
import { getDemoViewer } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { isoDate } from "../store/ids";

export type RankingRow = { name: string; revenue: number; orders: number; bags?: number };

export type SalesReport = {
  scope: "all" | "own";
  totals: { revenue: number; orders: number; bags: number };
  customers: RankingRow[];
  products: RankingRow[];
  categories: RankingRow[];
  sellers: RankingRow[] | null;
};

export class ReportServiceError extends Error {
  constructor(message = "Não foi possível carregar o relatório.") {
    super(message);
    this.name = "ReportServiceError";
  }
}

export function validateRange(range: DateRange, ErrorType: new (message?: string) => Error) {
  if (!range.from || !range.to || range.to < range.from) throw new ErrorType("Período inválido.");
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  if (days > 366) throw new ErrorType("Escolha um período de até um ano.");
}

function top(map: Map<string, RankingRow>) {
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

/** Mesma regra de sales_report: aprovados no período, valor dos produtos (sem frete e chapa). */
export async function loadSalesReport(range: DateRange): Promise<SalesReport> {
  const viewer = getDemoViewer();
  if (viewer.role !== "administrador" && viewer.role !== "comercial") throw new ReportServiceError("Acesso não permitido.");
  validateRange(range, ReportServiceError);
  return simulateLatency(() => {
    const tables = db.read();
    const own = viewer.role === "comercial";
    const sold = tables.quotes.filter((quote) => quote.status === "approved" && quote.approved_at
      && isoDate(new Date(quote.approved_at)) >= range.from && isoDate(new Date(quote.approved_at)) <= range.to
      && (!own || quote.created_by === viewer.id));
    const soldIds = new Set(sold.map((quote) => quote.id));
    const items = tables.quote_items.filter((item) => soldIds.has(item.quote_id));
    const customers = new Map<string, RankingRow>();
    const sellers = new Map<string, RankingRow>();
    for (const quote of sold) {
      const name = quote.customer_name_snapshot?.trim() || "Sem cliente vinculado";
      const key = `${quote.customer_id ?? "none"}|${name}`;
      const row = customers.get(key) ?? { name, revenue: 0, orders: 0 };
      row.revenue += quote.product_subtotal;
      row.orders += 1;
      customers.set(key, row);
      const profile = tables.profiles.find((item) => item.id === quote.created_by);
      const sellerName = profile ? profile.displayName || profile.login : "Usuário removido";
      const seller = sellers.get(sellerName) ?? { name: sellerName, revenue: 0, orders: 0 };
      seller.revenue += quote.product_subtotal;
      seller.orders += 1;
      sellers.set(sellerName, seller);
    }
    const group = (key: (item: (typeof items)[number]) => string) => {
      const map = new Map<string, RankingRow & { quotes: Set<string> }>();
      for (const item of items) {
        const name = key(item);
        const row = map.get(name) ?? { name, revenue: 0, orders: 0, bags: 0, quotes: new Set<string>() };
        row.revenue += item.product_subtotal;
        row.bags = (row.bags ?? 0) + item.quantity;
        row.quotes.add(item.quote_id);
        map.set(name, row);
      }
      return [...map.values()].map(({ quotes, ...row }) => ({ ...row, orders: quotes.size })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    };
    return {
      scope: own ? "own" : "all",
      totals: { revenue: sold.reduce((total, quote) => total + quote.product_subtotal, 0), orders: sold.length, bags: items.reduce((total, item) => total + item.quantity, 0) },
      customers: top(customers),
      products: group((item) => item.product_name_snapshot),
      categories: group((item) => item.category_name_snapshot?.trim() || "Sem categoria"),
      sellers: own ? null : top(sellers),
    };
  });
}
