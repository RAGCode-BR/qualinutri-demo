import solver, { type Model } from "javascript-lp-solver";
import { NUTRIENTS, type DietCalculation, type DietConstraintResult, type DietOptimization, type NutritionDiet, type NutritionFeed, type NutrientBound, type RationIngredient } from "./types";

const TOLERANCE = 0.00001;
const percentageKeys = new Set<string>(NUTRIENTS.filter((nutrient) => nutrient.unit === "% MS" && nutrient.key !== "crudeProtein").map((nutrient) => nutrient.key));

export class NutritionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NutritionError";
  }
}

function numberInRange(value: number, label: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value) || value < min || value > max) throw new NutritionError(`${label}: informe um valor entre ${min} e ${max}.`);
}

function bounds(min: number | undefined, max: number | undefined, label: string, ceiling = Number.MAX_SAFE_INTEGER) {
  if (min !== undefined) numberInRange(min, `${label}, mínimo`, 0, ceiling);
  if (max !== undefined) numberInRange(max, `${label}, máximo`, 0, ceiling);
  if (min !== undefined && max !== undefined && min > max) throw new NutritionError(`${label}: o mínimo passa do máximo.`);
}

export function validateFeed(feed: NutritionFeed) {
  if (!feed.id.trim() || !feed.name.trim()) throw new NutritionError("Informe o identificador e o nome do alimento.");
  numberInRange(feed.dryMatterPct, `${feed.name}, matéria seca (%)`, 0.01, 100);
  numberInRange(feed.pricePerKgNatural, `${feed.name}, preço por kg`, 0);
  if (!feed.nutrients || typeof feed.nutrients !== "object" || Array.isArray(feed.nutrients)) throw new NutritionError(`${feed.name}: composição inválida.`);
  for (const [key, value] of Object.entries(feed.nutrients)) {
    if (!key.trim()) throw new NutritionError(`${feed.name}: o nutriente precisa de um nome.`);
    numberInRange(value, `${feed.name}, ${key}`, 0, percentageKeys.has(key) ? 100 : Number.MAX_SAFE_INTEGER);
  }
}

function validateDiet(diet: NutritionDiet, feeds: NutritionFeed[], requireTotal: boolean) {
  if (!diet.id.trim() || !diet.name.trim()) throw new NutritionError("Informe o identificador e o nome da dieta.");
  if (diet.basis !== "natural" && diet.basis !== "dry") throw new NutritionError("Selecione matéria natural ou matéria seca.");
  if (diet.costBasis !== undefined && diet.costBasis !== "natural" && diet.costBasis !== "dry") throw new NutritionError("Selecione a base natural ou seca para o custo.");
  numberInRange(diet.batchKg, "Peso do lote (kg naturais)", 0.001);
  numberInRange(diet.dryMatterIntakeKg, "Consumo de matéria seca por animal/dia", 0.001);
  numberInRange(diet.heads, "Número de animais", 1);
  numberInRange(diet.days, "Número de dias", 1);
  if (!Number.isSafeInteger(diet.heads) || !Number.isSafeInteger(diet.days)) throw new NutritionError("Animais e dias devem ser números inteiros.");
  const map = new Map<string, NutritionFeed>();
  for (const feed of feeds) {
    validateFeed(feed);
    if (map.has(feed.id)) throw new NutritionError(`Alimento repetido: ${feed.name}.`);
    map.set(feed.id, feed);
  }
  if (!diet.ingredients.length) throw new NutritionError("Adicione pelo menos um alimento à dieta.");
  const ids = new Set<string>();
  for (const item of diet.ingredients) {
    if (!map.has(item.feedId)) throw new NutritionError(`Alimento ausente da biblioteca: ${item.feedId}.`);
    if (ids.has(item.feedId)) throw new NutritionError("Um alimento aparece mais de uma vez na dieta.");
    ids.add(item.feedId);
    numberInRange(item.percentage, "Inclusão (%)", 0, 100);
    bounds(item.minPct, item.maxPct, "Limites do ingrediente", 100);
  }
  const nutrientKeys = new Set<string>();
  for (const bound of diet.nutrientBounds) {
    if (!bound.nutrient.trim() || nutrientKeys.has(bound.nutrient)) throw new NutritionError("Há restrições de nutrientes sem nome ou repetidas.");
    nutrientKeys.add(bound.nutrient);
    bounds(bound.min, bound.max, bound.nutrient, percentageKeys.has(bound.nutrient) ? 100 : Number.MAX_SAFE_INTEGER);
  }
  if (requireTotal && Math.abs(diet.ingredients.reduce((sum, item) => sum + item.percentage, 0) - 100) > TOLERANCE) {
    throw new NutritionError("As inclusões precisam somar 100% na base escolhida.");
  }
  const animal = diet.animal;
  if (animal) {
    if (!["corte", "leite", "outro"].includes(animal.category)) throw new NutritionError("Categoria animal inválida.");
    for (const [label, value] of [["Peso corporal", animal.bodyWeightKg], ["Ganho informado", animal.targetGainKgDay], ["Leite informado", animal.milkKgDay]] as const) {
      if (value !== undefined) numberInRange(value, label, label === "Peso corporal" ? 0.001 : 0);
    }
  }
  const economics = diet.economics;
  if (economics) {
    for (const [key, value] of Object.entries(economics)) if (value !== undefined) numberInRange(value, key, 0);
    for (const [quantity, price] of [[economics.milkKgDay, economics.milkPricePerKg], [economics.gainKgDay, economics.gainPricePerKg]]) {
      if ((quantity === undefined) !== (price === undefined)) throw new NutritionError("Informe quantidade e preço juntos para calcular a receita.");
    }
  }
  return map;
}

