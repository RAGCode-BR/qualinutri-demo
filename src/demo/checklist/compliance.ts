import type { DemoAlert } from "../kpis/alerts";
import type { DemoTables } from "../store/types";
import { addDays, isoDate } from "../store/ids";
import { CHECKLIST_TABS, TAB_BY_ID } from "./tabs";
import type { ChecklistRecord, ChecklistTabId, FieldValue, RecordStatus } from "./types";

/** Equipamentos do cadastro que fazem parte da frota (além dos caminhões). */
export const FLEET_KINDS: ReadonlySet<string> = new Set(["Veículo leve", "Movimentação"]);

type Draft = Pick<ChecklistRecord, "checks" | "values" | "stage">;
export type Target = { id: string; label: string; sub?: string };

function num(value: FieldValue | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parâmetros fora do padrão do insumo escolhido (min/max do cadastro). */
export function outOfStandard(tabId: ChecklistTabId, values: Record<string, FieldValue>, tables: DemoTables): string[] {
  const material = tables.checklist.materials.find((item) => item.id === values.material);
  if (!material) return [];
  const problems: string[] = [];
  for (const field of TAB_BY_ID[tabId].fields) {
    if (!field.standardParam) continue;
    const standard = material.standards.find((item) => item.param === field.standardParam);
    const value = num(values[field.key]);
    if (!standard || value === null) continue;
    if (standard.max !== undefined && value > standard.max) problems.push(`${field.label} ${value}${standard.unit} (máx. ${standard.max}${standard.unit})`);
    if (standard.min !== undefined && value < standard.min) problems.push(`${field.label} ${value}${standard.unit} (mín. ${standard.min}${standard.unit})`);
  }
  return problems;
}

function lastStage(tabId: ChecklistTabId) {
  return TAB_BY_ID[tabId].stages?.at(-1) ?? null;
}

/** Situação calculada pela regra de cada aba. */
export function evaluateStatus(tabId: ChecklistTabId, draft: Draft, tables: DemoTables, today: Date): RecordStatus {
  const tab = TAB_BY_ID[tabId];
  const failedCheck = Object.values(draft.checks).some((value) => value === false);
  const closed = !tab.stages || draft.stage === lastStage(tabId);
  const todayKey = isoDate(today);
  const values = draft.values;
  switch (tabId) {
    case "maintenance":
      if (failedCheck) return "nao_conforme";
      return closed ? "conforme" : "pendente";
    case "logistics":
    case "fleetCheck":
      return failedCheck ? "nao_conforme" : "conforme";
    case "safety":
      if (failedCheck || values.training === false) return "nao_conforme";
      if (typeof values.caValidity === "string" && values.caValidity && values.caValidity < todayKey) return "nao_conforme";
      return "conforme";
    case "rawMaterials":
      if (failedCheck || values.decision === "Recusado" || outOfStandard(tabId, values, tables).length) return "nao_conforme";
      return "conforme";
    case "quality":
      if (closed) return "conforme";
      if (values.severity === "Alta") return "nao_conforme";
      if (typeof values.deadline === "string" && values.deadline && values.deadline < todayKey) return "nao_conforme";
      return "pendente";
    case "samples":
      if (failedCheck || values.result === "Reprovada") return "nao_conforme";
      return closed ? "conforme" : "pendente";
    case "rawAnalyses":
    case "results":
      return outOfStandard(tabId, values, tables).length ? "nao_conforme" : "conforme";
    case "production":
      return closed ? "conforme" : "nao_conforme";
    case "pests": {
      const consumption = num(values.consumption);
      return failedCheck || (consumption !== null && consumption > 20) ? "nao_conforme" : "conforme";
    }
    case "cleaning":
      if (failedCheck) return "nao_conforme";
      if (num(values.waste) && !values.destination) return "nao_conforme";
      return "conforme";
  }
}

export function recordCost(tabId: ChecklistTabId, values: Record<string, FieldValue>): number {
  return TAB_BY_ID[tabId].fields.filter((field) => field.cost).reduce((total, field) => total + (num(values[field.key]) ?? 0), 0);
}

export function targetsFor(tabId: ChecklistTabId, tables: DemoTables): Target[] {
  const tab = TAB_BY_ID[tabId];
  const vehicles = tables.vehicles.filter((vehicle) => vehicle.active).map((vehicle) => ({ id: vehicle.id, label: vehicle.name, sub: vehicle.plate ?? undefined }));
  switch (tab.target) {
    case "vehicle":
      if (tabId === "maintenance") return [...vehicles, ...tables.checklist.equipment.filter((item) => item.active).map((item) => ({ id: item.id, label: item.name, sub: item.location }))];
      // Conferência: caminhões, carros e empilhadeira (a frota que roda).
      if (tabId === "fleetCheck") return [...vehicles, ...tables.checklist.equipment.filter((item) => item.active && FLEET_KINDS.has(item.kind)).map((item) => ({ id: item.id, label: item.name, sub: item.location }))];
      return vehicles;
    case "employee":
      return tables.checklist.employees.filter((item) => item.active).map((item) => ({ id: item.id, label: item.name, sub: `${item.role} · ${item.sector}` }));
    case "pestPoint":
      return tables.checklist.pestPoints.filter((item) => item.active).map((item) => ({ id: item.id, label: item.code, sub: `${item.kind} · ${item.area}` }));
    case "cleaningArea":
      return tables.checklist.cleaningAreas.filter((item) => item.active).map((item) => ({ id: item.id, label: item.name, sub: `A cada ${item.frequencyDays} dias` }));
    default:
      return [];
  }
}

function frequencyFor(tabId: ChecklistTabId, targetId: string, tables: DemoTables) {
  if (TAB_BY_ID[tabId].target === "cleaningArea") return tables.checklist.cleaningAreas.find((area) => area.id === targetId)?.frequencyDays ?? 7;
  return TAB_BY_ID[tabId].frequencyDays ?? null;
}

export type OverdueTarget = Target & { lastDate: string | null; dueDate: string };

/** Alvos sem registro dentro da frequência (ou com revisão vencida, na manutenção). */
export function overdueTargets(tabId: ChecklistTabId, tables: DemoTables, today: Date): OverdueTarget[] {
  const todayKey = isoDate(today);
  const records = tables.checklist.records.filter((record) => record.tab === tabId);
  const result: OverdueTarget[] = [];
  for (const target of targetsFor(tabId, tables)) {
    const frequency = frequencyFor(tabId, target.id, tables);
    if (!frequency) continue;
    const mine = records.filter((record) => record.targetId === target.id).sort((a, b) => b.date.localeCompare(a.date));
    const last = mine[0];
    const lastDate = last ? isoDate(new Date(last.date)) : null;
    let due = lastDate ? isoDate(addDays(new Date(last.date), frequency)) : todayKey;
    if (tabId === "maintenance") {
      const scheduled = mine.find((record) => typeof record.values.nextDate === "string" && record.values.nextDate);
      if (scheduled) due = String(scheduled.values.nextDate);
    }
    if (due <= todayKey) result.push({ ...target, lastDate, dueDate: due });
  }
  return result;
}

/** Revisões que vencem nos próximos dias (lembrete). */
export function upcomingMaintenance(tables: DemoTables, today: Date, days = 7): OverdueTarget[] {
  const todayKey = isoDate(today);
  const limit = isoDate(addDays(today, days));
  return targetsFor("maintenance", tables).flatMap((target) => {
    const next = tables.checklist.records
      .filter((record) => record.tab === "maintenance" && record.targetId === target.id && typeof record.values.nextDate === "string" && record.values.nextDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const due = next ? String(next.values.nextDate) : null;
    return due && due > todayKey && due <= limit ? [{ ...target, lastDate: isoDate(new Date(next!.date)), dueDate: due }] : [];
  });
}

export type TabSummary = { done: number; nonConforming: number; pending: number; overdue: number; pct: number; trend: number[]; cost: number; total: number };

export function tabSummary(tabId: ChecklistTabId, tables: DemoTables, today: Date, days = 30): TabSummary {
  const from = isoDate(addDays(today, -days + 1));
  const records = tables.checklist.records.filter((record) => record.tab === tabId);
  const inPeriod = records.filter((record) => isoDate(new Date(record.date)) >= from);
  const done = inPeriod.filter((record) => record.status === "conforme").length;
  const nonConforming = records.filter((record) => record.status === "nao_conforme" && (isoDate(new Date(record.date)) >= from || (TAB_BY_ID[tabId].stages && record.stage !== lastStage(tabId)))).length;
  const openPending = records.filter((record) => record.status === "pendente").length;
  const overdue = overdueTargets(tabId, tables, today).length;
  const pending = openPending + overdue;
  const base = done + nonConforming + pending;
  const trend = Array.from({ length: 14 }, (_, index) => {
    const day = isoDate(addDays(today, index - 13));
    return records.filter((record) => isoDate(new Date(record.date)) === day).length;
  });
  return { done, nonConforming, pending, overdue, pct: base ? Math.round((done / base) * 100) : 100, trend, cost: inPeriod.reduce((total, record) => total + recordCost(tabId, record.values), 0), total: inPeriod.length };
}

export function costByTarget(tabId: ChecklistTabId, tables: DemoTables): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of tables.checklist.records) {
    if (record.tab !== tabId || !record.targetId) continue;
    map.set(record.targetId, (map.get(record.targetId) ?? 0) + recordCost(tabId, record.values));
  }
  return map;
}

