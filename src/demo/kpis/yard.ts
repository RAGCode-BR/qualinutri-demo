import type { DemoTables } from "../store/types";
import { weightKey } from "../../domain/loads/summarizeLoad";

/** Volume enviado ao simulador 3D. `sacas` permite conferir o total; `h` é a altura (m) de um palete ou pilha incompleta. */
export type YardItem = { tipo: string; n: number; kg: number; nome: string; sacas?: number; h?: number };
export type YardPreset = { titulo: string; veiculo: string; itens: YardItem[] };

/**
 * Medidas usadas no 3D (sacas de ráfia cheias, deitadas) e montagem por palete PBR 1,20 × 1,00 m.
 * Sacas por palete = configuração do sistema (Cargas › Paletes); palete vazio 25 kg; carga dinâmica ≤ 1,5 t.
 */
const BAG: Record<string, { perLayer: number; layerH: number; palletType: string; looseType: string; loosePerLayer: number }> = {
  "40": { perLayer: 5, layerH: 0.15, palletType: "p40", looseType: "s40", loosePerLayer: 4 },
  "30": { perLayer: 6, layerH: 0.14, palletType: "p30", looseType: "s30", loosePerLayer: 4 },
  "25": { perLayer: 8, layerH: 0.12, palletType: "p25", looseType: "s25", loosePerLayer: 4 },
};
const PALLET_BASE_H = 0.14;
const LOOSE_LAYERS = 10;

export type YardLine = { quoteId: string; product: string; quantity: number; weightKg: number; packing: "pallet" | "loose" };

/** Mesma regra de summarizeLoad: paletes contados por pedido e peso de saca, arredondando para cima. */
export function presetFromLines(titulo: string, lines: YardLine[], bagsPerPallet: Record<string, number>, palletWeightKg: number, capacityKg?: number): YardPreset {
  const groups = new Map<string, { line: YardLine; bags: number; products: Set<string> }>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = `${line.packing}|${line.quoteId}|${weightKey(line.weightKg)}`;
    const group = groups.get(key) ?? { line, bags: 0, products: new Set<string>() };
    group.bags += line.quantity;
    group.products.add(line.product);
    groups.set(key, group);
  }
  const itens: YardItem[] = [];
  for (const { line, bags, products } of groups.values()) {
    const spec = BAG[weightKey(line.weightKg)] ?? BAG["40"];
    const label = [...products].length === 1 ? [...products][0] : `${[...products].length} produtos`;
    if (line.packing === "pallet") {
      const perPallet = bagsPerPallet[weightKey(line.weightKg)] || spec.perLayer * 7;
      const full = Math.floor(bags / perPallet);
      const rest = bags - full * perPallet;
      const fullH = PALLET_BASE_H + Math.ceil(perPallet / spec.perLayer) * spec.layerH;
      if (full) itens.push({ tipo: spec.palletType, n: full, sacas: perPallet, kg: perPallet * line.weightKg + palletWeightKg, nome: `${label} · palete ${perPallet} sc`, h: round(fullH) });
      if (rest) itens.push({ tipo: spec.palletType, n: 1, sacas: rest, kg: rest * line.weightKg + palletWeightKg, nome: `${label} · palete ${rest} sc`, h: round(PALLET_BASE_H + Math.ceil(rest / spec.perLayer) * spec.layerH) });
    } else {
      const perStack = spec.loosePerLayer * LOOSE_LAYERS;
      const full = Math.floor(bags / perStack);
      const rest = bags - full * perStack;
      if (full) itens.push({ tipo: spec.looseType, n: full, sacas: perStack, kg: perStack * line.weightKg, nome: `${label} · pilha ${perStack} sc`, h: round(LOOSE_LAYERS * spec.layerH) });
      if (rest) itens.push({ tipo: spec.looseType, n: 1, sacas: rest, kg: rest * line.weightKg, nome: `${label} · pilha ${rest} sc`, h: round(Math.max(1, Math.ceil(rest / spec.loosePerLayer)) * spec.layerH) });
    }
  }
  const kg = itens.reduce((total, item) => total + item.n * item.kg, 0);
  const cap = capacityKg ?? kg;
  return { titulo, veiculo: cap <= 10_000 ? "gran10" : cap <= 15_000 ? "gran15" : cap <= 18_000 ? "gran18" : "carreta", itens };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function palletConfig(tables: DemoTables) {
  const raw = tables.pallet_settings.bags_per_pallet;
  const bagsPerPallet = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "number")) as Record<string, number> : {};
  return { bagsPerPallet, palletWeightKg: Number(tables.pallet_settings.pallet_weight_kg ?? 0) };
}

