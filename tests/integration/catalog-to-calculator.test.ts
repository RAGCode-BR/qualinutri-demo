import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCurrentOrder, type FreightSelection } from "../../src/domain";
import { loadFreightCatalog } from "../../src/services/freightService";
import { loadProductCatalog } from "../../src/services/productService";
import type { Database } from "../../src/types/database.types";

/**
 * Cliente falso no formato do Supabase: cada tabela devolve as linhas do
 * cenário, como o banco devolveria depois dos filtros de "ativo/vigente".
 */
function fakeClient(tables: Record<string, unknown[]>) {
  return {
    from(name: string) {
      const rows = tables[name] ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit"]) builder[method] = () => builder;
      builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

const productTables = {
  product_categories: [{ id: "cat-racoes", name: "Rações", display_order: 0 }, { id: "cat-mineral", name: "Mineral", display_order: 1 }],
  products: [
    { id: "p1", category_id: "cat-racoes", name: "Ração A", package_weight_kg: "40", display_order: 0 },
    { id: "p2", category_id: "cat-mineral", name: "Mineral B", package_weight_kg: "30", display_order: 1 },
    { id: "p3", category_id: "cat-mineral", name: "Mineral sem preço", package_weight_kg: "30", display_order: 2 },
  ],
  payment_terms: [{ id: "t-vista", label: "à vista", display_order: 0 }, { id: "t-30", label: "30 dd", display_order: 1 }],
  price_tables: [{ id: "tabela-vigente" }],
  product_prices: [
    { product_id: "p1", payment_term_id: "t-vista", unit_price: "100.00" },
    { product_id: "p1", payment_term_id: "t-30", unit_price: "110.00" },
    { product_id: "p2", payment_term_id: "t-vista", unit_price: "200.00" },
    { product_id: "p2", payment_term_id: "t-30", unit_price: "220.00" },
    // p3 só tem preço à vista: dados incompletos.
    { product_id: "p3", payment_term_id: "t-vista", unit_price: "50.00" },
  ],
};

const freightTables = {
  freight_tables: [{ id: "ft-juara", code: "juara" }, { id: "ft-regional", code: "regional" }],
  handling_rate_tables: [{ amount_per_ton: "40.00" }],
  freight_zones: [
    { id: "z1", freight_table_id: "ft-juara", label: "Até 25 km", display_order: 0 },
    { id: "z2", freight_table_id: "ft-juara", label: "Faixa incompleta", display_order: 1 },
    { id: "z3", freight_table_id: "ft-regional", label: "Brasnorte", display_order: 0 },
    { id: "z4", freight_table_id: "ft-regional", label: "Aripuanã", display_order: 1 },
  ],
  freight_rates: [
    { freight_zone_id: "z1", load_type: "fractional", rate_basis: "per_bag", bag_weight_kg: "25.000", amount: "1.60" },
    { freight_zone_id: "z1", load_type: "fractional", rate_basis: "per_bag", bag_weight_kg: "30.000", amount: "1.90" },
    { freight_zone_id: "z1", load_type: "fractional", rate_basis: "per_bag", bag_weight_kg: "40.000", amount: "2.50" },
    { freight_zone_id: "z1", load_type: "closed", rate_basis: "per_ton", bag_weight_kg: null, amount: "25.00" },
    // z2 sem o valor de carga fechada: dados incompletos.
    { freight_zone_id: "z2", load_type: "fractional", rate_basis: "per_bag", bag_weight_kg: "25.000", amount: "9.99" },
    { freight_zone_id: "z3", load_type: "fractional", rate_basis: "per_ton", bag_weight_kg: null, amount: "210.00" },
    { freight_zone_id: "z3", load_type: "closed", rate_basis: "per_ton", bag_weight_kg: null, amount: "185.00" },
    { freight_zone_id: "z4", load_type: "closed", rate_basis: "per_ton", bag_weight_kg: null, amount: "446.00" },
  ],
};

describe("catálogo do banco até a calculadora", () => {
  it("monta produtos com o preço de cada prazo na posição do prazo e ignora produto incompleto", async () => {
    const catalog = await loadProductCatalog(fakeClient(productTables));
    expect(catalog.paymentTermLabels).toEqual(["à vista", "30 dd"]);
    expect(catalog.paymentTermIds).toEqual(["t-vista", "t-30"]);
    expect(catalog.products.map((product) => product.name)).toEqual(["Ração A", "Mineral B"]);
    expect(catalog.products[0]).toMatchObject({ id: "p1", group: "Rações", weightKg: 40, prices: [100, 110] });
    expect(catalog.products[1]).toMatchObject({ id: "p2", weightKg: 30, prices: [200, 220] });
    expect(catalog.rationProducts.map((product) => product.name)).toEqual(["Ração A"]);
    expect(catalog.mineralProducts.map((product) => product.name)).toEqual(["Mineral B"]);
  });

  it("monta as faixas de frete com cada valor no campo certo e ignora faixa incompleta", async () => {
    const freight = await loadFreightCatalog(fakeClient(freightTables));
    expect(freight.handlingRatePerTon).toBe(40);
    expect(freight.juaraFreightRates).toEqual([
      { id: "z1", distance: "Até 25 km", bag25: 1.6, bag30: 1.9, bag40: 2.5, closedPerTon: 25 },
    ]);
    expect(freight.regionalFreightRates).toEqual([
      { id: "z3", location: "Brasnorte", fractionalPerTon: 210, closedPerTon: 185 },
      { id: "z4", location: "Aripuanã", fractionalPerTon: null, closedPerTon: 446 },
    ]);
  });

  it("calcula o pedido com os valores carregados do banco", async () => {
    const { products } = await loadProductCatalog(fakeClient(productTables));
    const freight = await loadFreightCatalog(fakeClient(freightTables));
    const mineral = products[1];
    const item = { name: mineral.name, tableUnitPrice: mineral.prices[1], quantity: 10, weightKg: mineral.weightKg, lineDiscountPercentage: 10 };
    const juara = freight.juaraFreightRates[0];
    const brasnorte = freight.regionalFreightRates[0];
    const aripuana = freight.regionalFreightRates[1];
    const options = (selection: FreightSelection) => ({ anticipatedPayment: false, freight: selection, handlingEnabled: true, handlingRatePerTon: freight.handlingRatePerTon });

    // Juara fracionada, saco de 30 kg: R$ 1,90 por saco.
    const juaraOrder = calculateCurrentOrder([item], options({ table: "juara", loadType: "fractional", rates: juara }));
    expect(juaraOrder.productSubtotal).toBeCloseTo(220 * 0.9 * 10, 6);
    expect(juaraOrder.freightTotal).toBeCloseTo(1.9 * 10, 6);
    expect(juaraOrder.handlingTotal).toBeCloseTo((40 * 30 / 1000) * 10, 6);

    // Regional fracionada: R$ 210/t, saco de 30 kg = R$ 6,30 por saco.
    const regionalOrder = calculateCurrentOrder([item], options({ table: "regional", loadType: "fractional", rates: brasnorte }));
    expect(regionalOrder.freightTotal).toBeCloseTo(210 * 30 / 1000 * 10, 6);

    // Cidade só com carga fechada: fracionada não cobra frete e avisa.
    const closedOnly = calculateCurrentOrder([item], options({ table: "regional", loadType: "fractional", rates: aripuana }));
    expect(closedOnly.freightTotal).toBe(0);
    expect(closedOnly.notes.join(" ")).toMatch(/só tem carga fechada/);
  });
});
