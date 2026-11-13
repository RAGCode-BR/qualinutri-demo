export const NUTRIENTS = [
  { key: "crudeProtein", label: "Proteína bruta", unit: "% MS" },
  { key: "ndf", label: "Fibra em detergente neutro", unit: "% MS" },
  { key: "adf", label: "Fibra em detergente ácido", unit: "% MS" },
  { key: "etherExtract", label: "Extrato etéreo", unit: "% MS" },
  { key: "ash", label: "Matéria mineral", unit: "% MS" },
  { key: "starch", label: "Amido", unit: "% MS" },
  { key: "calcium", label: "Cálcio", unit: "% MS" },
  { key: "phosphorus", label: "Fósforo", unit: "% MS" },
  { key: "metabolizableEnergy", label: "Energia metabolizável", unit: "Mcal/kg MS" },
] as const;

export type NutritionFeed = {
  id: string;
  name: string;
  dryMatterPct: number;
  /** Preço por kg do alimento na matéria natural. */
  pricePerKgNatural: number;
  /** Importação sem preço explícito, aguardando conferência do usuário. */
  pricePending?: boolean;
  /** Concentrações na matéria seca, nas unidades declaradas em NUTRIENTS. */
  nutrients: Record<string, number>;
  category?: string;
  source?: string;
  notes?: string;
};

export type RationIngredient = {
  feedId: string;
  percentage: number;
  /** Limites de inclusão na mesma base declarada na dieta. */
  minPct?: number;
  maxPct?: number;
};

export type NutrientBound = { nutrient: string; min?: number; max?: number };
export type NutritionAnimal = {
  category: "corte" | "leite" | "outro";
  name?: string;
  bodyWeightKg?: number;
  targetGainKgDay?: number;
  milkKgDay?: number;
  notes?: string;
};

export type NutritionEconomics = {
  milkKgDay?: number;
  milkPricePerKg?: number;
  gainKgDay?: number;
  gainPricePerKg?: number;
  otherCostPerHeadDay?: number;
};

export type NutritionDiet = {
  id: string;
  name: string;
  basis: "natural" | "dry";
  /** Base do custo minimizado. Ausente mantém custo por kg de MS. */
  costBasis?: "natural" | "dry";
  ingredients: RationIngredient[];
  /** Peso natural do lote a misturar. */
  batchKg: number;
  /** Consumo de matéria seca explicitamente informado por animal/dia. */
  dryMatterIntakeKg: number;
  heads: number;
  days: number;
  nutrientBounds: NutrientBound[];
  animal?: NutritionAnimal;
  economics?: NutritionEconomics;
  notes?: string;
  updatedAt?: string;
};

export type NutritionTables = { feeds: NutritionFeed[]; diets: NutritionDiet[] };

export type DietIngredientResult = {
  feedId: string;
  name: string;
  naturalPct: number;
  dryPct: number;
  batchKg: number;
  batchDryKg: number;
  naturalKgPerHeadDay: number;
  dryKgPerHeadDay: number;
  totalNaturalKg: number;
  totalDryKg: number;
  batchCost: number;
  costPerHeadDay: number;
  totalCost: number;
};

export type DietConstraintResult = {
  kind: "ingredient" | "nutrient";
  key: string;
  value: number;
  min?: number;
  max?: number;
  satisfied: boolean;
};

export type DietCalculation = {
  ingredients: DietIngredientResult[];
  dryMatterPct: number;
  batchKg: number;
  batchDryKg: number;
  batchCost: number;
  naturalKgPerHeadDay: number;
  dryKgPerHeadDay: number;
  costPerKgNatural: number;
  costPerKgDry: number;
  costPerTonNatural: number;
  costPerTonDry: number;
  costPerHeadDay: number;
  totalNaturalKg: number;
  totalDryKg: number;
  totalCost: number;
  nutrients: Record<string, number>;
  /** Nutrientes sem análise em algum ingrediente incluído. Não são presumidos como zero. */
  incompleteNutrients: string[];
  constraints: DietConstraintResult[];
  compliant: boolean;
  economics: null | {
    revenuePerHeadDay: number;
    otherCostPerHeadDay: number;
    grossMarginPerHeadDay: number;
    totalRevenue: number;
    totalGrossMargin: number;
  };
};

export type DietOptimization =
  | { status: "optimal"; diet: NutritionDiet; calculation: DietCalculation }
  | { status: "infeasible"; message: string };
