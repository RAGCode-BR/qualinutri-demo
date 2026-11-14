import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
import { calculateDiet, optimizeDiet } from "../../src/demo/nutrition/calculations";
import { buildNutrition } from "../../src/demo/nutrition/seed";
import { NutritionBalance, NutritionInclusionChecks, NutritionStatus } from "../../src/features/nutrition/NutritionBalance";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("teste editável usa cópias independentes e confere massa, custo e solução de menor custo", async () => {
  const { nutritionState, createFormulationTest } = await import("../../src/demo/nutrition/service");
  const state = nutritionState();
  state.feeds[0].pricePerKgNatural = 99;
  const existing = structuredClone(state.feeds);
  const recipe = createFormulationTest();
  expect(state.feeds.slice(0, existing.length)).toEqual(existing);
  const result = calculateDiet(recipe, state.feeds);
  expect(result.ingredients.map((item) => item.batchKg)).toEqual([700, 280, 20]);
  expect(result.batchCost).toBeCloseTo(1568.8, 6);
  expect(result.dryMatterPct).toBeCloseTo(88.48, 6);
  const optimum = optimizeDiet(recipe, state.feeds);
  expect(optimum.status).toBe("optimal");
  if (optimum.status !== "optimal") throw new Error(optimum.message);
  // Solução algébrica independente: (776,16 + 34,8*s)/(88,2 + 0,01*s) = PB18.
  const soybeanPct = 811.44 / 34.62;
  expect(optimum.calculation.ingredients[1].naturalPct).toBeCloseTo(soybeanPct, 5);
  expect(optimum.calculation.costPerTonNatural).toBeCloseTo((98 - soybeanPct) * 11.2 + soybeanPct * 23.1 + 138, 5);
  expect(optimum.calculation.compliant).toBe(true);
  const saved = nutritionState().diets.find((item) => item.id === recipe.id)!;
  expect(saved.ingredients[0].percentage).toBe(70);
  expect(saved.ingredients.some((item) => existing.some((feed) => feed.id === item.feedId))).toBe(false);
});

test("balanço impresso mantém nutriente limitado mesmo sem qualquer análise cadastrada", () => {
  const { diets, feeds } = buildNutrition();
  const recipe = { ...diets[0], nutrientBounds: [{ nutrient: "selenio", min: .1 }] };
  const result = calculateDiet(recipe, feeds);
  const markup = renderToStaticMarkup(createElement(NutritionBalance, { result }));
  expect(markup).toContain("selenio");
  expect(markup).toContain("Análise ausente");
  expect(markup).toContain("Análise incompleta");
  expect(renderToStaticMarkup(createElement(NutritionStatus, { result }))).toContain("Em revisão");
});

test("conferência impressa acusa ingrediente acima do máximo mesmo atendendo proteína", () => {
  const { diets, feeds } = buildNutrition();
  diets[0].ingredients[0].maxPct = 10;
  const result = calculateDiet(diets[0], feeds);
  expect(result.constraints.find((item) => item.kind === "nutrient")?.satisfied).toBe(true);
  const markup = renderToStaticMarkup(createElement(NutritionInclusionChecks, { result }));
  expect(markup).toContain("Milho em grão");
  expect(markup).toContain("Fora do limite");
  expect(markup).toContain("<td>10</td>");
  expect(result.compliant).toBe(false);
});
