import { supabase } from "../lib/supabase";
import type { Packing, PalletSettings } from "../domain/loads/summarizeLoad";
import type { Database, Json } from "../types/database.types";

export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type LoadRow = Database["public"]["Tables"]["loads"]["Row"];
export type LoadStatus = "planned" | "loaded" | "shipped" | "cancelled";
export type LoadCandidate = Database["public"]["Functions"]["load_candidates"]["Returns"][number];

export class LoadServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com a carga.") {
    super(message);
    this.name = "LoadServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new LoadServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

/** Erros de regra do banco (22023, 23505, 42501) já vêm com mensagem para o usuário. */
function toLoadError(error: { code?: string; message?: string } | null, fallback: string) {
  const readable = (error?.code === "22023" || error?.code === "23505" || error?.code === "42501") && error.message;
  return new LoadServiceError(readable || fallback);
}

// ---------- Veículos ----------

export type VehicleInput = {
  name: string;
  plate: string;
  capacityKg: number;
  bodyLengthCm: number | null;
  bodyWidthCm: number | null;
  bodyHeightCm: number | null;
};

export async function listVehicles(includeInactive = false): Promise<Vehicle[]> {
  let query = requireClient().from("vehicles").select("*").order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error || !data) throw toLoadError(error, "Não foi possível carregar os veículos.");
  return data;
}

export async function saveVehicle(vehicleId: string | null, input: VehicleInput): Promise<string> {
  const { data, error } = await requireClient().rpc("save_vehicle", {
    p_vehicle_id: vehicleId,
    p_vehicle: {
      name: input.name,
      plate: input.plate,
      capacity_kg: input.capacityKg,
      body_length_cm: input.bodyLengthCm,
      body_width_cm: input.bodyWidthCm,
      body_height_cm: input.bodyHeightCm,
    },
  });
  if (error || !data) throw toLoadError(error, "Não foi possível salvar o veículo.");
  return data;
}

export async function deactivateVehicle(vehicleId: string): Promise<void> {
  const { error } = await requireClient().rpc("deactivate_vehicle", { p_vehicle_id: vehicleId });
  if (error) throw toLoadError(error, "Não foi possível excluir o veículo.");
}

// ---------- Dados de palete ----------

function toBagsPerPallet(value: Json): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, count]) => typeof count === "number" && count > 0)) as Record<string, number>;
}

export async function getPalletSettings(): Promise<PalletSettings> {
  const { data, error } = await requireClient().from("pallet_settings").select("pallet_weight_kg,bags_per_pallet").maybeSingle();
  if (error) throw toLoadError(error, "Não foi possível carregar os dados de palete.");
  return {
    palletWeightKg: data?.pallet_weight_kg === null || data?.pallet_weight_kg === undefined ? null : Number(data.pallet_weight_kg),
    bagsPerPallet: toBagsPerPallet(data?.bags_per_pallet ?? {}),
  };
}

export async function savePalletSettings(settings: PalletSettings): Promise<void> {
  const { error } = await requireClient().rpc("save_pallet_settings", {
    p_pallet_weight_kg: settings.palletWeightKg,
    p_bags_per_pallet: settings.bagsPerPallet,
  });
  if (error) throw toLoadError(error, "Não foi possível salvar os dados de palete.");
}

// ---------- Cargas ----------

export type LoadFilter = "open" | "shipped" | "cancelled" | "all";

export type LoadListItem = LoadRow & {
  load_items: Array<{ quantity: number; quote_id: string; stop_order: number; quotes: { quote_number: number; customer_name_snapshot: string | null } | null }>;
};

