import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("updateProduct reflete em loadCommercialData", async () => {
  const { loadCommercialData } = await import("../../src/demo/services/commercialDataService");
  const { updateProduct } = await import("../../src/demo/services/productService");
  const before = await loadCommercialData();
  const target = before.products[0];
  await updateProduct(target.id!, { name: "Ração Editada", weightKg: 30, prices: before.paymentTermIds!.map((id, index) => ({ paymentTermId: id, unitPrice: 100 + index })) });
  const after = await loadCommercialData();
  const edited = after.products.find((product) => product.id === target.id)!;
  expect(edited.name).toBe("Ração Editada");
  expect(edited.weightKg).toBe(30);
  expect(edited.prices).toEqual([100, 101, 102, 103]);
  expect(after.paymentTerms[0].label).toBe("À vista antecipado");
});

test("deactivateProduct remove da lista", async () => {
  const { loadCommercialData } = await import("../../src/demo/services/commercialDataService");
  const { deactivateProduct } = await import("../../src/demo/services/productService");
  const before = await loadCommercialData();
  await deactivateProduct(before.products[0].id!);
  const after = await loadCommercialData();
  expect(after.products.length).toBe(before.products.length - 1);
  expect(after.rationProducts.length + after.mineralProducts.length).toBe(after.products.length);
});

test("saveDiscountRule sem id insere antes do personalizado", async () => {
  const { loadCommercialData } = await import("../../src/demo/services/commercialDataService");
  const { saveDiscountRule } = await import("../../src/demo/services/discountService");
  await saveDiscountRule(null, "Nova linha", 7);
  const lines = (await loadCommercialData()).discountLines;
  expect(lines.at(-1)!.percentage).toBeNull();
  expect(lines.at(-2)!.name).toBe("Nova linha");
});

test("saveFreightZone regional nova aparece", async () => {
  const { loadCommercialData } = await import("../../src/demo/services/commercialDataService");
  const { saveFreightZone, saveHandlingRate } = await import("../../src/demo/services/freightService");
  await saveFreightZone("regional", null, "Nova Cidade", { fractionalPerTon: null, closedPerTon: 150 });
  await saveHandlingRate(55);
  const data = await loadCommercialData();
  expect(data.regionalFreightRates.at(-1)).toMatchObject({ location: "Nova Cidade", fractionalPerTon: null, closedPerTon: 150 });
  expect(data.handlingRatePerTon).toBe(55);
});

test("nome de desconto duplicado é recusado", async () => {
  const { saveDiscountRule } = await import("../../src/demo/services/discountService");
  await expect(saveDiscountRule(null, "Linha Núcleos", 2)).rejects.toThrow("Já existe");
});