function constraint(kind: DietConstraintResult["kind"], key: string, value: number, bound: NutrientBound | RationIngredient): DietConstraintResult {
  const min = "feedId" in bound ? bound.minPct : bound.min;
  const max = "feedId" in bound ? bound.maxPct : bound.max;
  return { kind, key, value, min, max, satisfied: Number.isFinite(value) && (min === undefined || value >= min - TOLERANCE) && (max === undefined || value <= max + TOLERANCE) };
}

export function calculateDiet(diet: NutritionDiet, feeds: NutritionFeed[]): DietCalculation {
  const map = validateDiet(diet, feeds, true);
  const rows = diet.ingredients.map((ingredient) => ({ ingredient, feed: map.get(ingredient.feedId)! }));
  const dryFraction = diet.basis === "natural"
    ? rows.reduce((sum, { ingredient, feed }) => sum + ingredient.percentage / 100 * feed.dryMatterPct / 100, 0)
    : 1 / rows.reduce((sum, { ingredient, feed }) => sum + ingredient.percentage / feed.dryMatterPct, 0);
  const naturalKgPerHeadDay = diet.dryMatterIntakeKg / dryFraction;
  const animalDays = diet.heads * diet.days;
  const ingredients = rows.map(({ ingredient, feed }) => {
    const naturalPct = diet.basis === "natural" ? ingredient.percentage : ingredient.percentage / (feed.dryMatterPct / 100) * dryFraction;
    const dryPct = naturalPct * feed.dryMatterPct / 100 / dryFraction;
    const batchKg = diet.batchKg * naturalPct / 100;
    const naturalDaily = naturalKgPerHeadDay * naturalPct / 100;
    const price = ingredient.percentage > 0 && feed.pricePending ? Number.NaN : feed.pricePerKgNatural;
    return {
      feedId: feed.id, name: feed.name, naturalPct, dryPct, batchKg,
      batchDryKg: batchKg * feed.dryMatterPct / 100,
      naturalKgPerHeadDay: naturalDaily, dryKgPerHeadDay: naturalDaily * feed.dryMatterPct / 100,
      totalNaturalKg: naturalDaily * animalDays, totalDryKg: naturalDaily * feed.dryMatterPct / 100 * animalDays,
      batchCost: batchKg * price, costPerHeadDay: naturalDaily * price,
      totalCost: naturalDaily * price * animalDays,
    };
  });
  const active = rows.filter(({ ingredient }) => ingredient.percentage > 0);
  const keys = new Set([...active.flatMap(({ feed }) => Object.keys(feed.nutrients)), ...diet.nutrientBounds.map((bound) => bound.nutrient)]);
  const nutrients: Record<string, number> = {};
  const incompleteNutrients: string[] = [];
  for (const key of keys) {
    if (active.some(({ feed }) => !Object.hasOwn(feed.nutrients, key))) incompleteNutrients.push(key);
    else nutrients[key] = ingredients.reduce((sum, item) => sum + item.dryPct / 100 * (map.get(item.feedId)!.nutrients[key] ?? 0), 0);
  }
  const constraints = [
    ...diet.ingredients.filter((item) => item.minPct !== undefined || item.maxPct !== undefined).map((item) => constraint("ingredient", item.feedId, item.percentage, item)),
    ...diet.nutrientBounds.filter((bound) => bound.min !== undefined || bound.max !== undefined).map((bound) => constraint("nutrient", bound.nutrient, nutrients[bound.nutrient] ?? Number.NaN, bound)),
  ];
  const sum = (key: "batchCost" | "costPerHeadDay" | "totalCost") => ingredients.reduce((total, item) => total + item[key], 0);
  const batchCost = sum("batchCost");
  const costPerHeadDay = sum("costPerHeadDay");
  const economics = diet.economics;
  const hasRevenue = economics && (economics.milkKgDay !== undefined || economics.gainKgDay !== undefined);
  const revenuePerHeadDay = economics ? (economics.milkKgDay ?? 0) * (economics.milkPricePerKg ?? 0) + (economics.gainKgDay ?? 0) * (economics.gainPricePerKg ?? 0) : 0;
  const otherCostPerHeadDay = economics?.otherCostPerHeadDay ?? 0;
  return {
    ingredients, dryMatterPct: dryFraction * 100, batchKg: diet.batchKg, batchDryKg: diet.batchKg * dryFraction,
    batchCost, naturalKgPerHeadDay, dryKgPerHeadDay: diet.dryMatterIntakeKg,
    costPerKgNatural: batchCost / diet.batchKg, costPerKgDry: batchCost / (diet.batchKg * dryFraction),
    costPerTonNatural: batchCost / diet.batchKg * 1000, costPerTonDry: batchCost / (diet.batchKg * dryFraction) * 1000,
    costPerHeadDay, totalNaturalKg: naturalKgPerHeadDay * animalDays,
    totalDryKg: diet.dryMatterIntakeKg * animalDays, totalCost: sum("totalCost"),
    nutrients, incompleteNutrients, constraints, compliant: constraints.every((item) => item.satisfied),
    economics: hasRevenue ? { revenuePerHeadDay, otherCostPerHeadDay, grossMarginPerHeadDay: revenuePerHeadDay - costPerHeadDay - otherCostPerHeadDay, totalRevenue: revenuePerHeadDay * animalDays, totalGrossMargin: (revenuePerHeadDay - costPerHeadDay - otherCostPerHeadDay) * animalDays } : null,
  };
}

