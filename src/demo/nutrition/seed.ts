import type { Recipe, NutritionWorkspace } from "./model";

export function newRecipe(id: string = crypto.randomUUID()): Recipe {
  return {
    id, name: "Nova formulação", kind: "usuario", basis: "natural", ingredients: [],
    batchKg: 1000, dryMatterIntakeKg: 10, heads: 20, days: 30, nutrientBounds: [],
    animal: { category: "outro" }, economics: { otherCostPerHeadDay: 0 },
  };
}

/** Composições fictícias para exercitar cálculos, editáveis pelo usuário. */
export function buildNutrition(): NutritionWorkspace {
  return {
    feeds: [
      { id: "nut-milho", name: "Milho em grão", category: "Energético", dryMatterPct: 88, pricePerKgNatural: 1.12,
        source: "Composição fictícia da demo", nutrients: { crudeProtein: 9, ndf: 12, adf: 4, etherExtract: 4, ash: 2, starch: 70, calcium: .03, phosphorus: .28, metabolizableEnergy: 3.2 } },
      { id: "nut-soja", name: "Farelo de soja", category: "Proteico", dryMatterPct: 89, pricePerKgNatural: 2.31,
        source: "Composição fictícia da demo", nutrients: { crudeProtein: 48, ndf: 14, adf: 8, etherExtract: 2, ash: 7, starch: 5, calcium: .3, phosphorus: .65, metabolizableEnergy: 3 } },
      { id: "nut-premix", name: "Premix mineral", category: "Mineral", dryMatterPct: 98, pricePerKgNatural: 6.9,
        source: "Composição fictícia da demo", nutrients: { crudeProtein: 0, ndf: 0, adf: 0, etherExtract: 0, ash: 95, starch: 0, calcium: 20, phosphorus: 5, metabolizableEnergy: 0 } },
      { id: "nut-silagem", name: "Silagem de milho (demo)", category: "Volumoso", dryMatterPct: 35, pricePerKgNatural: .3,
        source: "Composição fictícia da demo", nutrients: { crudeProtein: 8, ndf: 48, adf: 28, etherExtract: 3, ash: 5, starch: 30, calcium: .25, phosphorus: .2, metabolizableEnergy: 2.3 } },
    ],
    diets: [
      { ...newRecipe("nut-example"), name: "Concentrado de exemplo", kind: "concentrado", basis: "natural", costBasis: "natural",
        ingredients: [{ feedId: "nut-milho", percentage: 70, minPct: 0, maxPct: 90 },
          { feedId: "nut-soja", percentage: 28, minPct: 0, maxPct: 60 },
          { feedId: "nut-premix", percentage: 2, minPct: 2, maxPct: 2 }],
        nutrientBounds: [{ nutrient: "crudeProtein", min: 18, max: 24 }],
        notes: "Exemplo fictício para testar avaliação, otimização e produção." },
    ],
    sourceNutrients: [], imported: [],
  };
}
