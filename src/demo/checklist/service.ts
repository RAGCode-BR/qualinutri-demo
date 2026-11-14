import { getDemoViewer, viewerName } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { isoDateTime, newId, today } from "../store/ids";
import { evaluateStatus, targetsFor } from "./compliance";
import { TAB_BY_ID } from "./tabs";
import type { ChecklistRecord, ChecklistTables, ChecklistTabId, EvidenceRef, FieldValue } from "./types";

export type RecordInput = {
  id?: string;
  tab: ChecklistTabId;
  targetId: string | null;
  checks: Record<string, boolean>;
  values: Record<string, FieldValue>;
  notes: string;
  evidence: EvidenceRef[];
  stage?: string | null;
  date?: string;
};

export class ChecklistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecklistError";
  }
}

function requireWriter() {
  if (getDemoViewer().role === "consulta") throw new ChecklistError("O perfil Consulta só visualiza o módulo.");
}

/** Grava (cria ou edita) um registro; a situação é sempre recalculada pela regra da aba. */
export async function saveRecord(input: RecordInput): Promise<ChecklistRecord> {
  requireWriter();
  const tab = TAB_BY_ID[input.tab];
  if (tab.target && !input.targetId) throw new ChecklistError(`Escolha o ${tab.targetLabel?.toLowerCase() ?? "item"}.`);
  const unanswered = tab.checks.filter((item) => typeof input.checks[item] !== "boolean");
  if (unanswered.length) throw new ChecklistError(`Confira todos os itens do checklist: ${unanswered.length === 1 ? `falta “${unanswered[0]}”` : `faltam ${unanswered.length} itens`}.`);
  for (const field of tab.fields) {
    const value = input.values[field.key];
    if (field.required && (value === null || value === undefined || value === "")) throw new ChecklistError(`Preencha “${field.label}”.`);
  }
  await simulateLatency(null);
  const tables = db.read();
  const existing = input.id ? tables.checklist.records.find((record) => record.id === input.id) : undefined;
  const stage = tab.stages ? (input.stage ?? existing?.stage ?? tab.stages[0]) : null;
  const target = input.targetId ? targetsFor(input.tab, tables).find((item) => item.id === input.targetId) : undefined;
  const at = isoDateTime(today());
  const record: ChecklistRecord = {
    id: existing?.id ?? newId(),
    tab: input.tab,
    date: input.date ?? existing?.date ?? at,
    responsible: existing?.responsible ?? viewerName(),
    status: evaluateStatus(input.tab, { checks: input.checks, values: input.values, stage }, tables, today()),
    stage,
    targetId: input.targetId,
    targetLabel: target ? target.label : existing?.targetLabel ?? null,
    values: input.values,
    checks: input.checks,
    notes: input.notes.trim(),
    evidence: input.evidence,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
  db.write((current) => {
    const list = current.checklist.records;
    const index = list.findIndex((item) => item.id === record.id);
    if (index >= 0) list[index] = record;
    else list.push(record);
  });
  return record;
}

/** Move um registro de etapa (quadro arrastável). */
export async function moveStage(recordId: string, stage: string): Promise<void> {
  requireWriter();
  const record = db.read().checklist.records.find((item) => item.id === recordId);
  if (!record) throw new ChecklistError("Registro não encontrado.");
  await saveRecord({ ...record, stage });
}

export async function deleteRecord(recordId: string): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => { tables.checklist.records = tables.checklist.records.filter((record) => record.id !== recordId); });
}

type RegistryKey = Exclude<keyof ChecklistTables, "records">;

/** Cadastros do módulo: cria/edita item (com id) ou desativa. */
export async function saveRegistryItem<K extends RegistryKey>(key: K, item: ChecklistTables[K][number]): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => {
    const list = tables.checklist[key] as Array<{ id: string }>;
    const index = list.findIndex((row) => row.id === (item as { id: string }).id);
    if (index >= 0) list[index] = item as { id: string };
    else list.push(item as { id: string });
  });
}
