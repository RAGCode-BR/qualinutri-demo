import { calculateDiet, validateFeed } from "./calculations";
import type { Recipe } from "./model";
import type { NutritionFeed } from "./types";

export function recipeBundle(recipe: Recipe, feeds: NutritionFeed[]) {
  calculateDiet(recipe, feeds);
  return {
    schema: "qualinutri.nutrition.v1",
    recipe: structuredClone(recipe),
    feeds: feeds.filter((feed) => recipe.ingredients.some((item) => item.feedId === feed.id)),
  };
}

export function readRecipeBundle(text: string): { recipe: Recipe; feeds: NutritionFeed[] } {
  if (text.length > 2_000_000) throw new Error("O arquivo de formulação é muito grande.");
  const value = JSON.parse(text);
  if (value?.schema !== "qualinutri.nutrition.v1" || !Array.isArray(value.feeds)
    || value.feeds.length > 1000 || !value.recipe || !Array.isArray(value.recipe.ingredients)
    || !Array.isArray(value.recipe.nutrientBounds) || !["corte", "leite", "usuario", "concentrado"].includes(value.recipe.kind)) {
    throw new Error("Formato de formulação Qualinutri inválido.");
  }
  value.feeds.forEach((feed: NutritionFeed) => validateFeed(feed));
  calculateDiet(value.recipe, value.feeds);
  return { recipe: value.recipe, feeds: value.feeds };
}

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function recipeCsv(recipe: Recipe, feeds: NutritionFeed[]) {
  const result = calculateDiet(recipe, feeds);
  const cell = (value: string | number) => {
    const text = typeof value === "number" && !Number.isFinite(value) ? "Análise ou preço pendente" : String(value);
    return `"${(/^[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows: (string | number)[][] = [
    ["Formulação", recipe.name],
    ["Alimento", "% natural", "% MS", "kg/lote", "kg natural/cabeça/dia", "Custo do lote R$"],
    ...result.ingredients.map((item) => [item.name, item.naturalPct, item.dryPct, item.batchKg, item.naturalKgPerHeadDay, item.batchCost]),
    ["Custo por t natural R$", result.costPerTonNatural],
    ["Custo por t MS R$", result.costPerTonDry],
    ["Custo alimentar/cabeça/dia R$", result.costPerHeadDay],
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}
