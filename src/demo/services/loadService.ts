import { summarizeLoad, type Packing, type PalletSettings } from "../../domain/loads/summarizeLoad";
import type { Database, Json } from "../../types/database.types";
import { getDemoViewer } from "../app/session";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import type { DemoTables, Row } from "../store/types";
import { nowIso } from "./common";

export type Vehicle = Row<"vehicles">;
export type LoadRow = Row<"loads">;
export type LoadStatus = "planned" | "loaded" | "shipped" | "cancelled";
export type LoadCandidate = Database["public"]["Functions"]["load_candidates"]["Returns"][number];

export class LoadServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com a carga.") {
    super(message);
    this.name = "LoadServiceError";
  }
}

function requireAdmin() {
  if (getDemoViewer().role !== "administrador") throw new LoadServiceError("Somente administradores podem alterar veículos e paletes.");
}

function requireSales() {
  const role = getDemoViewer().role;
  if (role !== "administrador" && role !== "comercial") throw new LoadServiceError("Seu perfil não tem acesso às cargas.");
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
  return simulateLatency(() => clone(db.read().vehicles.filter((vehicle) => includeInactive || vehicle.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))));
}

export async function saveVehicle(vehicleId: string | null, input: VehicleInput): Promise<string> {
  requireAdmin();
  const name = input.name.trim();
  if (!name) throw new LoadServiceError("Informe o nome do veículo.");
  if (!(input.capacityKg > 0)) throw new LoadServiceError("Informe a capacidade do veículo em kg.");
  const plate = input.plate.trim().toUpperCase() || null;
  if (plate && db.read().vehicles.some((vehicle) => vehicle.active && vehicle.id !== vehicleId && vehicle.plate === plate)) {
    throw new LoadServiceError("Já existe um veículo ativo com esta placa.");
  }
  await simulateLatency(null);
  const at = nowIso();
  const id = vehicleId ?? newId();
  db.write((tables) => {
    const values = { name, plate, capacity_kg: input.capacityKg, body_length_cm: input.bodyLengthCm, body_width_cm: input.bodyWidthCm, body_height_cm: input.bodyHeightCm, updated_at: at };
    const existing = tables.vehicles.find((vehicle) => vehicle.id === vehicleId);
    if (existing) Object.assign(existing, values);
    else tables.vehicles.push({ id, ...values, active: true, created_at: at });
  });
  return id;
}

export async function deactivateVehicle(vehicleId: string): Promise<void> {
  requireAdmin();
  const tables = db.read();
  if (tables.loads.some((load) => load.vehicle_id === vehicleId && (load.status === "planned" || load.status === "loaded"))) {
    throw new LoadServiceError("O veículo tem cargas em andamento e não pode ser excluído.");
  }
  await simulateLatency(null);
  db.write((current) => {
    const vehicle = current.vehicles.find((item) => item.id === vehicleId);
    if (vehicle) vehicle.active = false;
  });
}

// ---------- Dados de palete ----------

function toBagsPerPallet(value: Json): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, count]) => typeof count === "number" && count > 0)) as Record<string, number>;
}

function palletSettings(tables: DemoTables): PalletSettings {
  const row = tables.pallet_settings;
  return { palletWeightKg: row.pallet_weight_kg === null ? null : Number(row.pallet_weight_kg), bagsPerPallet: toBagsPerPallet(row.bags_per_pallet) };
}

export async function getPalletSettings(): Promise<PalletSettings> {
  return simulateLatency(() => palletSettings(db.read()));
}

export async function savePalletSettings(settings: PalletSettings): Promise<void> {
  requireAdmin();
  await simulateLatency(null);
  db.write((tables) => {
    tables.pallet_settings = { ...tables.pallet_settings, pallet_weight_kg: settings.palletWeightKg, bags_per_pallet: settings.bagsPerPallet, updated_at: nowIso(), updated_by: getDemoViewer().id };
  });
}

// ---------- Cargas ----------

export type LoadFilter = "open" | "shipped" | "cancelled" | "all";

export type LoadListItem = LoadRow & {
  load_items: Array<{ quantity: number; quote_id: string; stop_order: number; quotes: { quote_number: number; customer_name_snapshot: string | null } | null }>;
};

