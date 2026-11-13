import { calculateDiet, NutritionError } from "./calculations";
import type { Recipe } from "./model";
import type { NutritionFeed } from "./types";

export type MixerStage = 1 | 2 | 3;
export type MixerSettings = NonNullable<Recipe["mixer"]>;
export type MixerIngredient = {
  feedId: string;
  name: string;
  stage: MixerStage;
  nominalKg: number;
  actualKg: number;
  overridden: boolean;
};
export type MixerRow = {
  key: string;
  name: string;
  kind: "ingredient" | "submix";
  nominalKg: number;
  actualKg: number;
  accumulatedKg: number;
};
export type MixerPlan = {
  ingredients: MixerIngredient[];
  stages: { stage: MixerStage; capacityKg: number; nominalKg: number; actualKg: number; rows: MixerRow[] }[];
  totalKg: number;
  warnings: string[];
};

export function mixerSettings(recipe: Recipe): MixerSettings {
  return recipe.mixer ?? { capacityKg: [recipe.batchKg, 0, 0], assignment: {}, overrides: {} };
}

export function calculateMixerPlan(recipe: Recipe, feeds: NutritionFeed[]): MixerPlan {
  const calculation = calculateDiet(recipe, feeds);
  const settings = mixerSettings(recipe);
  if (settings.capacityKg.length !== 3 || settings.capacityKg.some((capacity) => !Number.isFinite(capacity) || capacity < 0)) {
    throw new NutritionError("Informe três capacidades válidas, iguais ou maiores que zero.");
  }
  const ingredients = calculation.ingredients.map((row): MixerIngredient => {
    const stage = settings.assignment[row.feedId] ?? 1;
    if (![1, 2, 3].includes(stage)) throw new NutritionError(`${row.name}: selecione o misturador 1, 2 ou 3.`);
    const overridden = Object.hasOwn(settings.overrides, row.feedId);
    const actualKg = overridden ? settings.overrides[row.feedId] : row.batchKg;
    if (!Number.isFinite(actualKg) || actualKg < 0) throw new NutritionError(`${row.name}: a pesagem precisa ser igual ou maior que zero.`);
    return { feedId: row.feedId, name: row.name, stage, nominalKg: row.batchKg, actualKg, overridden };
  });
  const totalKg = ingredients.reduce((sum, row) => sum + row.actualKg, 0);
  if (!Number.isFinite(totalKg) || totalKg <= 0) throw new NutritionError("A mistura precisa ter peso total maior que zero.");
  const stages: MixerPlan["stages"] = [];
  const warnings: string[] = [];
  let previous: MixerPlan["stages"][number] | undefined;
  for (const stage of [3, 2, 1] as const) {
    const rows: MixerRow[] = ingredients.filter((row) => row.stage === stage).map((row) => ({
      key: row.feedId, name: row.name, kind: "ingredient", nominalKg: row.nominalKg,
      actualKg: row.actualKg, accumulatedKg: 0,
    }));
    if (previous && (previous.actualKg > 0 || previous.nominalKg > 0)) {
      rows.push({ key: `mixer-${previous.stage}`, name: `Mistura do misturador ${previous.stage}`,
        kind: "submix", nominalKg: previous.nominalKg, actualKg: previous.actualKg, accumulatedKg: 0 });
    }
    let actualKg = 0;
    let nominalKg = 0;
    for (const row of rows) {
      actualKg += row.actualKg;
      nominalKg += row.nominalKg;
      row.accumulatedKg = actualKg;
    }
    const capacityKg = settings.capacityKg[stage - 1];
    if (actualKg > capacityKg + 0.000001) warnings.push(`Misturador ${stage}: ${actualKg.toLocaleString("pt-BR")} kg para capacidade de ${capacityKg.toLocaleString("pt-BR")} kg.`);
    const result = { stage, capacityKg, nominalKg, actualKg, rows };
    stages.push(result);
    previous = result;
  }
  return { ingredients, stages, totalKg, warnings };
}

export function applyMixerWeights(recipe: Recipe, feeds: NutritionFeed[]): Recipe {
  const plan = calculateMixerPlan(recipe, feeds);
  if (plan.warnings.length > 0) throw new NutritionError("Ajuste as capacidades dos misturadores antes de aplicar as pesagens.");
  const actual = new Map(plan.ingredients.map((row) => [row.feedId, row.actualKg]));
  let lastPositiveIndex = 0;
  recipe.ingredients.forEach((ingredient, index) => {
    if ((actual.get(ingredient.feedId) ?? 0) > 0) lastPositiveIndex = index;
  });
  let sum = 0;
  const ingredients = recipe.ingredients.map((ingredient, index) => {
    const percentage = index === lastPositiveIndex ? 100 - sum : (actual.get(ingredient.feedId) ?? 0) / plan.totalKg * 100;
    sum += percentage;
    if (recipe.basis === "dry") {
      const { minPct: _minimum, maxPct: _maximum, ...naturalIngredient } = ingredient;
      return { ...naturalIngredient, percentage };
    }
    return { ...ingredient, percentage };
  });
  return { ...recipe, basis: "natural", batchKg: plan.totalKg, ingredients, mixer: mixerSettings(recipe) };
}