/** Volumes 3D de uma carga já montada: itens, embalagem (palete/solta) e caminhão da própria carga. */
export function presetForLoad(tables: DemoTables, loadId: string): YardPreset | null {
  const load = tables.loads.find((item) => item.id === loadId);
  if (!load) return null;
  const { bagsPerPallet, palletWeightKg } = palletConfig(tables);
  const lines: YardLine[] = tables.load_items.filter((item) => item.load_id === loadId).map((item) => ({
    quoteId: item.quote_id,
    product: tables.quote_items.find((row) => row.id === item.quote_item_id)?.product_name_snapshot ?? "Produto",
    quantity: item.quantity,
    weightKg: item.weight_kg_snapshot,
    packing: item.packing === "pallet" ? "pallet" : "loose",
  }));
  return presetFromLines(`Carga #${load.load_number} · ${load.vehicle_name_snapshot}`, lines, bagsPerPallet, palletWeightKg, load.capacity_kg_snapshot);
}

export type YardOption = { id: string; title: string; detail: string; status: string; kg: number; preset: YardPreset };

export function yardOptions(tables: DemoTables): YardOption[] {
  const statusNames: Record<string, string> = { planned: "Planejada", loaded: "Carregada", shipped: "Expedida" };
  const { bagsPerPallet, palletWeightKg } = palletConfig(tables);
  const loads = tables.loads
    .filter((load) => load.status === "planned" || load.status === "loaded" || load.status === "shipped")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)
    .map((load) => {
      const items = tables.load_items.filter((item) => item.load_id === load.id);
      const customers = [...new Set(items.map((item) => tables.quotes.find((quote) => quote.id === item.quote_id)?.customer_name_snapshot ?? "Sem cliente"))];
      return {
        id: load.id,
        title: `Carga #${load.load_number} · ${load.vehicle_name_snapshot}`,
        detail: `${customers.length} ${customers.length === 1 ? "entrega" : "entregas"}: ${customers.slice(0, 3).join(", ")}${customers.length > 3 ? "…" : ""} · ${load.pallet_count} paletes`,
        status: statusNames[load.status] ?? load.status,
        kg: load.total_weight_kg,
        preset: presetForLoad(tables, load.id)!,
      };
    });
  // Pedidos aprovados ainda sem carga: sugestão de próxima carga num graneleiro de 18 t, sacas soltas (como hoje, com lona).
  const allocated = new Set(tables.load_items.filter((item) => tables.loads.find((load) => load.id === item.load_id)?.status !== "cancelled").map((item) => item.quote_item_id));
  const pendingAll = tables.quote_items.filter((item) => !allocated.has(item.id) && tables.quotes.find((quote) => quote.id === item.quote_id)?.status === "approved");
  const pending: typeof pendingAll = [];
  let weight = 0;
  for (const quoteId of [...new Set(pendingAll.map((item) => item.quote_id))]) {
    const lines = pendingAll.filter((item) => item.quote_id === quoteId);
    const kg = lines.reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
    if (weight + kg > 17_000) continue;
    weight += kg;
    pending.push(...lines);
  }
  if (pending.length) {
    const lines: YardLine[] = pending.map((item) => ({ quoteId: item.quote_id, product: item.product_name_snapshot, quantity: item.quantity, weightKg: item.weight_kg_snapshot, packing: "loose" }));
    loads.unshift({ id: "pending", title: "Próxima carga sugerida", detail: `${new Set(pending.map((item) => item.quote_id)).size} pedidos aprovados aguardando envio · sacas soltas`, status: "A montar", kg: weight, preset: presetFromLines("Pedidos aprovados a enviar", lines, bagsPerPallet, palletWeightKg, 18_000) });
  }
  return loads;
}
