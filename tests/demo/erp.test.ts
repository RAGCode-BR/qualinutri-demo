import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 10);
beforeEach(async () => { installMemoryStorage(); vi.resetModules(); (await import("../../src/demo/store/ids")).setToday(today); });

test("desconto de duplicata é calculado título a título", async () => {
  const { discountTitle } = await import("../../src/demo/erp/finance");
  const bank = { id: "sicoob" as const, name: "Sicoob", balance: 0, monthlyRate: 1.8, feePerTitle: 4 };
  const item = { quoteId: "q", quoteNumber: 1, customer: "C", number: 1, of: 1, dueDate: "2026-12-13", amount: 10_000, paidAt: null };
  const title = discountTitle(item, bank, "2026-11-13");
  expect(title.days).toBe(30);
  expect(title.interest).toBe(180);
  expect(title.iof).toBeCloseTo(10_000 * (0.000041 * 30 + 0.0038), 2);
  expect(title.net).toBeCloseTo(10_000 - 180 - title.iof - 4, 2);
});

test("antecipar marca os títulos e soma no painel faturado × antecipado", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { discountable, billingWindow, titleKey } = await import("../../src/demo/erp/finance");
  const { anticipate } = await import("../../src/demo/erp/service");
  const before = billingWindow(db.read(), today);
  const pick = discountable(db.read(), today).slice(0, 2);
  const result = await anticipate(pick.map(titleKey), "itau");
  expect(result.titles).toHaveLength(2);
  expect(discountable(db.read(), today).some((item) => pick.some((p) => titleKey(p) === titleKey(item)))).toBe(false);
  const after = billingWindow(db.read(), today);
  const sum = (rows: typeof after) => rows.reduce((total, row) => total + row.anticipated, 0);
  expect(sum(after) - sum(before)).toBeCloseTo(pick.reduce((total, item) => total + item.amount, 0), 2);
});

test("NF-e é bloqueada quando a inscrição estadual está irregular", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { emitInvoice } = await import("../../src/demo/erp/service");
  const tables = db.read();
  const irregular = tables.erp.ie.find((item) => item.status !== "ativa")!;
  const quote = tables.quotes.find((item) => item.status === "approved" && item.customer_id === irregular.customerId && !tables.erp.invoices.some((invoice) => invoice.quoteId === item.id));
  if (quote) await expect(emitInvoice(quote.id)).rejects.toThrow("inscrição estadual");
  const ok = tables.quotes.find((item) => item.status === "approved" && tables.erp.ie.find((ie) => ie.customerId === item.customer_id)?.status === "ativa" && !tables.erp.invoices.some((invoice) => invoice.quoteId === item.id))!;
  const invoice = await emitInvoice(ok.id);
  expect(invoice.status).toBe("autorizada");
});

test("score fica vermelho com 5 dias de atraso", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { customerScore } = await import("../../src/demo/erp/finance");
  const { receivables } = await import("../../src/demo/kpis/finance");
  const tables = db.read();
  const late = receivables(tables, today).find((item) => !item.paidAt && (today.getTime() - new Date(`${item.dueDate}T12:00:00`).getTime()) / 86_400_000 >= 5);
  if (!late) return;
  const customerId = tables.quotes.find((quote) => quote.id === late.quoteId)!.customer_id!;
  expect(customerScore(tables, customerId, today).level).toBe("vermelho");
});
