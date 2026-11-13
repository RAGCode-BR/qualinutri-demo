import type { NutritionDiet, NutritionFeed } from "./types";

export type Recipe = NutritionDiet & {
  kind: "corte" | "leite" | "concentrado" | "usuario";
  customerId?: string;
  lot?: string;
  mixer?: {
    capacityKg: [number, number, number];
    assignment: Record<string, 1 | 2 | 3>;
    overrides: Record<string, number>;
  };
};

export type SourceNutrient = { id: string; code: string; name: string; unit: string; storage: string };
export type ImportedDiet = {
  id: string;
  name: string;
  fileName: string;
  fields: Record<string, string>;
  tables: { name: string; rows: Record<string, string>[] }[];
};
export type NutritionWorkspace = {
  feeds: NutritionFeed[];
  diets: Recipe[];
  sourceNutrients: SourceNutrient[];
  imported: ImportedDiet[];
};
