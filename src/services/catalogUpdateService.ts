import { supabase } from "../lib/supabase";
import type { Json } from "../types/database.types";

export type CatalogUpdatePayload = {
  file_name: string;
  products: Array<{ id: string; weight: number; prices: Array<{ payment_term_id: string; unit_price: number }> }>;
  new_products: Array<{ name: string; category: string; weight: number; prices: Array<{ payment_term_id: string; unit_price: number }> }>;
  discounts: Array<{ id: string; percentage: number }>;
  freight: Array<{ table: "juara" | "regional"; id: string; rates: Record<string, number | null> }>;
};

export type CatalogUpdateResult = { products: number; new_products: number; discounts: number; freight: number };

export class CatalogUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogUpdateError";
  }
}

/** Aplica no banco, numa única transação, o que foi confirmado na tela. */
export async function applyCatalogUpdate(payload: CatalogUpdatePayload): Promise<CatalogUpdateResult> {
  if (!supabase) throw new CatalogUpdateError("O sistema está sem conexão com o servidor. Contate o administrador.");
  const { data, error } = await supabase.rpc("apply_catalog_update", { p_payload: payload as unknown as Json });
  if (error) {
    const readable = (error.code === "22023" || error.code === "23505") && error.message;
    throw new CatalogUpdateError(readable || "Não foi possível aplicar a atualização. Nada foi alterado.");
  }
  return data as unknown as CatalogUpdateResult;
}
