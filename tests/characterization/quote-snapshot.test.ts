import { describe, expect, it } from "vitest";
import { calculateCurrentOrder, createQuoteSnapshot, mapQuoteSnapshotToPayload } from "../../src/domain";
import type { Product } from "../../src/types/commercial";

const products: Product[] = [{
  group: "Mineral",
  name: "Quali phos 80 cria",
  weightKg: 30,
  prices: [150.91, 153.93, 155.47, 157.02, 158.56, 160.15],
}];

describe("snapshot histórico de orçamento", () => {
  it("registra referências do catálogo vigente quando disponíveis", () => {
    const sourceItems = [{
      name: "Produto",
      productIndex: "0",
      paymentTermIndex: "0",
      discountLineIndex: "0",
      tableUnitPrice: 100,
      quantity: 1,
      weightKg: 30,
      lineDiscountPercentage: 10,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: false,
      freight: { table: "none" },
      handlingEnabled: false,
      handlingRatePerTon: 40,
    });
    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products: [{ id: "product-id", group: "Mineral", name: "Produto", weightKg: 30, prices: [100] }],
      paymentTermLabels: ["à vista"],
      anticipatedPayment: false,
      handlingRatePerTon: 0,
      freight: { tableName: null, zone: null, loadType: null },
      catalog: {
        paymentTermLabels: ["à vista"], paymentTermIds: ["term-id"], paymentTerms: [],
        discountLines: [{ id: "rule-id", name: "Linha", percentage: 10 }],
        products: [], rationProducts: [], mineralProducts: [], juaraFreightRates: [], regionalFreightRates: [],
        handlingRatePerTon: 40, policyVersion: "1", policySections: [],
        priceTableId: "price-id", discountTableId: "discount-id", handlingRateTableId: "handling-id", policyVersionId: "policy-id",
      },
    });
    expect(snapshot).toMatchObject({ priceTableId: "price-id", discountTableId: "discount-id", policyVersionId: "policy-id" });
    expect(snapshot.items[0]).toMatchObject({ productId: "product-id", paymentTermId: "term-id", discountRuleId: "rule-id" });
  });

  it("copia entradas e resultados sem arredondar valores intermediários", () => {
    const sourceItems = [{
      name: products[0].name,
      productIndex: "0",
      paymentTermIndex: "0",
      tableUnitPrice: 150.91,
      quantity: 3,
      weightKg: 30,
      lineDiscountPercentage: 13,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: true,
      freight: {
        table: "regional",
        loadType: "fractional",
        rates: { fractionalPerTon: 210, closedPerTon: 185 },
      },
      handlingEnabled: true,
      handlingRatePerTon: 40,
    });

    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products,
      paymentTermLabels: ["à vista"],
      anticipatedPayment: true,
      handlingRatePerTon: 40,
      freight: { tableName: "Regional", zone: "Brasnorte até 35 km", loadType: "fractional" },
    });

    expect(snapshot.calculationVersion).toBe("legacy-html-v1");
    expect(snapshot.anticipatedDiscountPercentage).toBe(1.5);
    expect(snapshot.items[0].finalUnitPrice).toBeCloseTo(129.02805, 10);
    expect(snapshot.items[0].productSubtotal).toBeCloseTo(387.08415, 10);
    expect(snapshot.items[0].freightSubtotal).toBeCloseTo(18.9, 10);
    expect(snapshot.items[0].handlingSubtotal).toBeCloseTo(3.6, 10);
    expect(snapshot.items[0].total).toBeCloseTo(409.58415, 10);
    expect(snapshot.grandTotal).toBeCloseTo(409.58415, 10);
  });

  it("mantém os textos copiados mesmo quando o catálogo vigente muda", () => {
    const sourceItems = [{
      name: products[0].name,
      productIndex: "0",
      paymentTermIndex: "0",
      tableUnitPrice: 150.91,
      quantity: 1,
      weightKg: 30,
      lineDiscountPercentage: 0,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: false,
      freight: { table: "none" },
      handlingEnabled: false,
      handlingRatePerTon: 40,
    });
    const labels = ["à vista"];
    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products,
      paymentTermLabels: labels,
      anticipatedPayment: false,
      handlingRatePerTon: 40,
      freight: { tableName: null, zone: null, loadType: null },
    });

    products[0].name = "Nome futuro";
    labels[0] = "Condição futura";

    expect(snapshot.items[0].productName).toBe("Quali phos 80 cria");
    expect(snapshot.items[0].categoryName).toBe("Mineral");
    expect(snapshot.items[0].paymentTerm).toBe("à vista");
    expect(snapshot.items[0].tableUnitPrice).toBe(150.91);
  });

  it("preserva preço manual sem inventar referências de catálogo", () => {
    const sourceItems = [{
      name: "Preço informado manualmente",
      productIndex: "",
      paymentTermIndex: "",
      tableUnitPrice: 100,
      quantity: 1,
      weightKg: 30,
      lineDiscountPercentage: 0,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: false,
      freight: { table: "none" },
      handlingEnabled: false,
      handlingRatePerTon: 40,
    });
    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products,
      paymentTermLabels: ["à vista"],
      anticipatedPayment: false,
      handlingRatePerTon: 40,
      freight: { tableName: null, zone: null, loadType: null },
    });

    expect(snapshot.items[0]).toMatchObject({
      productId: null,
      paymentTermId: null,
      categoryName: null,
      paymentTerm: null,
      productName: "Preço informado manualmente",
    });
  });

  it("mapeia o snapshot para o contrato transacional do PostgreSQL", () => {
    const sourceItems = [{
      name: "Preço informado manualmente",
      productIndex: "",
      paymentTermIndex: "",
      tableUnitPrice: 77.77,
      quantity: 4,
      weightKg: 30,
      lineDiscountPercentage: 6,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: false,
      freight: { table: "none" },
      handlingEnabled: false,
      handlingRatePerTon: 40,
    });
    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products,
      paymentTermLabels: ["à vista"],
      anticipatedPayment: false,
      handlingRatePerTon: 40,
      freight: { tableName: null, zone: null, loadType: null },
    });

    const payload = mapQuoteSnapshotToPayload(snapshot);

    expect(payload.quote.calculation_version).toBe("legacy-html-v1");
    expect(payload.quote.grand_total).toBeCloseTo(292.4152, 10);
    expect(payload.items[0].final_unit_price).toBeCloseTo(73.1038, 10);
    expect(payload.items[0].product_subtotal).toBeCloseTo(292.4152, 10);
    expect(payload.items[0].product_name_snapshot).toBe("Preço informado manualmente");
  });

  it("grava a forma do prazo só quando algum item tem prazo com as duas formas", () => {
    const item = (paymentTermIndex: string) => [{ name: "Produto", productIndex: "", paymentTermIndex, tableUnitPrice: 10, quantity: 1, weightKg: 30, lineDiscountPercentage: 0 }];
    const labels = ["à vista", "30 dd", "30/60/90 ou 60 dd"];
    const build = (paymentTermIndex: string) => {
      const items = item(paymentTermIndex);
      const calculation = calculateCurrentOrder(items, { anticipatedPayment: false, freight: { table: "none" }, handlingEnabled: false, handlingRatePerTon: 40 });
      return createQuoteSnapshot({ items, calculation, products, paymentTermLabels: labels, anticipatedPayment: false, handlingRatePerTon: 40, freight: { tableName: null, zone: null, loadType: null }, paymentMode: "single" });
    };
    expect(mapQuoteSnapshotToPayload(build("2")).quote.payment_mode).toBe("single");
    expect(mapQuoteSnapshotToPayload(build("1")).quote.payment_mode).toBeNull();
    expect(mapQuoteSnapshotToPayload(build("")).quote.payment_mode).toBeNull();
  });

  it("envia as observações sem espaços nas pontas e grava vazio como nulo", () => {
    const sourceItems = [{ name: "Produto", productIndex: "", paymentTermIndex: "", tableUnitPrice: 10, quantity: 1, weightKg: 30, lineDiscountPercentage: 0 }];
    const calculation = calculateCurrentOrder(sourceItems, { anticipatedPayment: false, freight: { table: "none" }, handlingEnabled: false, handlingRatePerTon: 40 });
    const base = { items: sourceItems, calculation, products, paymentTermLabels: ["à vista"], anticipatedPayment: false, handlingRatePerTon: 40, freight: { tableName: null, zone: null, loadType: null } };

    expect(mapQuoteSnapshotToPayload(createQuoteSnapshot({ ...base, notes: "  Entrega na semana do dia 20.  " })).quote.notes)
      .toBe("Entrega na semana do dia 20.");
    expect(mapQuoteSnapshotToPayload(createQuoteSnapshot({ ...base, notes: "   " })).quote.notes).toBeNull();
    expect(mapQuoteSnapshotToPayload(createQuoteSnapshot(base)).quote.notes).toBeNull();
  });

  it("preserva o cliente como snapshot mesmo se o cadastro mudar", () => {
    const customer = { id: "customer-1", name: "Fazenda Exemplo Ltda", document: "00.000.000/0001-00" };
    const sourceItems = [{
      name: "Preço informado manualmente",
      productIndex: "",
      paymentTermIndex: "",
      tableUnitPrice: 100,
      quantity: 1,
      weightKg: 30,
      lineDiscountPercentage: 0,
    }];
    const calculation = calculateCurrentOrder(sourceItems, {
      anticipatedPayment: false,
      freight: { table: "none" },
      handlingEnabled: false,
      handlingRatePerTon: 40,
    });
    const snapshot = createQuoteSnapshot({
      items: sourceItems,
      calculation,
      products,
      paymentTermLabels: ["à vista"],
      anticipatedPayment: false,
      handlingRatePerTon: 40,
      freight: { tableName: null, zone: null, loadType: null },
      customer,
    });

    customer.name = "Nome alterado posteriormente";
    customer.document = "11.111.111/0001-11";
    const payload = mapQuoteSnapshotToPayload(snapshot);

    expect(payload.quote.customer_id).toBe("customer-1");
    expect(payload.quote.customer_name_snapshot).toBe("Fazenda Exemplo Ltda");
    expect(payload.quote.customer_document_snapshot).toBe("00.000.000/0001-00");
  });
});
