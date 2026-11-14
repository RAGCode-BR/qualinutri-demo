import type { PolicySection } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";
import { logCatalogChange, requireAdmin } from "./common";

export type CommercialPolicy = {
  id: string;
  version: string;
  sections: PolicySection[];
};

export async function loadCommercialPolicy(_client?: unknown): Promise<CommercialPolicy> {
  return simulateLatency(() => {
    const { catalog } = db.read();
    return { id: catalog.policyVersionId ?? "policy-demo", version: catalog.policyVersion, sections: clone(catalog.policySections) };
  });
}

export class PolicyServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyServiceError";
  }
}

/** Altera o texto de uma seção da política vigente e registra no histórico de alterações. */
export async function savePolicySection(title: string, content: string, pending: boolean): Promise<void> {
  requireAdmin(PolicyServiceError);
  const text = content.trim();
  if (!text) throw new PolicyServiceError("O texto da seção não pode ficar vazio.");
  if (!db.read().catalog.policySections.some((section) => section.title === title)) throw new PolicyServiceError("Seção não encontrada.");
  await simulateLatency(null);
  db.write(({ catalog }) => {
    catalog.policySections = catalog.policySections.map((section) => section.title === title ? { ...section, content: text, pending } : section);
  });
  logCatalogChange(`Política: seção "${title}" alterada`);
}
