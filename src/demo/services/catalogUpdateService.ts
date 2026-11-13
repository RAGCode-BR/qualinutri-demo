import { getDemoViewer, viewerName } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import { nowIso } from "./common";

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

const camel: Record<string, string> = { bag25: "bag25", bag30: "bag30", bag40: "bag40", closed_per_ton: "closedPerTon", fractional_per_ton: "fractionalPerTon" };

/** Aplica de uma vez, no banco local, o que foi confirmado na tela. */
export async function applyCatalogUpdate(payload: CatalogUpdatePayload): Promise<CatalogUpdateResult> {
  if (getDemoViewer().role !== "administrador") throw new CatalogUpdateError("Somente administradores podem aplicar atualizações.");
  const invalid = [...payload.products, ...payload.new_products].some((product) => !(product.weight > 0) || product.prices.some((price) => !(price.unit_price > 0)));
  if (invalid) throw new CatalogUpdateError("Há preços ou pesos inválidos. Nada foi alterado.");
  await simulateLatency(null);
  db.write(({ catalog, catalog_imports }) => {
    const ids = catalog.paymentTermIds ?? [];
    const priceList = (prices: CatalogUpdatePayload["products"][number]["prices"], fallback: readonly number[] = []) =>
      ids.map((termId, index) => prices.find((price) => price.payment_term_id === termId)?.unit_price ?? fallback[index] ?? 0);
    for (const update of payload.products) {
      for (const list of [catalog.rationProducts, catalog.mineralProducts]) {
        const index = list.findIndex((product) => product.id === update.id);
        if (index >= 0) list[index] = { ...list[index], weightKg: update.weight, prices: priceList(update.prices, list[index].prices) };
      }
    }
    for (const created of payload.new_products) {
      const product = { id: newId(), group: created.category, name: created.name, weightKg: created.weight, prices: priceList(created.prices) };
      (created.category === "Rações" ? catalog.rationProducts : catalog.mineralProducts).push(product);
    }
    catalog.products = [...catalog.rationProducts, ...catalog.mineralProducts];
    for (const discount of payload.discounts) {
      catalog.discountLines = catalog.discountLines.map((line) => line.id === discount.id ? { ...line, percentage: discount.percentage } : line);
    }
    for (const freight of payload.freight) {
      const rates = Object.fromEntries(Object.entries(freight.rates)
        .filter(([key, value]) => value !== null || (freight.table === "regional" && key === "fractional_per_ton"))
        .map(([key, value]) => [camel[key] ?? key, value]));
      if (freight.table === "juara") catalog.juaraFreightRates = catalog.juaraFreightRates.map((rate) => rate.id === freight.id ? { ...rate, ...rates } : rate);
      else catalog.regionalFreightRates = catalog.regionalFreightRates.map((rate) => rate.id === freight.id ? { ...rate, ...rates } : rate);
    }
    const changes = payload.products.length + payload.new_products.length + payload.discounts.length + payload.freight.length;
    catalog.changeLog.unshift({ at: nowIso(), who: viewerName(), what: `Atualização por PDF: ${payload.file_name} (${changes} alterações)` });
    catalog_imports.unshift({ id: newId(), appliedAt: nowIso(), fileName: payload.file_name, kind: "PDF", changes, appliedBy: viewerName() });
  });
  return { products: payload.products.length, new_products: payload.new_products.length, discounts: payload.discounts.length, freight: payload.freight.length };
}
