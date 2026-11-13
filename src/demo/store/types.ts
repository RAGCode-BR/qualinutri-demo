import type { CommercialData } from "../../types/commercial";
import type { Database } from "../../types/database.types";
import type { UserProfile } from "../../types/auth";
import type { ChecklistTables } from "../checklist/types";
import type { ErpTables } from "../erp/types";

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type DemoCatalog = CommercialData & {
  anticipatedPercentage: number;
  changeLog: { at: string; who: string; what: string }[];
};

export type DemoUser = UserProfile & { createdAt: string };

export type Payable = {
  id: string;
  supplier: string;
  category: "Matéria-prima" | "Manutenção da frota" | "Frete" | "Serviços" | "Energia";
  description: string;
  dueDate: string;
  amount: number;
  paidAt: string | null;
};

export type CatalogImport = { id: string; appliedAt: string; fileName: string; kind: string; changes: number; appliedBy: string };

export type DemoTables = {
  nutrition?: import("../nutrition/model").NutritionWorkspace;
  catalog: DemoCatalog;
  profiles: DemoUser[];
  customers: Row<"customers">[];
  customer_properties: Row<"customer_properties">[];
  quotes: Row<"quotes">[];
  quote_items: Row<"quote_items">[];
  visits: Row<"visits">[];
  vehicles: Row<"vehicles">[];
  pallet_settings: Row<"pallet_settings">;
  loads: Row<"loads">[];
  load_items: Row<"load_items">[];
  catalog_imports: CatalogImport[];
  payables: Payable[];
  checklist: ChecklistTables;
  erp: ErpTables;
  seq: { quote: number; load: number };
};