/** Minimiza o custo por kg na base de custo escolhida, preservando as bases dos limites. */
export function optimizeDiet(diet: NutritionDiet, feeds: NutritionFeed[]): DietOptimization {
  const map = validateDiet(diet, feeds, false);
  const selected = diet.ingredients.map((item) => ({ item, feed: map.get(item.feedId)! }));
  for (const { feed, item } of selected) {
    if (item.maxPct === 0) continue;
    if (feed.pricePending) throw new NutritionError(`${feed.name}: informe e confirme o preço antes de otimizar.`);
    const absent = diet.nutrientBounds.find((bound) => (bound.min !== undefined || bound.max !== undefined) && !Object.hasOwn(feed.nutrients, bound.nutrient));
    if (absent) throw new NutritionError(`${feed.name}: informe ${absent.nutrient} antes de otimizar com essa restrição.`);
  }
  const costBasis = diet.costBasis ?? "dry";
  const model: Model = { optimize: "cost", opType: "min", constraints: { total: { equal: 1 } }, variables: {} };
  diet.nutrientBounds.forEach((bound, index) => {
    if (bound.min !== undefined) model.constraints[`nutrient_min_${index}`] = { min: costBasis === "dry" ? bound.min : 0 };
    if (bound.max !== undefined) model.constraints[`nutrient_max_${index}`] = { max: costBasis === "dry" ? bound.max : 0 };
  });
  selected.forEach(({ item }, index) => {
    if (item.minPct !== undefined) model.constraints[`min_${index}`] = { min: diet.basis === costBasis ? item.minPct / 100 : 0 };
    if (item.maxPct !== undefined) model.constraints[`max_${index}`] = { max: diet.basis === costBasis ? item.maxPct / 100 : 0 };
  });
  selected.forEach(({ feed }, index) => {
    const dm = feed.dryMatterPct / 100;
    const coefficients: Record<string, number> = { total: 1, cost: costBasis === "natural" ? feed.pricePerKgNatural : feed.pricePerKgNatural / dm };
    diet.nutrientBounds.forEach((bound, boundIndex) => {
      const value = feed.nutrients[bound.nutrient] ?? 0;
      if (bound.min !== undefined) coefficients[`nutrient_min_${boundIndex}`] = costBasis === "dry" ? value : dm * (value - bound.min);
      if (bound.max !== undefined) coefficients[`nutrient_max_${boundIndex}`] = costBasis === "dry" ? value : dm * (value - bound.max);
    });
    selected.forEach(({ item }, boundIndex) => {
      const own = index === boundIndex ? 1 : 0;
      // Converte limites de inclusão diferentes da base das variáveis sem presumir MS constante.
      const factor = diet.basis === "natural" ? 1 / dm : dm;
      if (item.minPct !== undefined) coefficients[`min_${boundIndex}`] = diet.basis === costBasis ? own : (own - item.minPct / 100) * factor;
      if (item.maxPct !== undefined) coefficients[`max_${boundIndex}`] = diet.basis === costBasis ? own : (own - item.maxPct / 100) * factor;
    });
    model.variables[`feed_${index}`] = coefficients;
  });
  const rawSolution: unknown = solver.Solve(model);
  if (!rawSolution || typeof rawSolution !== "object") throw new NutritionError("O otimizador não retornou um resultado válido.");
  const solution = rawSolution as Record<string, unknown>;
  if (!solution.feasible || !solution.bounded) return { status: "infeasible", message: "Não há mistura viável para os limites informados. Revise os nutrientes e as inclusões." };
  const rawShares = selected.map((_, index) => Number(solution[`feed_${index}`] ?? 0));
  if (rawShares.some((share) => !Number.isFinite(share) || share < -TOLERANCE)) throw new NutritionError("O otimizador retornou inclusões inválidas.");
  const shares = rawShares.map((share) => Math.max(0, share));
  const shareTotal = shares.reduce((sum, value) => sum + value, 0);
  const outputShares = selected.map(({ feed }, index) => {
    if (diet.basis === costBasis) return shares[index];
    return diet.basis === "natural" ? shares[index] / (feed.dryMatterPct / 100) : shares[index] * (feed.dryMatterPct / 100);
  });
  const outputTotal = outputShares.reduce((sum, value) => sum + value, 0);
  if (Math.abs(shareTotal - 1) > TOLERANCE || !Number.isFinite(outputTotal) || outputTotal <= 0) {
    return { status: "infeasible", message: "O resultado numérico não fechou o balanço de massa. Revise a formulação." };
  }
  const optimized: NutritionDiet = {
    ...diet,
    ingredients: selected.map(({ item }, index) => ({ ...item, percentage: outputShares[index] / outputTotal * 100 })),
  };
  const calculation = calculateDiet(optimized, feeds);
  if (!calculation.compliant) return { status: "infeasible", message: "O resultado numérico não atendeu aos limites com a tolerância exigida. Revise a formulação." };
  return { status: "optimal", diet: optimized, calculation };
}
