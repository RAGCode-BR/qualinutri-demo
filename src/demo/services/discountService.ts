import type { DiscountLine } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import { logCatalogChange, normalizeName, requireAdmin } from "./common";

export class DiscountServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscountServiceError";
  }
}

export async function loadDiscountLines(_client?: unknown): Promise<{ lines: DiscountLine[]; tableId: string; anticipatedPercentage: number }> {
  return simulateLatency(() => {
    const { catalog } = db.read();
    return { lines: clone(catalog.discountLines), tableId: catalog.discountTableId ?? "", anticipatedPercentage: catalog.anticipatedPercentage };
  });
}

/** Cria uma linha de desconto (sem id) ou edita uma existente. */
export async function saveDiscountRule(ruleId: string | null, name: string, percentage: number): Promise<void> {
  requireAdmin(DiscountServiceError);
  const trimmed = name.trim();
  if (!trimmed) throw new DiscountServiceError("Informe o nome da linha de desconto.");
  if (!(percentage >= 0 && percentage <= 100)) throw new DiscountServiceError("O percentual deve estar entre 0 e 100.");
  const { catalog } = db.read();
  if (catalog.discountLines.some((line) => line.id !== ruleId && normalizeName(line.name) === normalizeName(trimmed))) {
    throw new DiscountServiceError("Já existe uma linha de desconto com esse nome.");
  }
  await simulateLatency(null);
  db.write(({ catalog: current }) => {
    if (ruleId) {
      current.discountLines = current.discountLines.map((line) => line.id === ruleId ? { ...line, name: trimmed, percentage } : line);
      return;
    }
    const customIndex = current.discountLines.findIndex((line) => line.percentage === null);
    const line = { id: newId(), name: trimmed, percentage };
    if (customIndex < 0) current.discountLines.push(line);
    else current.discountLines.splice(customIndex, 0, line);
  });
  logCatalogChange(ruleId ? `Desconto "${trimmed}" alterado para ${percentage}%` : `Desconto "${trimmed}" criado (${percentage}%)`);
}

export async function deactivateDiscountRule(ruleId: string): Promise<void> {
  requireAdmin(DiscountServiceError);
  await simulateLatency(null);
  const line = db.read().catalog.discountLines.find((item) => item.id === ruleId);
  if (!line) throw new DiscountServiceError("Não foi possível excluir a linha de desconto.");
  if (line.percentage === null) throw new DiscountServiceError("A linha personalizada não pode ser excluída.");
  db.write(({ catalog }) => { catalog.discountLines = catalog.discountLines.filter((item) => item.id !== ruleId); });
  logCatalogChange(`Desconto "${line.name}" excluído`);
}