export async function listLoads(filter: LoadFilter): Promise<LoadListItem[]> {
  let query = requireClient()
    .from("loads")
    .select("*, load_items(quantity, quote_id, stop_order, quotes(quote_number, customer_name_snapshot))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "open") query = query.in("status", ["planned", "loaded"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query;
  if (error || !data) throw toLoadError(error, "Não foi possível carregar as cargas.");
  return data as unknown as LoadListItem[];
}

export type LoadDetailItem = {
  id: string;
  quote_item_id: string;
  quote_id: string;
  quantity: number;
  weight_kg_snapshot: number;
  packing: Packing;
  stop_order: number;
  quote_items: { product_name_snapshot: string; display_order: number } | null;
  quotes: {
    quote_number: number;
    customer_id: string | null;
    customer_name_snapshot: string | null;
    customers: { phone: string | null; address: Json | null } | null;
  } | null;
};

export type LoadDetail = { load: LoadRow; items: LoadDetailItem[] };

export async function getLoad(loadId: string): Promise<LoadDetail> {
  const client = requireClient();
  const [loadResult, itemsResult] = await Promise.all([
    client.from("loads").select("*").eq("id", loadId).single(),
    client
      .from("load_items")
      .select("id, quote_item_id, quote_id, quantity, weight_kg_snapshot, packing, stop_order, quote_items(product_name_snapshot, display_order), quotes(quote_number, customer_id, customer_name_snapshot, customers(phone, address))")
      .eq("load_id", loadId),
  ]);
  if (loadResult.error || !loadResult.data) throw toLoadError(loadResult.error, "Não foi possível abrir a carga.");
  if (itemsResult.error || !itemsResult.data) throw toLoadError(itemsResult.error, "Não foi possível abrir a carga.");
  const items = (itemsResult.data as unknown as LoadDetailItem[])
    .map((item) => ({ ...item, weight_kg_snapshot: Number(item.weight_kg_snapshot) }))
    .sort((a, b) => a.stop_order - b.stop_order
      || (a.quotes?.quote_number ?? 0) - (b.quotes?.quote_number ?? 0)
      || (a.quote_items?.display_order ?? 0) - (b.quote_items?.display_order ?? 0));
  return { load: loadResult.data, items };
}

/** Itens de orçamentos aprovados com saldo a enviar (ou já nesta carga). */
export async function listLoadCandidates(loadId: string | null): Promise<LoadCandidate[]> {
  const { data, error } = await requireClient().rpc("load_candidates", { p_load_id: loadId });
  if (error || !data) throw toLoadError(error, "Não foi possível carregar os pedidos a enviar.");
  return data.map((row) => ({ ...row, weight_kg: Number(row.weight_kg) }));
}

export type LoadInput = { vehicleId: string; plannedDate: string | null; notes: string | null };
export type LoadItemInput = { quoteItemId: string; quantity: number; packing: Packing; stopOrder: number };

export async function saveLoad(loadId: string | null, load: LoadInput, items: LoadItemInput[]): Promise<{ id: string; load_number: number }> {
  const { data, error } = await requireClient().rpc("save_load", {
    p_load_id: loadId,
    p_load: { vehicle_id: load.vehicleId, planned_date: load.plannedDate, notes: load.notes },
    p_items: items.map((item) => ({
      quote_item_id: item.quoteItemId,
      quantity: item.quantity,
      packing: item.packing,
      stop_order: item.stopOrder,
    })),
  });
  if (error || !data?.[0]) throw toLoadError(error, "Não foi possível salvar a carga.");
  return data[0];
}

export async function setLoadStatus(loadId: string, status: LoadStatus): Promise<void> {
  const { error } = await requireClient().rpc("set_load_status", { p_load_id: loadId, p_status: status });
  if (error) throw toLoadError(error, "Não foi possível mudar a situação da carga.");
}

export type QuoteShipping = { totalBags: number; plannedBags: number; shippedBags: number };

/** Andamento do envio dos orçamentos; vazio se a consulta falhar (é só informativo). */
export async function getQuoteShipping(quoteIds: string[]): Promise<Map<string, QuoteShipping>> {
  if (quoteIds.length === 0 || !supabase) return new Map();
  const { data, error } = await supabase.rpc("quote_shipping", { p_quote_ids: quoteIds });
  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.quote_id, { totalBags: row.total_bags, plannedBags: row.planned_bags, shippedBags: row.shipped_bags }]));
}
