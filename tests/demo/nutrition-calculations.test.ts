import { describe, expect, it } from "vitest";
import { calculateDiet, optimizeDiet, validateFeed } from "../../src/demo/nutrition/calculations";
import type { NutritionDiet, NutritionFeed } from "../../src/demo/nutrition/types";

const feeds: NutritionFeed[] = [
  { id: "silage", name: "Silagem teste", dryMatterPct: 25, pricePerKgNatural: 0.2, nutrients: { crudeProtein: 8, ndf: 50 } },
  { id: "meal", name: "Farelo teste", dryMatterPct: 100, pricePerKgNatural: 2, nutrients: { crudeProtein: 40, ndf: 10 } },
];
const diet = (changes: Partial<NutritionDiet> = {}): NutritionDiet => ({
  id: "diet", name: "Dieta teste", basis: "natural", ingredients: [{ feedId: "silage", percentage: 80 }, { feedId: "meal", percentage: 20 }],
  batchKg: 1000, dryMatterIntakeKg: 10, heads: 20, days: 30, nutrientBounds: [], ...changes,
});

describe("cálculo nutricional na demonstração", () => {
  it("converte mistura natural para MS e pondera nutrientes pelo peso seco", () => {
    const result = calculateDiet(diet(), feeds);
    expect(result.dryMatterPct).toBeCloseTo(40);
    expect(result.batchDryKg).toBeCloseTo(400);
    expect(result.ingredients.map((row) => row.dryPct)).toEqual([50, 50]);
    expect(result.nutrients.crudeProtein).toBeCloseTo(24);
    expect(result.nutrients.ndf).toBeCloseTo(30);
    expect(result.naturalKgPerHeadDay).toBeCloseTo(25);
    expect(result.costPerTonNatural).toBeCloseTo(560);
    expect(result.costPerTonDry).toBeCloseTo(1400);
    expect(result.costPerHeadDay).toBeCloseTo(14);
    expect(result.totalCost).toBeCloseTo(8400);
    expect(result.totalNaturalKg).toBeCloseTo(15000);
    expect(result.totalDryKg).toBeCloseTo(6000);
  });

  it("a mesma dieta expressa em MS conserva os pesos e os custos naturais", () => {
    const natural = calculateDiet(diet(), feeds);
    const dry = calculateDiet(diet({ basis: "dry", ingredients: [{ feedId: "silage", percentage: 50 }, { feedId: "meal", percentage: 50 }] }), feeds);
    expect(dry.ingredients[0].naturalPct).toBeCloseTo(80);
    expect(dry.ingredients[0].batchKg).toBeCloseTo(800);
    expect(dry.batchCost).toBeCloseTo(natural.batchCost);
    expect(dry.nutrients.crudeProtein).toBeCloseTo(natural.nutrients.crudeProtein);
  });

  it("não transforma nutrientes desconhecidos em zero ou em análise completa", () => {
    const unknown = [{ ...feeds[0], nutrients: { crudeProtein: 8 } }, feeds[1]];
    const result = calculateDiet(diet({ nutrientBounds: [{ nutrient: "ndf", max: 40 }] }), unknown);
    expect(result.nutrients.ndf).toBeUndefined();
    expect(result.incompleteNutrients).toContain("ndf");
    expect(result.compliant).toBe(false);
    expect(() => optimizeDiet(diet({ nutrientBounds: [{ nutrient: "ndf", max: 40 }] }), unknown)).toThrow("informe ndf");
  });

  it("avalia limites de ingredientes e nutrientes na base declarada", () => {
    const result = calculateDiet(diet({ ingredients: [{ feedId: "silage", percentage: 80, maxPct: 75 }, { feedId: "meal", percentage: 20 }], nutrientBounds: [{ nutrient: "crudeProtein", min: 25 }] }), feeds);
    expect(result.compliant).toBe(false);
    expect(result.constraints.map((constraint) => constraint.satisfied)).toEqual([false, false]);
  });

  it("calcula margem somente das quantidades e preços explicitamente informados", () => {
    const result = calculateDiet(diet({ economics: { milkKgDay: 20, milkPricePerKg: 2.5, otherCostPerHeadDay: 3 } }), feeds);
    expect(result.economics?.revenuePerHeadDay).toBeCloseTo(50);
    expect(result.economics?.grossMarginPerHeadDay).toBeCloseTo(33);
    expect(result.economics?.totalGrossMargin).toBeCloseTo(19800);
    expect(calculateDiet(diet({ animal: { category: "leite", milkKgDay: 20 } }), feeds).economics).toBeNull();
    expect(() => calculateDiet(diet({ economics: { gainKgDay: 1.2 } }), feeds)).toThrow("quantidade e preço juntos");
  });

  it("rejeita frações inválidas, duplicações, ausência de alimento e entradas não finitas", () => {
    expect(() => calculateDiet(diet({ ingredients: [{ feedId: "silage", percentage: 60 }] }), feeds)).toThrow("100%");
    expect(() => calculateDiet(diet({ heads: 1.5 }), feeds)).toThrow("inteiros");
    expect(() => calculateDiet(diet({ batchKg: Number.POSITIVE_INFINITY }), feeds)).toThrow();
    expect(() => calculateDiet(diet({ ingredients: [{ feedId: "missing", percentage: 100 }] }), feeds)).toThrow("ausente");
    expect(() => calculateDiet(diet({ ingredients: [{ feedId: "meal", percentage: 50 }, { feedId: "meal", percentage: 50 }] }), feeds)).toThrow("mais de uma vez");
    expect(() => validateFeed({ ...feeds[0], dryMatterPct: 0 })).toThrow();
    expect(() => validateFeed({ ...feeds[0], nutrients: { ndf: 101 } })).toThrow();
  });
});

