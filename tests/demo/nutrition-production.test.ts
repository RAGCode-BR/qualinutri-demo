import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(async () => {
  installMemoryStorage();
  vi.resetModules();
  (await import("../../src/demo/store/ids")).setToday(new Date(2026, 10, 13));
});

test("mantém as tabelas existentes ao inicializar nutrição e vincula snapshot à ordem", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { nutritionState, publishProduction } = await import("../../src/demo/nutrition/service");
  const { advanceOrder } = await import("../../src/demo/erp/service");
  const before = db.read();
  const customers = before.customers.length;
  const state = nutritionState();
  expect(db.read().customers).toHaveLength(customers);
  const product = before.catalog.products.find((item) => !before.erp.orders.some((order) => order.product === item.name && order.status !== "concluida"))!;
  const orderId = publishProduction(state.diets[0], product.name, 1, product.weightKg);
  const order = db.read().erp.orders.find((entry) => entry.id === orderId)!;
  const stock = before.erp.materials.map((entry) => entry.stockKg);
  await advanceOrder(orderId);
  expect(before.erp.materials.map((entry) => entry.stockKg)).toEqual(stock);
  const formula = before.erp.formulas.find((entry) => entry.product === product.name)!;
  formula.ingredients = [{ material: "Milho em grão", pct: 100 }];
  await advanceOrder(orderId);
  expect(order.status).toBe("concluida");
  const soybeanIndex = before.erp.materials.findIndex((entry) => entry.name === "Farelo de soja");
  expect(before.erp.materials[soybeanIndex].stockKg).toBeCloseTo(stock[soybeanIndex] - product.weightKg * .28);
});

test("reconfere falta de insumos no fechamento sem baixar parte do estoque", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { nutritionState, publishProduction } = await import("../../src/demo/nutrition/service");
  const { advanceOrder } = await import("../../src/demo/erp/service");
  const state = nutritionState();
  const tables = db.read();
  const product = tables.catalog.products.find((item) => !tables.erp.orders.some((order) => order.product === item.name && order.status !== "concluida"))!;
  const id = publishProduction(state.diets[0], product.name, 1, product.weightKg);
  await advanceOrder(id);
  tables.erp.materials.find((item) => item.name === "Premix mineral")!.stockKg = 0;
  const before = tables.erp.materials.map((entry) => entry.stockKg);
  await expect(advanceOrder(id)).rejects.toThrow("Estoque insuficiente");
  expect(tables.erp.orders.find((entry) => entry.id === id)?.status).toBe("em_producao");
  expect(tables.erp.materials.map((entry) => entry.stockKg)).toEqual(before);
});
