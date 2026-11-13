import { describe, expect, it } from "vitest";
import { applyMixerWeights, calculateMixerPlan } from "../../src/demo/nutrition/mixers";
import type { Recipe } from "../../src/demo/nutrition/model";
import type { NutritionFeed } from "../../src/demo/nutrition/types";

const feeds: NutritionFeed[] = [
  { id: "a", name: "A", dryMatterPct: 25, pricePerKgNatural: 0.2, nutrients: {} },
  { id: "b", name: "B", dryMatterPct: 100, pricePerKgNatural: 1, nutrients: {} },
  { id: "c", name: "C", dryMatterPct: 100, pricePerKgNatural: 2, nutrients: {} },
];
const recipe = (change: Partial<Recipe> = {}): Recipe => ({
  id: "recipe", name: "Teste", kind: "usuario", basis: "natural", batchKg: 1000, dryMatterIntakeKg: 10,
  heads: 20, days: 30, nutrientBounds: [],
  ingredients: [{ feedId: "a", percentage: 70 }, { feedId: "b", percentage: 20 }, { feedId: "c", percentage: 10 }],
  ...change,
});

describe("misturadores encadeados", () => {
  it("contabiliza uma vez cada ingrediente e transfere o 3 para o 2 e o 2 para o 1", () => {
    const plan = calculateMixerPlan(recipe({ mixer: { capacityKg: [1000, 300, 100], assignment: { b: 2, c: 3 }, overrides: {} } }), feeds);
    expect(plan.totalKg).toBeCloseTo(1000);
    expect(plan.stages.map((stage) => stage.actualKg)).toEqual([100, 300, 1000]);
    expect(plan.stages[1].rows.at(-1)).toMatchObject({ kind: "submix", actualKg: 100, accumulatedKg: 300 });
    expect(plan.stages[2].rows.at(-1)).toMatchObject({ kind: "submix", actualKg: 300, accumulatedKg: 1000 });
    expect(plan.warnings).toEqual([]);
  });

  it("preserva as pesagens explícitas ao mudar a capacidade e converte a fórmula somente ao aplicar", () => {
    const original = recipe({ mixer: { capacityKg: [1200, 400, 150], assignment: { b: 2, c: 3 }, overrides: { a: 750, c: 120 } } });
    const plan = calculateMixerPlan(original, feeds);
    expect(plan.totalKg).toBeCloseTo(1070);
    expect(original.ingredients[0].percentage).toBe(70);
    const changed = applyMixerWeights(original, feeds);
    expect(changed.basis).toBe("natural");
    expect(changed.batchKg).toBeCloseTo(1070);
    expect(changed.ingredients[0].percentage).toBeCloseTo(750 / 1070 * 100);
    expect(changed.ingredients.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
    expect(changed.mixer?.overrides).toEqual({ a: 750, c: 120 });
    expect(calculateMixerPlan({ ...original, mixer: { ...original.mixer!, capacityKg: [1500, 400, 150] } }, feeds).totalKg).toBe(1070);
  });

  it("usa pesos naturais quando a fórmula de entrada está em matéria seca", () => {
    const plan = calculateMixerPlan(recipe({ basis: "dry", ingredients: [{ feedId: "a", percentage: 50 }, { feedId: "b", percentage: 50 }] }), feeds);
    expect(plan.ingredients[0].nominalKg).toBeCloseTo(800);
    expect(plan.ingredients[1].nominalKg).toBeCloseTo(200);
  });

  it("limpa limites em MS ao converter e conserva limites naturais", () => {
    const dry = recipe({ basis: "dry", ingredients: [{ feedId: "a", percentage: 50, minPct: 10, maxPct: 90 }, { feedId: "b", percentage: 50 }] });
    expect(applyMixerWeights(dry, feeds).ingredients[0]).toEqual({ feedId: "a", percentage: 80 });
    const natural = recipe({ ingredients: [{ feedId: "a", percentage: 80, minPct: 10, maxPct: 90 }, { feedId: "b", percentage: 20 }] });
    expect(applyMixerWeights(natural, feeds).ingredients[0]).toEqual({ feedId: "a", percentage: 80, minPct: 10, maxPct: 90 });
  });

  it("exige capacidade dos estágios intermediários e bloqueia excesso e valores inválidos", () => {
    const oversized = recipe({ mixer: { capacityKg: [1000, 0, 100], assignment: { c: 3 }, overrides: {} } });
    expect(calculateMixerPlan(oversized, feeds).warnings.some((warning) => warning.includes("Misturador 2"))).toBe(true);
    expect(() => applyMixerWeights(oversized, feeds)).toThrow("capacidades");
    expect(() => calculateMixerPlan(recipe({ mixer: { capacityKg: [1000, 0, 0], assignment: {}, overrides: { a: Number.NaN } } }), feeds)).toThrow("pesagem");
    expect(() => calculateMixerPlan(recipe({ mixer: { capacityKg: [Number.POSITIVE_INFINITY, 0, 0], assignment: {}, overrides: {} } }), feeds)).toThrow("capacidades");
  });
});