export async function listLoads(filter: LoadFilter): Promise<LoadListItem[]> {
  requireSales();
  return simulateLatency(() => {
    const tables = db.read();
    return clone(tables.loads
      .filter((load) => filter === "all" || (filter === "open" ? load.status === "planned" || load.status === "loaded" : load.status === filter))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((load) => ({
        ...load,
        load_items: tables.load_items.filter((item) => item.load_id === load.id).map((item) => {
          const quote = tables.quotes.find((row) => row.id === item.quote_id);
          return { quantity: item.quantity, quote_id: item.quote_id, stop_order: item.stop_order, quotes: quote ? { quote_number: quote.quote_number, customer_name_snapshot: quote.customer_name_snapshot } : null };
        }),
      })));
  });
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
  requireSales();
  return simulateLatency(() => {
    const tables = db.read();
    const load = tables.loads.find((item) => item.id === loadId);
    if (!load) throw new LoadServiceError("Não foi possível abrir a carga.");
    const items: LoadDetailItem[] = tables.load_items.filter((item) => item.load_id === loadId).map((item): LoadDetailItem => {
      const quoteItem = tables.quote_items.find((row) => row.id === item.quote_item_id);
      const quote = tables.quotes.find((row) => row.id === item.quote_id);
      const customer = tables.customers.find((row) => row.id === quote?.customer_id);
      return {
        id: item.id, quote_item_id: item.quote_item_id, quote_id: item.quote_id, quantity: item.quantity, weight_kg_snapshot: Number(item.weight_kg_snapshot),
        packing: (item.packing === "pallet" ? "pallet" : "loose") as Packing, stop_order: item.stop_order,
        quote_items: quoteItem ? { product_name_snapshot: quoteItem.product_name_snapshot, display_order: quoteItem.display_order } : null,
        quotes: quote ? { quote_number: quote.quote_number, customer_id: quote.customer_id, customer_name_snapshot: quote.customer_name_snapshot, customers: customer ? { phone: customer.phone, address: customer.address } : null } : null,
      };
    }).sort((a, b) => a.stop_order - b.stop_order
      || (a.quotes?.quote_number ?? 0) - (b.quotes?.quote_number ?? 0)
      || (a.quote_items?.display_order ?? 0) - (b.quote_items?.display_order ?? 0));
    return clone({ load, items });
  });
}

/** Sacas de cada item já reservadas em cargas não canceladas (exceto a carga informada). */
function allocatedByItem(tables: DemoTables, exceptLoadId: string | null) {
  const active = new Set(tables.loads.filter((load) => load.status !== "cancelled" && load.id !== exceptLoadId).map((load) => load.id));
  const map = new Map<string, number>();
  for (const item of tables.load_items) {
    if (active.has(item.load_id)) map.set(item.quote_item_id, (map.get(item.quote_item_id) ?? 0) + item.quantity);
  }
  return map;
}

export function candidatesFor(tables: DemoTables, loadId: string | null): LoadCandidate[] {
  const allocated = allocatedByItem(tables, loadId);
  const inThisLoad = new Map(tables.load_items.filter((item) => item.load_id === loadId).map((item) => [item.quote_item_id, item.quantity]));
  const approved = new Map(tables.quotes.filter((quote) => quote.status === "approved").map((quote) => [quote.id, quote]));
  return tables.quote_items
    .filter((item) => approved.has(item.quote_id))
    .map((item) => {
      const quote = approved.get(item.quote_id)!;
      return {
        allocated: allocated.get(item.id) ?? 0, approved_at: quote.approved_at, customer_id: quote.customer_id, customer_name: quote.customer_name_snapshot,
        display_order: item.display_order, in_this_load: inThisLoad.get(item.id) ?? 0, product_name: item.product_name_snapshot, quantity: item.quantity,
        quote_id: item.quote_id, quote_item_id: item.id, quote_number: quote.quote_number, weight_kg: Number(item.weight_kg_snapshot),
      };
    })
    .filter((row) => row.in_this_load > 0 || row.allocated < row.quantity)
    .sort((a, b) => (a.approved_at ?? "").localeCompare(b.approved_at ?? "") || a.quote_number - b.quote_number || a.display_order - b.display_order);
}

export async function listLoadCandidates(loadId: string | null): Promise<LoadCandidate[]> {
  requireSales();
  return simulateLatency(() => candidatesFor(db.read(), loadId));
}

export type LoadInput = { vehicleId: string; plannedDate: string | null; notes: string | null };
export type LoadItemInput = { quoteItemId: string; quantity: number; packing: Packing; stopOrder: number };

