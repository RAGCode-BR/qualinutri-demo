import type { DemoUser, Row } from "../store/types";
import { summarizeLoad } from "../../domain/loads/summarizeLoad";
import { addDays, isoDate, isoDateTime, seededId } from "../store/ids";
import { chance, int, pick, type Rng } from "./random";

type Args = {
  rng: Rng;
  today: Date;
  customers: Row<"customers">[];
  properties: Row<"customer_properties">[];
  quotes: Row<"quotes">[];
  items: Row<"quote_items">[];
  users: DemoUser[];
};

export function buildVehicles(today: Date): Row<"vehicles">[] {
  const at = isoDateTime(addDays(today, -300));
  // Frota real informada na ata: 3 caminhões graneleiros (10 e 15–18 t).
  return [
    { id: "veh-1", name: "Graneleiro 01 · 10 t", plate: "QBA-4E21", capacity_kg: 10000, body_length_cm: 750, body_width_cm: 245, body_height_cm: 230, active: true, created_at: at, updated_at: at },
    { id: "veh-2", name: "Graneleiro 02 · 15 t", plate: "QBF-9J33", capacity_kg: 15000, body_length_cm: 950, body_width_cm: 245, body_height_cm: 240, active: true, created_at: at, updated_at: at },
    { id: "veh-3", name: "Graneleiro 03 · 18 t", plate: "RAX-2F55", capacity_kg: 18000, body_length_cm: 1040, body_width_cm: 245, body_height_cm: 240, active: true, created_at: at, updated_at: at },
  ];
}

const visitNotes = [
  "Apresentado o mineral de seca e conferido o consumo do rebanho.",
  "Cliente pediu tabela atualizada e prazo de 30/60.",
  "Visita de relacionamento; avaliou a ração de crescimento com bons resultados.",
  "Prospecção: fazenda com 800 cabeças, compra hoje de concorrente.",
  "Fechamento do pedido com entrega na próxima semana.",
  "Conferida a qualidade do último lote; cliente satisfeito.",
];
const nextActions = ["Enviar proposta por WhatsApp", "Retornar em 15 dias", "Levar amostra do núcleo", "Confirmar data de entrega", null];
const reasons = ["customer_absent", "customer_rescheduled", "customer_emergency", "seller_emergency", "other"];

function buildVisits(args: Args): Row<"visits">[] {
  const { rng, today, customers, properties, quotes, users } = args;
  const sellers = users.filter((user) => user.role !== "consulta");
  const active = customers.filter((customer) => customer.active);
  const visits: Row<"visits">[] = [];
  for (let index = 0; index < 130; index += 1) {
    const offset = int(rng, -75, 21);
    const date = isoDate(addDays(today, offset));
    const seller = pick(rng, sellers);
    const customer = pick(rng, active);
    const property = properties.filter((item) => item.customer_id === customer.id);
    const created = isoDateTime(addDays(today, Math.min(offset, 0) - int(rng, 1, 10)));
    const base = {
      id: seededId(rng), seller_id: seller.id, customer_id: customer.id, property_id: property.length && chance(rng, 0.6) ? pick(rng, property).id : null,
      scheduled_date: date, follow_up_of: null, created_at: created, updated_at: created, created_by: seller.id, updated_by: null,
      visited_date: null, developed: null, visit_types: [] as string[], quote_id: null as string | null, next_action: null as string | null,
      not_done_reason: null as string | null, not_done_note: null as string | null, status: "planned",
    };
    if (offset > 0 || (offset >= -3 && chance(rng, 0.45))) {
      visits.push(base);
      continue;
    }
    if (chance(rng, 0.12)) {
      visits.push({ ...base, status: "not_done", not_done_reason: pick(rng, reasons), not_done_note: chance(rng, 0.4) ? "Remarcar com o cliente." : null });
      continue;
    }
    const types = [pick(rng, ["relationship", "prospecting", "closing"])];
    if (chance(rng, 0.25)) types.push(types[0] === "relationship" ? "prospecting" : "relationship");
    const customerQuotes = quotes.filter((quote) => quote.customer_id === customer.id && quote.status !== "cancelled");
    visits.push({
      ...base, status: "completed", visited_date: date, developed: pick(rng, visitNotes), visit_types: types,
      quote_id: types.includes("closing") && customerQuotes.length ? pick(rng, customerQuotes).id : null, next_action: pick(rng, nextActions),
    });
  }
  return visits;
}

