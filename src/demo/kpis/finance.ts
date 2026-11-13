import { splitPaymentTerm } from "../../domain/payment/paymentTerm";
import type { DemoTables, Payable } from "../store/types";
import { addDays, isoDate, stableHash } from "../store/ids";

export type Installment = {
  quoteId: string;
  quoteNumber: number;
  customer: string;
  number: number;
  of: number;
  dueDate: string;
  amount: number;
  paidAt: string | null;
};

function parseLocalDate(iso: string): Date {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** Dias de cada parcela conforme o prazo e a forma escolhida no orçamento. */
function termDays(label: string | null, mode: string | null): number[] {
  if (!label) return [0];
  const split = splitPaymentTerm(label);
  if (split) return mode === "single" ? [Number(split.singleDays)] : split.installments.map(Number);
  const days = label.match(/\d+/g)?.map(Number) ?? [];
  return days.length ? days : [0];
}

/** Parcelas de um valor: divisão igual em centavos; a última absorve o arredondamento. */
export function installmentsFor(label: string | null, mode: string | null, total: number, approvedAt: string): { dueDate: string; amount: number }[] {
  const base = parseLocalDate(approvedAt);
  const days = termDays(label, mode);
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / days.length);
  return days.map((day, index) => ({
    dueDate: isoDate(addDays(base, day)),
    amount: (index === days.length - 1 ? cents - each * (days.length - 1) : each) / 100,
  }));
}

/** Contas a receber simuladas a partir dos orçamentos aprovados. */
export function receivables(tables: DemoTables, today: Date): Installment[] {
  const todayKey = isoDate(today);
  const firstItem = new Map<string, string | null>();
  for (const item of tables.quote_items) {
    if (!firstItem.has(item.quote_id) || item.display_order === 0) firstItem.set(item.quote_id, item.payment_term_snapshot);
  }
  const list: Installment[] = [];
  for (const quote of tables.quotes) {
    if (quote.status !== "approved" || !quote.approved_at) continue;
    const parts = installmentsFor(firstItem.get(quote.id) ?? null, quote.payment_mode, quote.grand_total, quote.approved_at);
    parts.forEach((part, index) => {
      const late = stableHash(`${quote.id}:${index}`) % 100 < 8;
      list.push({
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        customer: quote.customer_name_snapshot ?? "Sem cliente",
        number: index + 1,
        of: parts.length,
        dueDate: part.dueDate,
        amount: part.amount,
        paidAt: part.dueDate < todayKey && !late ? part.dueDate : null,
      });
    });
  }
  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function openPayables(tables: DemoTables): Payable[] {
  return tables.payables.filter((payable) => !payable.paidAt);
}
