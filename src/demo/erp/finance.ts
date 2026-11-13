import type { DemoTables } from "../store/types";
import { isoDate, stableHash } from "../store/ids";
import { receivables, type Installment } from "../kpis/finance";
import type { AnticipatedTitle, Bank } from "./types";

const IOF_DAILY = 0.000041; // 0,0041% ao dia
const IOF_EXTRA = 0.0038; // 0,38% adicional

export function titleKey(item: Pick<Installment, "quoteId" | "number">) {
  return `${item.quoteId}:${item.number}`;
}

/** Desconto de duplicata calculado título a título (não pela média), como no borderô do banco. */
export function discountTitle(item: Installment, bank: Bank, date: string): AnticipatedTitle {
  const days = Math.max(1, Math.round((new Date(`${item.dueDate}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000));
  const interest = round(item.amount * (bank.monthlyRate / 100) * (days / 30));
  const iof = round(item.amount * (IOF_DAILY * Math.min(days, 365) + IOF_EXTRA));
  const fee = bank.feePerTitle;
  return { key: titleKey(item), quoteId: item.quoteId, customer: item.customer, dueDate: item.dueDate, amount: item.amount, days, interest, iof, fee, net: round(item.amount - interest - iof - fee) };
}

/** O cálculo antigo (média de prazo e taxa para o lote todo), para mostrar a diferença. */
export function averagedDiscount(items: Installment[], bank: Bank, date: string) {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const avgDays = items.reduce((sum, item) => sum + Math.max(1, (new Date(`${item.dueDate}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000), 0) / items.length;
  return round(total - total * (bank.monthlyRate / 100) * (avgDays / 30) - total * (IOF_DAILY * avgDays + IOF_EXTRA) - bank.feePerTitle * items.length);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function anticipatedKeys(tables: DemoTables) {
  return new Set(tables.erp.anticipations.flatMap((item) => item.titles.map((title) => title.key)));
}

/** Títulos a receber ainda não vencidos e não antecipados. */
export function discountable(tables: DemoTables, today: Date) {
  const done = anticipatedKeys(tables);
  const todayKey = isoDate(today);
  return receivables(tables, today).filter((item) => !item.paidAt && item.dueDate > todayKey && !done.has(titleKey(item)));
}

/** Faturado × já antecipado × livre, por mês de vencimento (a dor da Cláudia). */
export function billingWindow(tables: DemoTables, today: Date, months = 3) {
  const done = anticipatedKeys(tables);
  const all = receivables(tables, today).filter((item) => !item.paidAt);
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1, 12);
    const key = isoDate(date).slice(0, 7);
    const ofMonth = all.filter((item) => item.dueDate.startsWith(key));
    const billed = ofMonth.reduce((sum, item) => sum + item.amount, 0);
    const anticipated = ofMonth.filter((item) => done.has(titleKey(item))).reduce((sum, item) => sum + item.amount, 0);
    return { key, label: date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), billed, anticipated, free: billed - anticipated };
  });
}

/** Score automático do cliente: 0–100, cai com atraso; vermelho a partir de 5 dias. */
export function customerScore(tables: DemoTables, customerId: string, today: Date) {
  const todayKey = isoDate(today);
  const mine = receivables(tables, today).filter((item) => tables.quotes.find((quote) => quote.id === item.quoteId)?.customer_id === customerId);
  const late = mine.filter((item) => !item.paidAt && item.dueDate < todayKey);
  const maxLate = late.reduce((max, item) => Math.max(max, Math.round((new Date(`${todayKey}T12:00:00`).getTime() - new Date(`${item.dueDate}T12:00:00`).getTime()) / 86_400_000)), 0);
  const paid = mine.filter((item) => item.paidAt).length;
  const base = 70 + Math.min(25, paid * 2) + (stableHash(customerId) % 6);
  const score = Math.max(5, Math.min(100, base - maxLate * 3 - late.length * 6));
  const level: "verde" | "amarelo" | "vermelho" = maxLate >= 5 ? "vermelho" : late.length || score < 70 ? "amarelo" : "verde";
  return { score, level, lateTitles: late.length, maxLate, openAmount: mine.filter((item) => !item.paidAt).reduce((sum, item) => sum + item.amount, 0), lateAmount: late.reduce((sum, item) => sum + item.amount, 0) };
}