export async function saveLoad(loadId: string | null, load: LoadInput, items: LoadItemInput[]): Promise<{ id: string; load_number: number }> {
  requireSales();
  const tables = db.read();
  const existing = loadId ? tables.loads.find((item) => item.id === loadId) : null;
  if (loadId && !existing) throw new LoadServiceError("Carga não encontrada.");
  if (existing && existing.status !== "planned") throw new LoadServiceError("Só cargas planejadas podem ser editadas.");
  const vehicle = tables.vehicles.find((item) => item.id === load.vehicleId && item.active);
  if (!vehicle) throw new LoadServiceError("Escolha um veículo ativo.");
  const lines = items.filter((item) => item.quantity > 0);
  if (lines.length === 0) throw new LoadServiceError("Adicione ao menos um item à carga.");
  const allocated = allocatedByItem(tables, loadId);
  const quoteItems = new Map(tables.quote_items.map((item) => [item.id, item]));
  const approved = new Set(tables.quotes.filter((quote) => quote.status === "approved").map((quote) => quote.id));
  for (const line of lines) {
    const quoteItem = quoteItems.get(line.quoteItemId);
    if (!quoteItem || !approved.has(quoteItem.quote_id)) throw new LoadServiceError("Só itens de orçamentos aprovados podem ir para a carga.");
    if (line.quantity > quoteItem.quantity - (allocated.get(line.quoteItemId) ?? 0)) {
      throw new LoadServiceError(`"${quoteItem.product_name_snapshot}" passou do saldo a enviar do pedido.`);
    }
  }
  const summary = summarizeLoad(lines.map((line) => {
    const quoteItem = quoteItems.get(line.quoteItemId)!;
    return { quoteId: quoteItem.quote_id, weightKg: Number(quoteItem.weight_kg_snapshot), quantity: line.quantity, packing: line.packing };
  }), vehicle.capacity_kg, palletSettings(tables));
  if (summary.level === "over") throw new LoadServiceError(`A carga passa da capacidade do veículo (${vehicle.capacity_kg.toLocaleString("pt-BR")} kg).`);
  await simulateLatency(null);
  const at = nowIso();
  const id = loadId ?? newId();
  let loadNumber = existing?.load_number ?? 0;
  db.write((current) => {
    if (!existing) {
      current.seq.load += 1;
      loadNumber = current.seq.load;
    }
    const row: LoadRow = {
      ...(existing ?? { id, created_at: at, created_by: getDemoViewer().id, status: "planned", loaded_at: null, shipped_at: null, cancelled_at: null, load_number: loadNumber }),
      vehicle_id: vehicle.id, vehicle_name_snapshot: vehicle.name, vehicle_plate_snapshot: vehicle.plate, capacity_kg_snapshot: vehicle.capacity_kg,
      planned_date: load.plannedDate, notes: load.notes, pallet_count: summary.pallets, total_weight_kg: summary.totalWeightKg, updated_at: at,
    };
    current.loads = existing ? current.loads.map((item) => item.id === id ? row : item) : [...current.loads, row];
    current.load_items = current.load_items.filter((item) => item.load_id !== id).concat(lines.map((line) => {
      const quoteItem = quoteItems.get(line.quoteItemId)!;
      return { id: newId(), load_id: id, quote_item_id: line.quoteItemId, quote_id: quoteItem.quote_id, quantity: line.quantity, packing: line.packing, stop_order: line.stopOrder, weight_kg_snapshot: Number(quoteItem.weight_kg_snapshot) };
    }));
  });
  return { id, load_number: loadNumber };
}

export async function setLoadStatus(loadId: string, status: LoadStatus): Promise<void> {
  requireSales();
  const load = db.read().loads.find((item) => item.id === loadId);
  if (!load) throw new LoadServiceError("Carga não encontrada.");
  const allowed = (load.status === "planned" && (status === "loaded" || status === "cancelled"))
    || (load.status === "loaded" && (status === "shipped" || status === "planned" || status === "cancelled"));
  if (!allowed) throw new LoadServiceError("Esta mudança de situação não é permitida para a carga.");
  await simulateLatency(null);
  db.write((tables) => {
    const row = tables.loads.find((item) => item.id === loadId)!;
    const at = nowIso();
    row.status = status;
    row.updated_at = at;
    if (status === "loaded") row.loaded_at = at;
    if (status === "planned") row.loaded_at = null;
    if (status === "shipped") row.shipped_at = at;
    if (status === "cancelled") row.cancelled_at = at;
  });
}

export type QuoteShipping = { totalBags: number; plannedBags: number; shippedBags: number };

export async function getQuoteShipping(quoteIds: string[]): Promise<Map<string, QuoteShipping>> {
  const tables = db.read();
  const wanted = new Set(quoteIds);
  const status = new Map(tables.loads.map((load) => [load.id, load.status]));
  const map = new Map<string, QuoteShipping>();
  for (const item of tables.quote_items) {
    if (!wanted.has(item.quote_id)) continue;
    const entry = map.get(item.quote_id) ?? { totalBags: 0, plannedBags: 0, shippedBags: 0 };
    entry.totalBags += item.quantity;
    map.set(item.quote_id, entry);
  }
  for (const item of tables.load_items) {
    const entry = map.get(item.quote_id);
    const loadStatus = status.get(item.load_id);
    if (!entry || !loadStatus || loadStatus === "cancelled") continue;
    if (loadStatus === "shipped") entry.shippedBags += item.quantity;
    else entry.plannedBags += item.quantity;
  }
  return map;
}