export type Attention = { id: string; tab: ChecklistTabId; level: "high" | "medium"; title: string; detail: string; recordId?: string };

/** Lista única do que precisa de atenção no módulo, mais grave primeiro. */
export function attentionList(tables: DemoTables, today: Date): Attention[] {
  const list: Attention[] = [];
  const date = (key: string) => key.split("-").reverse().join("/");
  for (const tab of CHECKLIST_TABS) {
    for (const record of tables.checklist.records.filter((item) => item.tab === tab.id && item.status === "nao_conforme")) {
      const open = !tab.stages || record.stage !== lastStage(tab.id);
      const recent = isoDate(new Date(record.date)) >= isoDate(addDays(today, -14));
      if (!open && !recent) continue;
      if (tab.stages && !open) continue;
      if (!tab.stages && !recent) continue;
      list.push({ id: `nc-${record.id}`, tab: tab.id, level: "high", recordId: record.id, title: `${tab.short}: fora de conformidade`, detail: `${record.targetLabel ?? summaryLine(tab.id, record, tables)} · ${date(isoDate(new Date(record.date)))}` });
    }
    for (const target of overdueTargets(tab.id, tables, today)) {
      list.push({ id: `od-${tab.id}-${target.id}`, tab: tab.id, level: "medium", title: `${tab.short}: ${tab.id === "maintenance" ? "revisão vencida" : "registro atrasado"}`, detail: `${target.label} · ${target.lastDate ? `último em ${date(target.lastDate)}` : "sem registro"}` });
    }
    if (tab.stages) {
      for (const record of tables.checklist.records.filter((item) => item.tab === tab.id && item.status === "pendente")) {
        list.push({ id: `op-${record.id}`, tab: tab.id, level: "medium", recordId: record.id, title: `${tab.short}: ${record.stage ?? "aberto"}`, detail: `${record.targetLabel ?? summaryLine(tab.id, record, tables)} · ${date(isoDate(new Date(record.date)))}` });
      }
    }
  }
  for (const target of upcomingMaintenance(tables, today)) {
    list.push({ id: `up-${target.id}`, tab: "maintenance", level: "medium", title: "Manutenção: revisão próxima", detail: `${target.label} · vence em ${date(target.dueDate)}` });
  }
  return list.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
}

