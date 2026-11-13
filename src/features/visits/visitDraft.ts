import type { Visit } from "../../services/visitService";
import type { VisitType } from "./visitModel";

/** Registro de visita interrompido para criar um orçamento na Calculadora. */
export type VisitDraft = {
  visitId: string | null;
  sellerId: string;
  customerId: string;
  propertyId: string;
  visitedDate: string;
  developed: string;
  types: VisitType[];
  nextAction: string;
  returnDate: string;
  /** Visita agendada que estava sendo registrada, se houver. */
  visit?: Visit;
};

// Guardado em memória: sobrevive à troca de página, não a recarregar o site.
let pending: VisitDraft | null = null;

export function saveVisitDraft(draft: VisitDraft) {
  pending = draft;
}

export function takeVisitDraft(): VisitDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}

export function hasVisitDraft() {
  return pending !== null;
}
