import { describe, expect, it } from "vitest";
import { calculateCurrentOrder, calculateOrderWeight, createQuoteSnapshot } from "../../src/domain";

const items = [
  { name: "Ração 40 kg", productIndex: "", paymentTermIndex: "", tableUnitPrice: 56.69, quantity: 40, weightKg: 40, lineDiscountPercentage: 0 },
  { name: "Mineral 30 kg", productIndex: "", paymentTermIndex: "", tableUnitPrice: 150.91, quantity: 15, weightKg: 30, lineDiscountPercentage: 13 },
  { name: "Aves 25 kg", productIndex: "", paymentTermIndex: "", tableUnitPrice: 80, quantity: 7, weightKg: 25, lineDiscountPercentage: 0 },
];

describe("peso da carga do orçamento", () => {
  it("soma sacas × peso da saca de cada item", () => {
    expect(calculateOrderWeight(items)).toEqual({ bags: 62, weightKg: 40 * 40 + 15 * 30 + 7 * 25 });
  });

  it("dá o mesmo peso na Calculadora e no PDF (itens gravados no orçamento)", () => {
    const calculation = calculateCurrentOrder(items, { anticipatedPayment: false, freight: { table: "none" }, handlingEnabled: false, handlingRatePerTon: 40 });
    const snapshot = createQuoteSnapshot({
      items, calculation, products: [], paymentTermLabels: [], anticipatedPayment: false, handlingRatePerTon: 40,
      freight: { tableName: null, zone: null, loadType: null },
    });
    // O PDF lê quantity e weight_kg_snapshot de cada item salvo.
    const pdf = calculateOrderWeight(snapshot.items.map((item) => ({ quantity: item.quantity, weightKg: item.weightKg })));
    expect(pdf.weightKg).toBe(calculation.totalWeightKg);
    expect(pdf.bags).toBe(calculation.totalQuantity);
  });
});
