import { NutritionError, optimizeDiet } from "./calculations";
import type { DietOptimization, NutritionDiet, NutritionFeed } from "./types";

export type PriceScenario = {
  changePercent: number;
  pricePerKgNatural: number;
  result: DietOptimization;
};

export type NutrientScenario = {
  nutrient: string;
  minimum: number;
  result: DietOptimization;
};

/** Reotimiza uma lista explícita de preços. Os pontos não são preços-sombra ou intervalos exatos de sensibilidade. */
export function priceScenarios(
  diet: NutritionDiet,
  feeds: NutritionFeed[],
  feedId: string,
  changesPercent: number[],
): PriceScenario[] {
  const target = feeds.find((feed) => feed.id === feedId);
  if (!target || !diet.ingredients.some((item) => item.feedId === feedId)) {
    throw new NutritionError("Escolha um alimento presente na formulação para variar o preço.");
  }
  for (const change of changesPercent) {
    if (!Number.isFinite(change) || change < -100) {
      throw new NutritionError("As variações de preço precisam ser finitas e iguais ou superiores a -100%.");
    }
    if (!Number.isFinite(target.pricePerKgNatural * (1 + change / 100))) {
      throw new NutritionError("A variação de preço excedeu o limite numérico.");
    }
  }
  return changesPercent.map((changePercent) => {
    const pricePerKgNatural = target.pricePerKgNatural * (1 + changePercent / 100);
    const scenarioFeeds = feeds.map((feed) => feed.id === feedId ? { ...feed, pricePerKgNatural } : feed);
    return { changePercent, pricePerKgNatural, result: optimizeDiet(diet, scenarioFeeds) };
  });
}

/** Reotimiza mínimos discretos de um nutriente, mantendo o máximo e os demais limites informados. */
export function nutrientScenarios(
  diet: NutritionDiet,
  feeds: NutritionFeed[],
  nutrient: string,
  minimumValues: number[],
): NutrientScenario[] {
  if (!nutrient.trim()) throw new NutritionError("Escolha o nutriente cuja restrição será variada.");
  for (const minimum of minimumValues) {
    if (!Number.isFinite(minimum) || minimum < 0) throw new NutritionError("Os mínimos do nutriente precisam ser valores finitos e não negativos.");
  }
  const previous = diet.nutrientBounds.find((bound) => bound.nutrient === nutrient);
  return minimumValues.map((minimum) => {
    if (previous?.max !== undefined && minimum > previous.max) {
      return { nutrient, minimum, result: { status: "infeasible", message: "O mínimo deste cenário passa do máximo definido para o nutriente." } };
    }
    const nutrientBounds = diet.nutrientBounds.filter((bound) => bound.nutrient !== nutrient);
    nutrientBounds.push({ nutrient, min: minimum, max: previous?.max });
    const scenario = { ...diet, nutrientBounds };
    return { nutrient, minimum, result: optimizeDiet(scenario, feeds) };
  });
}