/** Frase curta que identifica um registro sem alvo (fornecedor, lote, código…). */
export function summaryLine(tabId: ChecklistTabId, record: Pick<ChecklistRecord, "values">, tables: DemoTables): string {
  const values = record.values;
  const supplier = tables.checklist.suppliers.find((item) => item.id === values.supplier)?.name;
  const material = tables.checklist.materials.find((item) => item.id === values.material)?.name;
  const product = tables.catalog.products.find((item) => item.id === values.product)?.name;
  switch (tabId) {
    case "rawMaterials": return [material, supplier].filter(Boolean).join(" · ") || "Recepção";
    case "rawAnalyses": return [material, values.lot && `lote ${values.lot}`, supplier].filter(Boolean).join(" · ");
    case "results": return [values.report && `Laudo ${values.report}`, material, values.lot && `lote ${values.lot}`].filter(Boolean).join(" · ");
    case "samples": return [values.code, values.item, values.lot && `lote ${values.lot}`].filter(Boolean).join(" · ");
    case "quality": return [values.type, values.severity && `gravidade ${String(values.severity).toLowerCase()}`].filter(Boolean).join(" · ");
    case "production": return [values.type, product, values.lot && `lote ${values.lot}`].filter(Boolean).join(" · ");
    case "logistics": return String(values.route ?? "Viagem");
    default: return "Registro";
  }
}

export function checklistAlerts(tables: DemoTables, today: Date): DemoAlert[] {
  return attentionList(tables, today).filter((item) => item.level === "high" || item.id.startsWith("od-") || item.id.startsWith("up-"))
    .map((item) => ({ id: `ck-${item.id}`, level: item.level, title: item.title, detail: item.detail, tab: "checklist" as const }));
}
