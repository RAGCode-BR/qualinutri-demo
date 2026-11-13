import type { PolicySection } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";

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
