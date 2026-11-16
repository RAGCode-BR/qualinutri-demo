import { getDemoViewer } from "../app/session";
import { db } from "../store/db";
import { newId, isoDate, today } from "../store/ids";
import { calculateDiet, validateFeed } from "./calculations";
import type { NutritionFeed } from "./types";
import type { NutritionWorkspace, Recipe } from "./model";
import { calculateMixerPlan } from "./mixers";
import { buildNutrition } from "./seed";

export function nutritionState(): NutritionWorkspace {
  const tables = db.read();
  if (!tables.nutrition) tables.nutrition = buildNutrition();
  return tables.nutrition;
}

function requireWriter() {
  if (getDemoViewer().role === "consulta") throw new Error("O perfil Consulta só visualiza.");
}

/** Cópia independente: o teste não redefine alimentos nem fórmulas do usuário. */
export function createFormulationTest(): Recipe {
  requireWriter();
  const example = buildNutrition();
  const recipe = example.diets[0];
  const feedIds = new Map(recipe.ingredients.map((item) => [item.feedId, newId()]));
  const feeds = example.feeds.filter((feed) => feedIds.has(feed.id)).map((feed) => ({
    ...feed, id: feedIds.get(feed.id)!, source: "Dados fictícios · teste de formulação",
  }));
  const next: Recipe = {
    ...recipe, id: newId(), name: "Teste · concentrado 1.000 kg",
    ingredients: recipe.ingredients.map((item) => ({ ...item, feedId: feedIds.get(item.feedId)! })),
    notes: "Dados fictícios para teste funcional. Milho 70%, soja 28%, premix 2%. Proteína bruta de 18 a 24% MS. " +
      "Avaliação inicial: 700/280/20 kg por mistura, 88,48% MS e R$ 1.568,80 por tonelada natural. " +
      "Otimização de menor custo natural esperada: 74,561525% / 23,438475% / 2%, cerca de R$ 1.514,52/t. " +
      "Exemplo para conferir o sistema, sem recomendação de alimentação.",
    updatedAt: new Date().toISOString(),
  };
  calculateDiet(next, feeds);
  db.write((tables) => {
    tables.nutrition ??= buildNutrition();
    tables.nutrition.feeds.push(...feeds);
    tables.nutrition.diets.push(next);
  });
  return structuredClone(next);
}

export function saveRecipe(recipe: Recipe) {
  requireWriter();
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
  requireWriter();
  validateFeed(feed);
  db.write((tables) => {
    tables.nutrition ??= buildNutrition();
    const index = tables.nutrition.feeds.findIndex((entry) => entry.id === feed.id);
    if (index < 0) tables.nutrition.feeds.push(structuredClone(feed));
    else tables.nutrition.feeds[index] = structuredClone(feed);
  });
}

export function deleteFeed(id: string) {
  requireWriter();
  const state = nutritionState();
  if (state.diets.some((recipe) => recipe.ingredients.some((ingredient) => ingredient.feedId === id))) {
    throw new Error("Este alimento está em uma formulação salva. Retire-o da formulação antes de excluir.");
  }
  db.write((tables) => { tables.nutrition!.feeds = state.feeds.filter((feed) => feed.id !== id); });
}

export function saveAsFeed(recipe: Recipe) {
  requireWriter();
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

export function publishProduction(recipe: Recipe, product: string, bags: number, bagKg: number, materialsByFeed: Record<string, string> = {}) {
  requireWriter();
  const tables = db.read();
  const state = nutritionState();
  const result = calculateDiet(recipe, state.feeds);
  if (!result.compliant) throw new Error("A fórmula precisa atender às restrições antes de gerar a produção.");
  const catalogProduct = tables.catalog.products.find((entry) => entry.name === product);
  if (!catalogProduct || bagKg !== catalogProduct.weightKg || !Number.isSafeInteger(bags) || bags <= 0 || bags > 100000) {
    throw new Error("Escolha um produto cadastrado e informe uma quantidade inteira de sacas.");
  }
  const plan = calculateMixerPlan(recipe, state.feeds);
  if (plan.warnings.length) throw new Error(plan.warnings.join(" "));
  if (plan.ingredients.some((entry) => Math.abs(entry.actualKg - entry.nominalKg) > 0.000001)) {
    throw new Error("Aplique as pesagens à fórmula e confira as metas antes de emitir a ordem.");
  }
  const weight = bags * bagKg;
  const fullBatches = Math.floor((weight + 0.000001) / plan.totalKg);
  const remainderKg = Math.max(0, weight - fullBatches * plan.totalKg);
  const weighing = {
    recipeName: recipe.name, batchKg: plan.totalKg, fullBatches, remainderKg,
    stages: plan.stages.filter((stage) => stage.actualKg > 0).map(({ stage, rows }) => ({
      stage, rows: rows.filter((row) => row.actualKg > 0).map((row) => {
        const stockName = tables.erp.materials.find((item) => item.id === materialsByFeed[row.key])?.name;
        return { name: stockName && stockName !== row.name ? `${stockName} (${row.name})` : row.name,
          kg: row.actualKg, accumulatedKg: row.accumulatedKg };
      }),
    })),
  };
  const ingredients = result.ingredients.filter((entry) => entry.naturalPct > 0).map((entry) => {
    const feed = state.feeds.find((candidate) => candidate.id === entry.feedId)!;
    const selectedId = materialsByFeed[feed.id];
    const material = tables.erp.materials.find((candidate) => selectedId !== undefined ? candidate.id === selectedId : candidate.name === feed.name);
    if (!material) throw new Error(`Vincule o alimento “${feed.name}” a uma matéria-prima no estoque.`);
    if (material.stockKg + 0.000001 < entry.naturalPct / 100 * bags * bagKg) {
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
  const formulaVersion = { ...structuredClone(recipe), updatedAt: new Date().toISOString() };
  db.write((current) => {
    current.nutrition ??= buildNutrition();
    current.nutrition.diets = [...current.nutrition.diets.filter((item) => item.id !== recipe.id), formulaVersion];
    const previous = current.erp.formulas.find((formula) => formula.product === product);
    const formula = { id: previous?.id ?? newId(), product, ingredients, version: `Nutrição ${new Date().toISOString()}`,
      updatedAt: isoDate(today()), author: "Nutrição · demonstração" };
    current.erp.formulas = [...current.erp.formulas.filter((entry) => entry.product !== product), formula];
    current.erp.orders.push({ id, number: ++current.erp.seq.order, product, bags, bagKg, status: "planejada",
      date: isoDate(today()), operator: "Nutrição · demonstração", formulaIngredients: structuredClone(ingredients), weighing });
  });
  return id;
}
