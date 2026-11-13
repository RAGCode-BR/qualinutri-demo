import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DiscountLine } from "../types/commercial";
import type { Database } from "../types/database.types";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export async function loadDiscountLines(client: SupabaseClient<Database>): Promise<{ lines: DiscountLine[]; tableId: string; anticipatedPercentage: number }> {
  const tableResult = await client
    .from("discount_tables")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const table = ensureData(tableResult.data, tableResult.error);
  if (!table) throw new CommercialDataServiceError();

  const rulesResult = await client
    .from("discount_rules")
    .select("id,name,percentage,rule_kind,display_order")
    .eq("discount_table_id", table.id)
    .eq("active", true)
    .in("rule_kind", ["line", "custom", "anticipated"])
    .order("display_order");
  const rules = ensureData(rulesResult.data, rulesResult.error);
  if (rules.length === 0) throw new CommercialDataServiceError();

  const anticipatedPercentage = rules.find((rule) => rule.rule_kind === "anticipated")?.percentage;
  return { tableId: table.id, anticipatedPercentage: Number(anticipatedPercentage ?? 1.5), lines: rules.filter((rule) => rule.rule_kind !== "anticipated").map((rule) => ({
    id: rule.id,
    name: rule.name,
    percentage: rule.percentage === null ? null : Number(rule.percentage),
  })) };
}

export class DiscountServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscountServiceError";
  }
}

function requireDiscountClient() {
  if (!supabase) throw new DiscountServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

/** Erros de validação do banco (22023, 23505) já vêm com mensagem para o usuário. */
function toDiscountError(error: { code?: string; message?: string }, fallback: string) {
  const readable = (error.code === "22023" || error.code === "23505") && error.message;
  return new DiscountServiceError(readable || fallback);
}

/** Cria uma linha de desconto (sem id) ou edita uma existente. */
export async function saveDiscountRule(ruleId: string | null, name: string, percentage: number): Promise<void> {
  const { error } = await requireDiscountClient().rpc("save_discount_rule", {
    p_rule_id: ruleId,
    p_name: name,
    p_percentage: percentage,
  });
  if (error) throw toDiscountError(error, "Não foi possível salvar a linha de desconto.");
}

export async function deactivateDiscountRule(ruleId: string): Promise<void> {
  const { error } = await requireDiscountClient().rpc("deactivate_discount_rule", { p_rule_id: ruleId });
  if (error) throw toDiscountError(error, "Não foi possível excluir a linha de desconto.");
}
