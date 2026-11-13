import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolicySection } from "../types/commercial";
import type { Database } from "../types/database.types";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export type CommercialPolicy = {
  id: string;
  version: string;
  sections: PolicySection[];
};

function plainPolicyContent(content: string, pending: boolean) {
  const plain = content.replace(/<[^>]+>/g, "");
  return pending ? plain.replace(/^A definir\.\s*/, "") : plain;
}

export async function loadCommercialPolicy(client: SupabaseClient<Database>): Promise<CommercialPolicy> {
  const versionResult = await client
    .from("commercial_policy_versions")
    .select("id,version")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const version = ensureData(versionResult.data, versionResult.error);
  if (!version) throw new CommercialDataServiceError();

  const sectionsResult = await client
    .from("commercial_policy_sections")
    .select("section_number,title,content,is_pending,display_order")
    .eq("policy_version_id", version.id)
    .order("display_order");
  const rows = ensureData(sectionsResult.data, sectionsResult.error);
  if (rows.length === 0) throw new CommercialDataServiceError();

  return {
    id: version.id,
    version: version.version,
    sections: rows.map((section) => ({
      title: `${section.section_number}. ${section.title}`,
      content: plainPolicyContent(section.content, section.is_pending),
      pending: section.is_pending || undefined,
    })),
  };
}