function buildLoads(args: Args, vehicles: Row<"vehicles">[], settings: { palletWeightKg: number; bagsPerPallet: Record<string, number> }) {
  const { rng, today, quotes, items, users } = args;
  const loads: Row<"loads">[] = [];
  const loadItems: Row<"load_items">[] = [];
  const day = 86_400_000;
  // Pedidos aprovados há mais de 2 dias entram em cargas; os mais recentes ficam "a enviar".
  const approved = quotes
    .filter((quote) => quote.status === "approved" && quote.approved_at && today.getTime() - new Date(quote.approved_at).getTime() > 2 * day)
    .sort((a, b) => (a.approved_at ?? "").localeCompare(b.approved_at ?? ""));
  const trucks = vehicles.filter((item) => item.capacity_kg >= 8000);
  let cursor = 0;
  let number = 0;
  while (cursor < approved.length) {
    const firstWeight = items.filter((item) => item.quote_id === approved[cursor].id).reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
    const fitting = trucks.filter((item) => item.capacity_kg >= firstWeight * 1.06);
    const vehicle = fitting.length ? pick(rng, fitting) : trucks.reduce((big, item) => item.capacity_kg > big.capacity_kg ? item : big);
    const loadId = seededId(rng);
    const lines: Row<"load_items">[] = [];
    let stop = 0;
    let weight = 0;
    let newest = 0;
    while (cursor < approved.length && stop < 4) {
      const quote = approved[cursor];
      const quoteItems = items.filter((item) => item.quote_id === quote.id);
      const quoteWeight = quoteItems.reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
      if (quoteWeight * 1.06 > vehicle.capacity_kg) { cursor += 1; continue; }
      if (weight + quoteWeight * 1.06 > vehicle.capacity_kg) break;
      cursor += 1;
      weight += quoteWeight;
      newest = Math.max(newest, new Date(quote.approved_at!).getTime());
      const packing = chance(rng, 0.6) ? "pallet" : "loose";
      for (const item of quoteItems) {
        lines.push({ id: seededId(rng), load_id: loadId, quote_item_id: item.id, quote_id: quote.id, quantity: item.quantity, packing, stop_order: stop, weight_kg_snapshot: item.weight_kg_snapshot });
      }
      stop += 1;
    }
    if (lines.length === 0) continue;
    const age = (today.getTime() - newest) / day;
    const status = age > 9 ? (chance(rng, 0.06) ? "cancelled" : "shipped") : age > 5 ? "loaded" : "planned";
    if (status === "cancelled") { cursor -= stop; }
    number += 1;
    const summary = summarizeLoad(lines.map((line) => ({ quoteId: line.quote_id, weightKg: line.weight_kg_snapshot, quantity: line.quantity, packing: line.packing === "pallet" ? "pallet" : "loose" })), vehicle.capacity_kg, settings);
    const created = new Date(Math.min(today.getTime() - 3_600_000, newest + day * int(rng, 1, 2)));
    const planned = addDays(created, status === "planned" ? int(rng, 1, 4) : int(rng, 1, 3));
    const shipped = new Date(Math.min(today.getTime() - 3_600_000, planned.getTime()));
    loads.push({
      id: loadId, load_number: number, status, vehicle_id: vehicle.id, vehicle_name_snapshot: vehicle.name, vehicle_plate_snapshot: vehicle.plate,
      capacity_kg_snapshot: vehicle.capacity_kg, planned_date: isoDate(planned), notes: chance(rng, 0.3) ? "Conferir paletes antes de sair." : null,
      pallet_count: summary.pallets, total_weight_kg: summary.totalWeightKg, created_at: isoDateTime(created), updated_at: isoDateTime(created),
      created_by: pick(rng, users.filter((user) => user.role !== "consulta")).id,
      loaded_at: status === "loaded" || status === "shipped" ? isoDateTime(created) : null,
      shipped_at: status === "shipped" ? isoDateTime(shipped) : null,
      cancelled_at: status === "cancelled" ? isoDateTime(created) : null,
    });
    loadItems.push(...lines);
  }
  return { loads, loadItems, lastLoadNumber: number };
}

export function buildOperations(args: Args) {
  const vehicles = buildVehicles(args.today);
  const bagsPerPallet = { "25": 56, "30": 48, "40": 35 };
  const { loads, loadItems, lastLoadNumber } = buildLoads(args, vehicles, { palletWeightKg: 25, bagsPerPallet });
  return {
    vehicles,
    palletSettings: { id: true, pallet_weight_kg: 25, bags_per_pallet: bagsPerPallet, updated_at: isoDateTime(args.today), updated_by: null } as Row<"pallet_settings">,
    visits: buildVisits(args),
    loads,
    loadItems,
    lastLoadNumber,
  };
}