describe("otimização de custo com restrições", () => {
  it("minimiza o custo por MS respeitando proteína e inclusão natural", () => {
    const result = optimizeDiet(diet({ ingredients: [{ feedId: "silage", percentage: 50, maxPct: 80 }, { feedId: "meal", percentage: 50 }], nutrientBounds: [{ nutrient: "crudeProtein", min: 20 }] }), feeds);
    expect(result.status).toBe("optimal");
    if (result.status !== "optimal") return;
    expect(result.diet.ingredients[0].percentage).toBeCloseTo(80, 4);
    expect(result.calculation.nutrients.crudeProtein).toBeCloseTo(24, 4);
    expect(result.calculation.compliant).toBe(true);
  });

  it("na base seca encontra mistura de menor custo com proteína mínima exata", () => {
    const result = optimizeDiet(diet({ basis: "dry", nutrientBounds: [{ nutrient: "crudeProtein", min: 20 }] }), feeds);
    expect(result.status).toBe("optimal");
    if (result.status !== "optimal") return;
    expect(result.diet.ingredients[0].percentage).toBeCloseTo(62.5, 4);
    expect(result.diet.ingredients[1].percentage).toBeCloseTo(37.5, 4);
    expect(result.calculation.nutrients.crudeProtein).toBeCloseTo(20, 4);
    expect(result.calculation.costPerKgDry).toBeCloseTo(1.25, 4);
  });

  it("retorna inviável sem aceitar uma solução fora das restrições", () => {
    expect(optimizeDiet(diet({ nutrientBounds: [{ nutrient: "crudeProtein", min: 50 }] }), feeds).status).toBe("infeasible");
    expect(optimizeDiet(diet({ ingredients: [{ feedId: "silage", percentage: 50, minPct: 80 }, { feedId: "meal", percentage: 50, minPct: 40 }] }), feeds).status).toBe("infeasible");
  });
});

