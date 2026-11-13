import type { CommercialData } from "../../types/commercial";
import type { FreightFormState, OrderItem } from "./calculator.types";

/** Campos do orçamento salvo usados para reabrir na calculadora. */
export type SavedQuoteForEditing = {
  anticipated_payment: boolean;
  freight_table_name_snapshot: string | null;
  freight_zone_snapshot: string | null;
  load_type_snapshot: string | null;
  handling_rate_per_ton_snapshot: number | string;
  handling_total: number | string;
};

export type SavedQuoteItemForEditing = {
  display_order: number;
  product_name_snapshot: string;
  payment_term_snapshot: string | null;
  table_unit_price: number | string;
  quantity: number;
  weight_kg_snapshot: number | string;
  line_discount_percentage: number | string;
  category_name_snapshot?: string | null;
};

export type CalculatorState = {
  items: OrderItem[];
  /** Prazo do orçamento: o dos itens (todos os orçamentos usam um prazo só). */
  paymentTermIndex: string;
  freightForm: FreightFormState;
  anticipatedPayment: boolean;
  handlingEnabled: boolean;
  handlingRatePerTon: string;
};

type CatalogForEditing = Pick<CommercialData, "products" | "paymentTermLabels" | "discountLines" | "juaraFreightRates" | "regionalFreightRates">;

function indexOrEmpty(index: number) {
  return index >= 0 ? String(index) : "";
}

/**
 * O orçamento guarda produto e prazo pelo nome, então a correspondência com o
 * catálogo atual é feita por nome. Preços, pesos e descontos voltam como foram
 * salvos; o frete é recalculado pela calculadora com a tabela vigente.
 */
export function quoteToCalculatorState(
  quote: SavedQuoteForEditing,
  quoteItems: SavedQuoteItemForEditing[],
  catalog: CatalogForEditing,
  firstItemId: number,
): CalculatorState {
  const customLineIndex = catalog.discountLines.findIndex((line) => line.percentage === null);

  const items = [...quoteItems]
    .sort((a, b) => a.display_order - b.display_order)
    .map<OrderItem>((item, position) => {
      const lineDiscountPercentage = Number(item.line_discount_percentage);
      const lineIndex = catalog.discountLines.findIndex((line) => line.percentage === lineDiscountPercentage);
      const usesCustomLine = lineIndex < 0 && lineDiscountPercentage > 0 && customLineIndex >= 0;
      return {
        id: firstItemId + position,
        name: item.product_name_snapshot,
        productIndex: indexOrEmpty(catalog.products.findIndex((product) => product.name === item.product_name_snapshot)),
        paymentTermIndex: indexOrEmpty(catalog.paymentTermLabels.findIndex((label) => label === item.payment_term_snapshot)),
        tableUnitPrice: Number(item.table_unit_price),
        priceFromTable: false,
        quantity: item.quantity,
        weightKg: Number(item.weight_kg_snapshot),
        lineDiscountPercentage,
        discountLineIndex: usesCustomLine ? String(customLineIndex) : indexOrEmpty(lineIndex),
        customDiscountPercentage: usesCustomLine ? lineDiscountPercentage : 0,
        categoryName: item.category_name_snapshot ?? null,
      };
    });

  const tableName = quote.freight_table_name_snapshot?.toLowerCase();
  const table: FreightFormState["table"] = tableName === "juara" ? "juara" : tableName === "regional" ? "regional" : "";
  const rangeIndex = table === "juara"
    ? catalog.juaraFreightRates.findIndex((rate) => rate.distance === quote.freight_zone_snapshot)
    : table === "regional"
      ? catalog.regionalFreightRates.findIndex((rate) => rate.location === quote.freight_zone_snapshot)
      : -1;

  // Prazo do orçamento: o mais usado entre os itens (na prática, todos têm o mesmo).
  const counts = new Map<string, number>();
  for (const item of items) if (item.paymentTermIndex !== "") counts.set(item.paymentTermIndex, (counts.get(item.paymentTermIndex) ?? 0) + 1);
  const paymentTermIndex = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  // Preço igual ao da tabela vigente nesse prazo conta como "da tabela"; os demais ficam como foram salvos.
  for (const item of items) {
    const price = item.productIndex === "" || paymentTermIndex === "" ? undefined : catalog.products[Number(item.productIndex)]?.prices[Number(paymentTermIndex)];
    item.priceFromTable = price !== undefined && price.toFixed(2) === item.tableUnitPrice.toFixed(2);
    item.paymentTermIndex = paymentTermIndex;
  }

  return {
    items,
    paymentTermIndex,
    freightForm: {
      table: rangeIndex >= 0 ? table : "",
      rangeIndex: rangeIndex >= 0 ? String(rangeIndex) : "",
      loadType: quote.load_type_snapshot === "closed" ? "closed" : "fractional",
    },
    anticipatedPayment: quote.anticipated_payment,
    handlingEnabled: Number(quote.handling_total) > 0,
    handlingRatePerTon: String(Number(quote.handling_rate_per_ton_snapshot)),
  };
}
