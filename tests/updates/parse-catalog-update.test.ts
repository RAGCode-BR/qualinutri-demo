import { describe, expect, it } from "vitest";
import { parseCatalogUpdate, readNumbers } from "../../src/features/updates/parseCatalogUpdate";
import type { CommercialData } from "../../src/types/commercial";

const catalog: Pick<CommercialData, "products" | "paymentTermLabels" | "discountLines" | "juaraFreightRates" | "regionalFreightRates"> = {
  paymentTermLabels: ["à vista", "30 dd", "30/60 ou 45 dd"],
  products: [
    { id: "p1", name: "Quali Engorda 160 RM", group: "Rações", weightKg: 40, prices: [56.69, 57.82, 58.4] },
    { id: "p2", name: "Quali Engorda 180 RM", group: "Rações", weightKg: 40, prices: [58.19, 59.35, 59.95] },
    { id: "p3", name: "Quali phos 80 cria", group: "Mineral", weightKg: 30, prices: [150.91, 153.93, 155.47] },
  ],
  discountLines: [
    { id: "d1", name: "Qualiphós 80", percentage: 13 },
    { id: "d2", name: "Linha Adense", percentage: 6 },
    { id: "d3", name: "Outro / personalizado", percentage: null },
  ],
  juaraFreightRates: [
    { id: "j1", distance: "Até 25 km", bag25: 1.6, bag30: 1.9, bag40: 2.5, closedPerTon: 25 },
    { id: "j2", distance: "26 a 45 km", bag25: 2.45, bag30: 2.95, bag40: 3.9, closedPerTon: 38 },
  ],
  regionalFreightRates: [
    { id: "g1", location: "Brasnorte até 35 km", fractionalPerTon: 210, closedPerTon: 185 },
    { id: "g2", location: "Aripuanã (mín. 10 t)", fractionalPerTon: null, closedPerTon: 446 },
  ],
};

describe("leitura de números", () => {
  it("entende formato brasileiro, milhar, inteiros e percentuais", () => {
    expect(readNumbers("R$ 1.234,56 58,40 40 13%").map((token) => [token.value, token.decimal, token.percent]))
      .toEqual([[1234.56, true, false], [58.4, true, false], [40, false, false], [13, false, true]]);
  });

  it("não lê frações de prazo como números", () => {
    expect(readNumbers("30/60/90 ou 60 dd").map((token) => token.value)).toEqual([60]);
  });
});