it("preserva proteína bruta equivalente de compostos nitrogenados acima de 100% MS", () => {
  const compound = { id: "ureia", name: "Ureia", dryMatterPct: 99, pricePerKgNatural: 3.8, nutrients: { crudeProtein: 282 } };
  const only = { id: "compound", name: "Análise da matéria-prima", basis: "natural" as const,
    ingredients: [{ feedId: compound.id, percentage: 100 }], batchKg: 1, dryMatterIntakeKg: 1, heads: 1, days: 1, nutrientBounds: [] };
  expect(calculateDiet(only, [compound]).nutrients.crudeProtein).toBe(282);
});

describe("base do objetivo de custo", () => {
  const equalNutrients: NutritionFeed[] = [
    { id: "wet", name: "Úmido", dryMatterPct: 20, pricePerKgNatural: 0.5, nutrients: { crudeProtein: 20 } },
    { id: "dry", name: "Seco", dryMatterPct: 100, pricePerKgNatural: 1, nutrients: { crudeProtein: 20 } },
  ];
  const input = diet({ ingredients: [{ feedId: "wet", percentage: 50 }, { feedId: "dry", percentage: 50 }], nutrientBounds: [{ nutrient: "crudeProtein", min: 20, max: 20 }] });

  it("custo natural escolhe alimento úmido e custo seco escolhe alimento seco", () => {
    const natural = optimizeDiet({ ...input, costBasis: "natural" }, equalNutrients);
    const dry = optimizeDiet({ ...input, costBasis: "dry" }, equalNutrients);
    expect(natural.status).toBe("optimal");
    expect(dry.status).toBe("optimal");
    if (natural.status === "optimal" && dry.status === "optimal") {
      expect(natural.diet.ingredients[0].percentage).toBeCloseTo(100);
      expect(natural.calculation.costPerTonNatural).toBeCloseTo(500);
      expect(dry.diet.ingredients[1].percentage).toBeCloseTo(100);
      expect(dry.calculation.costPerTonDry).toBeCloseTo(1000);
    }
  });

  it("objetivo natural transforma limites de inclusão em MS e nutrientes ponderados", () => {
    const result = optimizeDiet({
      ...input, basis: "dry", costBasis: "natural",
      ingredients: [{ feedId: "wet", percentage: 50, maxPct: 40 }, { feedId: "dry", percentage: 50, minPct: 60 }],
    }, equalNutrients);
    expect(result.status).toBe("optimal");
    if (result.status === "optimal") {
      expect(result.diet.ingredients[0].percentage).toBeCloseTo(40, 4);
      expect(result.calculation.ingredients[0].naturalPct).toBeCloseTo(100 * 2 / 2.6, 4);
      expect(result.calculation.compliant).toBe(true);
    }
  });

  it("objetivo natural respeita proteína mínima calculada na matéria seca", () => {
    const result = optimizeDiet(diet({ costBasis: "natural", nutrientBounds: [{ nutrient: "crudeProtein", min: 20, max: 25 }] }), feeds);
    expect(result.status).toBe("optimal");
    if (result.status === "optimal") {
      expect(result.calculation.nutrients.crudeProtein).toBeCloseTo(20, 4);
      expect(result.calculation.compliant).toBe(true);
    }
  });
});

it("preço importado ausente preserva análise e impede custo mínimo com preço zero presumido", () => {
  const pending = [{ ...feeds[0], pricePerKgNatural: 0, pricePending: true }, feeds[1]];
  const calculated = calculateDiet(diet(), pending);
  expect(calculated.nutrients.crudeProtein).toBeCloseTo(24);
  expect(Number.isNaN(calculated.totalCost)).toBe(true);
  expect(Number.isNaN(calculated.costPerKgDry)).toBe(true);
  expect(() => optimizeDiet(diet(), pending)).toThrow("confirme o preço");
  const excluded = diet({ ingredients: [{ feedId: "silage", percentage: 0, maxPct: 0 }, { feedId: "meal", percentage: 100 }] });
  const result = optimizeDiet(excluded, pending);
  expect(result.status).toBe("optimal");
  if (result.status === "optimal") expect(result.calculation.costPerKgNatural).toBeCloseTo(2);
});
