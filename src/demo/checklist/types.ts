export type ChecklistTabId =
  | "maintenance"
  | "logistics"
  | "safety"
  | "rawMaterials"
  | "quality"
  | "samples"
  | "rawAnalyses"
  | "results"
  | "production"
  | "pests"
  | "cleaning";

/** conforme = feito e dentro do padrão; pendente = aberto/aguardando; nao_conforme = fora do padrão. */
export type RecordStatus = "conforme" | "pendente" | "nao_conforme";

export type EvidenceRef = {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Evidência de exemplo desenhada pela demo (sem arquivo real). */
  placeholder?: string;
};

export type FieldValue = string | number | boolean | null;

export type ChecklistRecord = {
  id: string;
  tab: ChecklistTabId;
  /** Data/hora do registro (ISO). */
  date: string;
  responsible: string;
  status: RecordStatus;
  /** Etapa do fluxo (ex.: aberta, em execução, concluída), quando a aba tem fluxo. */
  stage: string | null;
  targetId: string | null;
  targetLabel: string | null;
  values: Record<string, FieldValue>;
  checks: Record<string, boolean>;
  notes: string;
  evidence: EvidenceRef[];
  createdAt: string;
  updatedAt: string;
};

export type Standard = { param: string; label: string; unit: string; min?: number; max?: number };

export type Supplier = { id: string; name: string; city: string; materials: string[]; active: boolean };
export type RawMaterial = { id: string; name: string; standards: Standard[] };
export type Employee = { id: string; name: string; role: string; sector: string; active: boolean };
export type Equipment = { id: string; name: string; kind: string; location: string; active: boolean };
export type PestPoint = { id: string; code: string; kind: string; area: string; active: boolean };
export type CleaningArea = { id: string; name: string; frequencyDays: number; sanitizer: string; active: boolean };

export type ChecklistTables = {
  suppliers: Supplier[];
  materials: RawMaterial[];
  employees: Employee[];
  equipment: Equipment[];
  pestPoints: PestPoint[];
  cleaningAreas: CleaningArea[];
  records: ChecklistRecord[];
};

export function emptyChecklistTables(): ChecklistTables {
  return { suppliers: [], materials: [], employees: [], equipment: [], pestPoints: [], cleaningAreas: [], records: [] };
}
