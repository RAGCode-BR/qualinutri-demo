import { describe, expect, it } from "vitest";
import { remapCatalogSelections, remapFreightSelection } from "../../src/features/calculator/remapCatalogSelections";
import type { ItemFormState, OrderItem } from "../../src/features/calculator/calculator.types";
import type { DiscountLine, Product } from "../../src/types/commercial";

const product = (name: string): Product => ({ name, group: "Rações", weightKg: 40, prices: [10, 11] });
const terms = ["à vista", "30 dd"];
const lines: DiscountLine[] = [
  { name: "Linha A", percentage: 5 },
  { name: "Linha B", percentage: 8 },
  { name: "Outro / personalizado", percentage: null },
];

const previous = { products: [product("Alfa"), product("Beta"), product("Gama")], paymentTermLabels: terms, discountLines: lines };

const item = (overrides: Partial<OrderItem>): OrderItem => ({
  id: 1,
  name: "Beta",
  productIndex: "1",
  paymentTermIndex: "1",
  tableUnitPrice: 11,
  quantity: 10,
  weightKg: 40,
  lineDiscountPercentage: 8,
  discountLineIndex: "1",
  customDiscountPercentage: 0,
  ...overrides,
});

const form: ItemFormState = {
  productIndex: "2",
  paymentTermIndex: "0",
  tableUnitPrice: "10",
  discountLineIndex: "1",
  customDiscountPercentage: "",
  quantity: "1",
  bagWeightKg: "40",
};

describe("atualização do catálogo com a calculadora aberta", () => {
  it("reencontra produto e linha pelo nome quando a posição muda", () => {
    const next = { ...previous, products: [product("Beta"), product("Gama")] };
    const result = remapCatalogSelections(previous, next, [item({})], form);
    expect(result.items[0].productIndex).toBe("0");
    expect(result.itemForm.productIndex).toBe("1");
  });

  it("mantém valores já adicionados, mesmo se o percentual da linha mudar", () => {
    const next = { ...previous, discountLines: [lines[0], { name: "Linha B", percentage: 12 }, lines[2]] };
    const result = remapCatalogSelections(previous, next, [item({})], form);
    expect(result.items[0]).toMatchObject({ lineDiscountPercentage: 8, discountLineIndex: "1", tableUnitPrice: 11 });
  });

  it("produto excluído vira preço manual; linha excluída vira personalizada com o mesmo percentual", () => {
    const next = { ...previous, products: [product("Alfa"), product("Gama")], discountLines: [lines[0], lines[2]] };
    const result = remapCatalogSelections(previous, next, [item({})], form);
    expect(result.items[0]).toMatchObject({
      productIndex: "",
      discountLineIndex: "1",
      customDiscountPercentage: 8,
      lineDiscountPercentage: 8,
    });
  });

  it("no formulário, seleção de linha excluída é limpa para o vendedor escolher de novo", () => {
    const next = { ...previous, discountLines: [lines[0], lines[2]] };
    const result = remapCatalogSelections(previous, next, [], form);
    expect(result.itemForm.discountLineIndex).toBe("");
    expect(result.itemForm.paymentTermIndex).toBe("0");
  });
});

describe("faixa de frete com a calculadora aberta", () => {
  const juara = (distance: string) => ({ distance, bag25: 1, bag30: 1, bag40: 1, closedPerTon: 10 });
  const regional = (location: string) => ({ location, fractionalPerTon: null, closedPerTon: 10 });
  const before = { juaraFreightRates: [juara("Até 25 km"), juara("26 a 45 km")], regionalFreightRates: [regional("Brasnorte"), regional("Juína")] };

  it("reencontra a faixa pelo nome quando a posição muda", () => {
    const after = { ...before, regionalFreightRates: [regional("Juína")] };
    expect(remapFreightSelection(before, after, { table: "regional", rangeIndex: "1", loadType: "closed" }))
      .toEqual({ table: "regional", rangeIndex: "0", loadType: "closed" });
  });

  it("desmarca o frete quando a faixa escolhida foi excluída", () => {
    const after = { ...before, juaraFreightRates: [juara("Até 25 km")] };
    expect(remapFreightSelection(before, after, { table: "juara", rangeIndex: "1", loadType: "fractional" }))
      .toEqual({ table: "", rangeIndex: "", loadType: "fractional" });
  });
});