describe("proposta de atualização a partir das linhas do PDF", () => {
  const lines = [
    "TABELA DE PREÇOS — válida a partir de 01/11/2026",
    "Produto Peso à vista 30 dd 30/60 ou 45 dd",
    "Rações",
    "Quali Engorda 160 RM 40 R$ 59,90 R$ 61,10 R$ 61,70",
    "Quali Engorda 180 RM 40 58,19 59,35 59,95",
    "Quali Engorda 160 RM Plus 40 62,00 63,10 63,80",
    "Mineral",
    "Quali phos 95 cria 30 170,00 173,40 175,10",
    "Qualiphós 80 15%",
    "Linha Adense 6%",
    "Até 25 km 1,70 2,00 2,60 26",
    "26 a 45 km 2,45 2,95 3,90 38",
    "Brasnorte até 35 km 220 190",
    "Aripuanã (mín. 10 t) — 460",
    "Linha qualquer com número 123 que não é nada",
  ];
  const proposal = parseCatalogUpdate(lines, catalog);

  it("encontra produto cadastrado com preço novo e mostra só os prazos que mudaram", () => {
    expect(proposal.productUpdates).toHaveLength(1);
    expect(proposal.productUpdates[0]).toMatchObject({
      id: "p1",
      weight: null,
      nextPrices: [59.9, 61.1, 61.7],
      prices: [
        { termIndex: 0, current: 56.69, next: 59.9 },
        { termIndex: 1, current: 57.82, next: 61.1 },
        { termIndex: 2, current: 58.4, next: 61.7 },
      ],
    });
  });

  it("não confunde produto novo com nome parecido com um existente", () => {
    expect(proposal.newProducts.map((product) => product.name)).toEqual(["Quali Engorda 160 RM Plus", "Quali phos 95 cria"]);
    expect(proposal.newProducts[0]).toMatchObject({ weightKg: 40, prices: [62, 63.1, 63.8], category: "Rações" });
    expect(proposal.newProducts[1]).toMatchObject({ weightKg: 30, category: "Mineral" });
  });

  it("avisa produto cadastrado que não aparece no PDF e conta os que estão iguais", () => {
    expect(proposal.missingProducts.map((product) => product.id)).toEqual(["p3"]);
    expect(proposal.unchanged.products).toBe(1);
  });

  it("atualiza o percentual de desconto que mudou", () => {
    expect(proposal.discountUpdates).toEqual([{ id: "d1", name: "Qualiphós 80", current: 13, next: 15 }]);
    expect(proposal.unchanged.discounts).toBe(1);
  });

  it("atualiza o frete Juara e Regional, inclusive cidade só com carga fechada", () => {
    const juara = proposal.freightUpdates.find((update) => update.id === "j1");
    expect(juara?.nextRates).toEqual({ bag25: 1.7, bag30: 2, bag40: 2.6, closedPerTon: 26 });
    expect(juara?.changes.map((change) => change.field)).toEqual(["bag25", "bag30", "bag40", "closedPerTon"]);
    expect(proposal.freightUpdates.find((update) => update.id === "g1")?.nextRates).toEqual({ fractionalPerTon: 220, closedPerTon: 190 });
    expect(proposal.freightUpdates.find((update) => update.id === "g2")?.nextRates).toEqual({ fractionalPerTon: null, closedPerTon: 460 });
    expect(proposal.freightUpdates.some((update) => update.id === "j2")).toBe(false);
    expect(proposal.unchanged.freight).toBe(1);
  });

  it("lista as linhas com números que não foram entendidas", () => {
    expect(proposal.unrecognizedLines).toContain("Linha qualquer com número 123 que não é nada");
  });
});

describe("linhas de tabela que quebram dentro da célula", () => {
  // Como o pdf.js entrega uma linha de tabela em que o nome e os preços quebraram:
  // o nome em duas linhas e o peso, centralizado, numa linha do meio.
  const at = (...pieces: Array<[string, number]>) => ({ text: pieces.map(([text]) => text).join(" "), pieces: pieces.map(([text, x]) => ({ text, x })) });
  const lines = [
    at(["Quali Engorda", 10], ["R$", 250], ["R$", 320]),
    at(["40", 200], ["R$ 60,15", 380]),
    at(["160 RM", 10], ["58,39", 252], ["59,55", 322]),
    at(["Quali Engorda", 10], ["R$", 250], ["R$", 320]),
    at(["40", 200], ["R$ 61,75", 380]),
    at(["180 RM", 10], ["59,94", 252], ["61,13", 322]),
    at(["Quali phos 95", 10], ["R$", 250], ["R$", 320]),
    at(["30", 200], ["R$ 175,10", 380]),
    at(["cria", 10], ["170,00", 252], ["173,40", 322]),
  ];
  const proposal = parseCatalogUpdate(lines, catalog);

  it("remonta a linha pela ordem das colunas e reconhece o produto cadastrado", () => {
    expect(proposal.productUpdates.map((update) => [update.id, update.nextPrices])).toEqual([
      ["p1", [58.39, 59.55, 60.15]],
      ["p2", [59.94, 61.13, 61.75]],
    ]);
  });

  it("não transforma um nome cortado em produto novo e reconhece o produto novo quebrado", () => {
    expect(proposal.newProducts.map((product) => [product.name, product.weightKg, product.prices])).toEqual([
      ["Quali phos 95 cria", 30, [170, 173.4, 175.1]],
    ]);
    expect(proposal.unrecognizedLines).toEqual([]);
  });

  it("detecta produto novo cujo nome contém o nome de um desconto", () => {
    const result = parseCatalogUpdate(["Mineral", "Linha Adense Premium 25 90,00 91,80 92,70"], catalog);
    expect(result.newProducts.map((product) => [product.name, product.weightKg])).toEqual([["Linha Adense Premium", 25]]);
    expect(result.discountUpdates).toEqual([]);
  });
});
