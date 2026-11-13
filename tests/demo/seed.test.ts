import { expect, test } from "vitest";
import { buildSeed } from "../../src/demo/seed";
import { calculateCurrentOrder } from "../../src/domain/order/calculateOrder";
import { validateDocument } from "../../src/domain/documents/brazilianDocument";

const today = new Date(2026, 10, 13, 10, 0, 0);

test("determinístico", () => {
  expect(JSON.stringify(buildSeed(today))).toBe(JSON.stringify(buildSeed(today)));
});

test("totais coerentes com o domínio", () => {
  const seed = buildSeed(today);
  for (const quote of seed.quotes) {
    const items = seed.quote_items.filter((item) => item.quote_id === quote.id);
    expect(items.length).toBeGreaterThan(0);
    const sum = items.reduce((total, item) => total + item.total, 0);
    expect(Math.abs(sum - quote.grand_total)).toBeLessThan(0.01);
    const recalculated = calculateCurrentOrder(
      items.map((item) => ({ name: item.product_name_snapshot, tableUnitPrice: item.table_unit_price, quantity: item.quantity, weightKg: item.weight_kg_snapshot, lineDiscountPercentage: item.line_discount_percentage })),
      { anticipatedPayment: quote.anticipated_payment, freight: { table: "none" }, handlingEnabled: false, handlingRatePerTon: 0 },
    );
    expect(Math.abs(recalculated.productSubtotal - quote.product_subtotal)).toBeLessThan(0.01);
  }
});

test("datas relativas a hoje", () => {
  const seed = buildSeed(today);
  expect(seed.quotes.length).toBeGreaterThanOrEqual(130);
  expect(seed.quotes.every((quote) => new Date(quote.created_at) <= today)).toBe(true);
  const approvedToday = seed.quotes.filter((quote) => quote.approved_at && new Date(quote.approved_at).toDateString() === today.toDateString());
  expect(approvedToday.length).toBeGreaterThanOrEqual(2);
});

test("sem catálogo real", () => {
  const text = JSON.stringify(buildSeed(today));
  for (const forbidden of ["Quali Engorda 160 RM", "Regras comerciais das vendas diretas da fábrica Qualinutri", "Brasnorte até 35 km"]) {
    expect(text).not.toContain(forbidden);
  }
});

test("documentos válidos", () => {
  const seed = buildSeed(today);
  expect(seed.customers.length).toBe(45);
  for (const customer of seed.customers) expect(validateDocument(customer.document).valid).toBe(true);
});
