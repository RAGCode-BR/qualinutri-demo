import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
import type { QuoteSnapshot } from "../../src/types/quote";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

async function snapshotFor(customerId: string | null): Promise<QuoteSnapshot> {
  const { db } = await import("../../src/demo/store/db");
  const existing = db.read().quotes[0];
  const { getQuote } = await import("../../src/demo/services/quoteService");
  const detail = await getQuote(existing.id);
  return {
    status: "draft", calculationVersion: "legacy-html-v1", customerId, customerName: customerId ? "Cliente Teste" : null, customerDocument: null,
    priceTableId: null, discountTableId: null, freightTableId: null, handlingRateTableId: null, policyVersionId: null,
    anticipatedPayment: false, anticipatedDiscountPercentage: 0, freightTableName: null, freightZone: null, loadType: null, handlingRatePerTon: 0,
    productSubtotal: 1000, freightTotal: 0, handlingTotal: 0, economyTotal: 0, grandTotal: 1000, notes: "obs", paymentMode: null,
    items: [{ ...{ displayOrder: 0, productId: detail.items[0].product_id, paymentTermId: null, discountRuleId: null, productName: "Produto X", categoryName: "Rações", weightKg: 40, paymentTerm: "À vista", tableUnitPrice: 100, quantity: 10, lineDiscountPercentage: 0, anticipatedDiscountPercentage: 0, totalDiscountPercentage: 0, finalUnitPrice: 100, economyPerUnit: 0, freightPerUnit: 0, handlingPerUnit: 0, productSubtotal: 1000, freightSubtotal: 0, handlingSubtotal: 0, total: 1000 } }],
  };
}

test("createQuote aparece em listQuotes com número novo", async () => {
  const quotes = await import("../../src/demo/services/quoteService");
  const saved = await quotes.createQuote(await snapshotFor(null));
  const list = await quotes.listQuotes();
  expect(list[0].id).toBe(saved.id);
  expect(list[0].quote_number).toBe(saved.quote_number);
  expect((await quotes.getQuote(saved.id)).items).toHaveLength(1);
  expect((await quotes.listQuotes({ number: saved.quote_number })).map((q) => q.id)).toEqual([saved.id]);
});

test("fluxo de situação", async () => {
  const quotes = await import("../../src/demo/services/quoteService");
  const saved = await quotes.createQuote(await snapshotFor(null));
  await expect(quotes.advanceQuoteStatus(saved.id, "approved")).rejects.toThrow();
  await quotes.advanceQuoteStatus(saved.id, "issued");
  await quotes.advanceQuoteStatus(saved.id, "approved");
  const { quote } = await quotes.getQuote(saved.id);
  expect(quote.status).toBe("approved");
  expect(quote.issued_at).not.toBeNull();
  expect(quote.approved_at).not.toBeNull();
  await expect(quotes.updateQuote(saved.id, await snapshotFor(null))).rejects.toThrow();
  await quotes.cancelQuote(saved.id);
  expect((await quotes.getQuote(saved.id)).quote.status).toBe("cancelled");
  await expect(quotes.cancelQuote(saved.id)).rejects.toThrow();
});

test("comercial não altera orçamento de outro", async () => {
  const { setDemoRole } = await import("../../src/demo/app/session");
  const quotes = await import("../../src/demo/services/quoteService");
  const saved = await quotes.createQuote(await snapshotFor(null));
  setDemoRole("comercial");
  await expect(quotes.cancelQuote(saved.id)).rejects.toThrow("Só quem criou");
  setDemoRole("administrador");
});

test("duplicar copia observações e vira rascunho", async () => {
  const quotes = await import("../../src/demo/services/quoteService");
  const saved = await quotes.createQuote(await snapshotFor(null));
  const copy = await quotes.duplicateQuote(saved.id);
  const { quote } = await quotes.getQuote(copy.id);
  expect(quote.status).toBe("draft");
  expect(quote.notes).toBe("obs");
});

test("cliente duplicado e listagem", async () => {
  const customers = await import("../../src/demo/services/customerService");
  const list = await customers.listCustomers();
  expect(list.every((c) => c.active)).toBe(true);
  expect([...list.map((c) => c.legal_name)]).toEqual([...list.map((c) => c.legal_name)].sort((a, b) => a.localeCompare(b, "pt-BR")));
  expect(list[0].city).toBeTruthy();
  await expect(customers.createCustomer({ legalName: "Outro", document: list[0].document })).rejects.toThrow("Já existe um cliente ativo");
  const created = await customers.createCustomer({ legalName: "Fazenda Nova Demo", document: null, phone: "(66) 99999-1234" });
  expect((await customers.listCustomers()).some((c) => c.id === created.id)).toBe(true);
  await customers.deactivateCustomer(created.id);
  expect((await customers.listCustomers()).some((c) => c.id === created.id)).toBe(false);
});
