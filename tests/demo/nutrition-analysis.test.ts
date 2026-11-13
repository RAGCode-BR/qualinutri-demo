import { describe, expect, it } from "vitest";
import { nutrientScenarios, priceScenarios } from "../../src/demo/nutrition/analysis";
import type { NutritionDiet, NutritionFeed } from "../../src/demo/nutrition/types";

const feeds: NutritionFeed[] = [
  { id: "a", name: "Fonte A", dryMatterPct: 100, pricePerKgNatural: 1, nutrients: { crudeProtein: 10 } },
  { id: "b", name: "Fonte B", dryMatterPct: 100, pricePerKgNatural: 2, nutrients: { crudeProtein: 30 } },
];
const diet: NutritionDiet = {
  id: "scenario", name: "Formulação", basis: "dry", batchKg: 1000, dryMatterIntakeKg: 10, heads: 1, days: 1,
  ingredients: [{ feedId: "a", percentage: 50 }, { feedId: "b", percentage: 50 }],
  nutrientBounds: [{ nutrient: "crudeProtein", min: 20, max: 30 }],
};

describe("cenários nutricionais discretos", () => {
  it("varia preço, reotimiza composição e conserva a biblioteca original", () => {
    const rows = priceScenarios(diet, feeds, "b", [-75, 0, 100]);
    expect(rows.map((row) => row.pricePerKgNatural)).toEqual([0.5, 2, 4]);
    const first = rows[0].result;
    const base = rows[1].result;
    const last = rows[2].result;
    expect(first.status).toBe("optimal");
    if (first.status === "optimal") {
      expect(first.diet.ingredients[1].percentage).toBeCloseTo(100);
      expect(first.calculation.costPerKgDry).toBeCloseTo(0.5);
    }
    if (base.status === "optimal") expect(base.calculation.costPerKgDry).toBeCloseTo(1.5);
    if (last.status === "optimal") expect(last.calculation.costPerKgDry).toBeCloseTo(2.5);
    expect(feeds[1].pricePerKgNatural).toBe(2);
    expect(diet.ingredients[1].percentage).toBe(50);
  });

  it("compara mínimos de nutrientes com resultados viáveis e inviáveis", () => {
    const rows = nutrientScenarios(diet, feeds, "crudeProtein", [10, 20, 30, 35]);
    expect(rows.map((row) => row.result.status)).toEqual(["optimal", "optimal", "optimal", "infeasible"]);
    const costs = rows.slice(0, 3).map((row) => row.result.status === "optimal" ? row.result.calculation.costPerKgDry : null);
    expect(costs).toEqual([1, 1.5, 2]);
    expect(diet.nutrientBounds[0].min).toBe(20);
  });

  it("rejeita entradas não finitas e preços negativos antes de calcular", () => {
    expect(() => priceScenarios(diet, feeds, "b", [-101])).toThrow("-100%");
    expect(() => priceScenarios(diet, feeds, "b", [Number.NaN])).toThrow();
    expect(() => priceScenarios(diet, feeds, "missing", [0])).toThrow("presente");
    expect(() => nutrientScenarios(diet, feeds, "", [20])).toThrow("nutriente");
    expect(() => nutrientScenarios(diet, feeds, "crudeProtein", [Number.POSITIVE_INFINITY])).toThrow("finitos");
  });
});
