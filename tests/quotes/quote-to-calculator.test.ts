import { describe, expect, it } from "vitest";
import { localCommercialData } from "../../src/data/commercialData";
import { quoteToCalculatorState } from "../../src/features/calculator/quoteToCalculatorState";

const catalog = localCommercialData;
const product = catalog.products[0];
const term = catalog.paymentTermLabels[2];
const fixedLine = catalog.discountLines.find((line) => line.percentage !== null && line.percentage > 0)!;
const juara = catalog.juaraFreightRates[1];

const baseQuote = {
  anticipated_payment: true,
  freight_table_name_snapshot: "Juara",
  freight_zone_snapshot: juara.distance,
  load_type_snapshot: "closed",
  handling_rate_per_ton_snapshot: "40.00",
  handling_total: "12.5",
};

describe("reabrir orçamento salvo na calculadora", () => {
  it("reconhece produto, prazo e linha de desconto pelo nome e mantém os valores salvos", () => {
    const state = quoteToCalculatorState(baseQuote, [{
      display_order: 0,
      product_name_snapshot: product.name,
      payment_term_snapshot: term,
      table_unit_price: "12.34",
      quantity: 8,
      weight_kg_snapshot: "40",
      line_discount_percentage: String(fixedLine.percentage),
    }], catalog, 1);

    expect(state.items[0]).toMatchObject({
      id: 1,
      name: product.name,
      productIndex: "0",
      paymentTermIndex: "2",
      tableUnitPrice: 12.34,
      quantity: 8,
      weightKg: 40,
      lineDiscountPercentage: fixedLine.percentage,
      discountLineIndex: String(catalog.discountLines.indexOf(fixedLine)),
      customDiscountPercentage: 0,
    });
  });

  it("usa o prazo dos itens como prazo do orçamento e marca o preço da tabela vigente", () => {
    const item = (price: number | string) => ({ display_order: 0, product_name_snapshot: product.name, payment_term_snapshot: term, table_unit_price: price, quantity: 1, weight_kg_snapshot: "40", line_discount_percentage: "0" });
    const fromTable = quoteToCalculatorState(baseQuote, [item(product.prices[2].toFixed(2))], catalog, 1);
    expect(fromTable.paymentTermIndex).toBe("2");
    expect(fromTable.items[0].priceFromTable).toBe(true);
    // Preço diferente da tabela (digitado ou de tabela antiga) fica como foi salvo.
    const typed = quoteToCalculatorState(baseQuote, [item("12.34")], catalog, 1);
    expect(typed.items[0].priceFromTable).toBe(false);
  });

  it("restaura frete, chapa e pagamento antecipado", () => {
    const state = quoteToCalculatorState(baseQuote, [], catalog, 1);
    expect(state.freightForm).toEqual({ table: "juara", rangeIndex: "1", loadType: "closed" });
    expect(state.anticipatedPayment).toBe(true);
    expect(state.handlingEnabled).toBe(true);
    expect(state.handlingRatePerTon).toBe("40");
  });

  it("trata produto que não existe mais como preço manual e desconto fora da tabela como personalizado", () => {
    const state = quoteToCalculatorState({ ...baseQuote, handling_total: 0 }, [{
      display_order: 0,
      product_name_snapshot: "Produto descontinuado",
      payment_term_snapshot: "Prazo antigo",
      table_unit_price: 50,
      quantity: 2,
      weight_kg_snapshot: 30,
      line_discount_percentage: 7.25,
    }], catalog, 5);

    const customLineIndex = catalog.discountLines.findIndex((line) => line.percentage === null);
    expect(state.items[0]).toMatchObject({
      id: 5,
      name: "Produto descontinuado",
      productIndex: "",
      paymentTermIndex: "",
      tableUnitPrice: 50,
      discountLineIndex: String(customLineIndex),
      customDiscountPercentage: 7.25,
    });
    expect(state.handlingEnabled).toBe(false);
  });

  it("mantém a ordem dos itens e ignora frete cuja faixa não existe mais", () => {
    const state = quoteToCalculatorState({ ...baseQuote, freight_zone_snapshot: "faixa removida" }, [
      { display_order: 1, product_name_snapshot: "B", payment_term_snapshot: null, table_unit_price: 1, quantity: 1, weight_kg_snapshot: 30, line_discount_percentage: 0 },
      { display_order: 0, product_name_snapshot: "A", payment_term_snapshot: null, table_unit_price: 1, quantity: 1, weight_kg_snapshot: 30, line_discount_percentage: 0 },
    ], catalog, 1);

    expect(state.items.map((item) => item.name)).toEqual(["A", "B"]);
    expect(state.freightForm.table).toBe("");
  });
});
