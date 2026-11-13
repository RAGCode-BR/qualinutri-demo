import { db } from "../store/db";
import { newId, isoDate, today } from "../store/ids";
import { calculateDiet, validateFeed } from "./calculations";
import type { NutritionFeed } from "./types";
import type { NutritionWorkspace, Recipe } from "./model";
import { buildNutrition } from "./seed";

export function nutritionState(): NutritionWorkspace {
  const tables = db.read();
  if (!tables.nutrition) tables.nutrition = buildNutrition();
  return tables.nutrition;
}

export function saveRecipe(recipe: Recipe) {
  calculateDiet(recipe, nutritionState().feeds);
  if (!recipe.name.trim()) throw new Error("Informe o nome da formulação.");
  const next = { ...structuredClone(recipe), updatedAt: new Date().toISOString() };
  db.write((tables) => {
    tables.nutrition ??= buildNutrition();
    const index = tables.nutrition.diets.findIndex((entry) => entry.id === recipe.id);
    if (index < 0) tables.nutrition.diets.push(next);
    else tables.nutrition.diets[index] = next;
  });
  return next;
}

export function saveFeed(feed: NutritionFeed) {
  validateFeed(feed);
  db.write((tables) => {
    tables.nutrition ??= buildNutrition();
    const index = tables.nutrition.feeds.findIndex((entry) => entry.id === feed.id);
    if (index < 0) tables.nutrition.feeds.push(structuredClone(feed));
    else tables.nutrition.feeds[index] = structuredClone(feed);
  });
}

export function deleteFeed(id: string) {
  const state = nutritionState();
  if (state.diets.some((recipe) => recipe.ingredients.some((ingredient) => ingredient.feedId === id))) {
    throw new Error("Este alimento está em uma formulação salva. Retire-o da formulação antes de excluir.");
  }
  db.write((tables) => { tables.nutrition!.feeds = state.feeds.filter((feed) => feed.id !== id); });
}

export function saveAsFeed(recipe: Recipe) {
  const result = calculateDiet(recipe, nutritionState().feeds);
  if (!result.compliant) throw new Error("Confira as restrições antes de salvar a mistura como alimento.");
  const feed = {
    id: newId(), name: recipe.name, category: "Mistura", dryMatterPct: result.dryMatterPct,
    pricePerKgNatural: result.costPerKgNatural, nutrients: result.nutrients,
    source: `Mistura calculada em ${new Date().toLocaleDateString("pt-BR")}`,
  };
  saveFeed(feed);
  return feed;
}

export function publishProduction(recipe: Recipe, product: string, bags: number, bagKg: number) {
  const tables = db.read();
  const state = nutritionState();
  const result = calculateDiet(recipe, state.feeds);
  if (!result.compliant) throw new Error("A fórmula precisa atender às restrições antes de gerar a produção.");
  const catalogProduct = tables.catalog.products.find((entry) => entry.name === product);
  if (!catalogProduct || bagKg !== catalogProduct.weightKg || !Number.isSafeInteger(bags) || bags <= 0 || bags > 100000) {
    throw new Error("Escolha um produto cadastrado e informe uma quantidade inteira de sacas.");
  }
  const ingredients = result.ingredients.filter((entry) => entry.naturalPct > 0).map((entry) => {
    const feed = state.feeds.find((candidate) => candidate.id === entry.feedId)!;
    const material = tables.erp.materials.find((candidate) => candidate.name === feed.name);
    if (!material) throw new Error(`Vincule o alimento “${feed.name}” a uma matéria-prima de mesmo nome no estoque.`);
    if (material.stockKg < entry.naturalPct / 100 * bags * bagKg) {
      throw new Error(`Estoque insuficiente de ${material.name} para esta ordem.`);
    }
    return { material: material.name, pct: entry.naturalPct };
  });
  if (new Set(ingredients.map((entry) => entry.material)).size !== ingredients.length) {
    throw new Error("Há alimentos com o mesmo nome de matéria-prima. Unifique o cadastro antes de publicar.");
  }
  if (tables.erp.orders.some((order) => order.product === product && order.status !== "concluida")) {
    throw new Error("Este produto já tem ordem em aberto. Conclua a ordem atual antes de alterar sua fórmula.");
  }
  const id = newId();
  db.write((current) => {
    const previous = current.erp.formulas.find((formula) => formula.product === product);
    const formula = { id: previous?.id ?? newId(), product, ingredients, version: `Nutrição ${new Date().toISOString()}`,
      updatedAt: isoDate(today()), author: "Nutrição · demonstração" };
    current.erp.formulas = [...current.erp.formulas.filter((entry) => entry.product !== product), formula];
    current.erp.orders.push({ id, number: ++current.erp.seq.order, product, bags, bagKg, status: "planejada",
      date: isoDate(today()), operator: "Nutrição · demonstração", formulaIngredients: structuredClone(ingredients) });
  });
  return id;
}
