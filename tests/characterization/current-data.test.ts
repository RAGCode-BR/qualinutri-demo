import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discountLines,
  juaraFreightRates,
  paymentTermLabels,
  products,
  regionalFreightRates,
} from "../../src/data/commercialData";

type ProductRow = [string, string, number, number[]];

type LegacyData = {
  sourceDates: {
    priceTable: string;
    discountTable: string;
    freightTable: string;
  };
  TERMS: string[];
  LINES: Array<{ n: string; p: number | null }>;
  PRODR: ProductRow[];
  PRODM: ProductRow[];
  PROD: ProductRow[];
  FJUARA: Array<[string, number, number, number, number]>;
  FREG: Array<[string, number | null, number]>;
  POLICY: Array<[string, string]>;
};

function loadCommercialSnapshot(): LegacyData {
  return JSON.parse(readFileSync(
    resolve(process.cwd(), "src/data/commercial-snapshot.json"),
    "utf8",
  )) as LegacyData;
}

describe("snapshot estrutural dos dados comerciais migrados", () => {
  const data = loadCommercialSnapshot();

  it("preserva seis condições de pagamento na ordem atual", () => {
    expect(Array.from(data.TERMS)).toEqual([
      "à vista",
      "30 dd",
      "30/60 ou 45 dd",
      "30/60/90 ou 60 dd",
      "30/60/90/120 ou 75 dd",
      "30/60/90/120/150 ou 90 dd",
    ]);
  });

  it("preserva as nove opções de desconto e percentuais atuais", () => {
    expect(Array.from(data.LINES, (line) => ({ ...line }))).toEqual([
      { n: "Qualiphós 80", p: 13 },
      { n: "Qualiphós 40/60", p: 8 },
      { n: "Linha Adense", p: 6 },
      { n: "Qualiphós 130/160 (Concentrados)", p: 3 },
      { n: "Linha Top Aditivada", p: 3 },
      { n: "Linha Nutripasto / Nutriengorda", p: 10 },
      { n: "Rações", p: 0 },
      { n: "Núcleos", p: 12 },
      { n: "Outro / personalizado", p: null },
    ]);
  });

  it("preserva 50 produtos com seis preços por produto", () => {
    expect(data.PRODR).toHaveLength(23);
    expect(data.PRODM).toHaveLength(27);
    expect(data.PROD).toHaveLength(50);
    expect(data.PROD.every((product) => product[3].length === 6)).toBe(true);
  });

  it("preserva registros representativos de produto e preço", () => {
    expect(Array.from(data.PROD[0], (value) =>
      Array.isArray(value) ? Array.from(value) : value,
    )).toEqual([
      "Rações",
      "Quali Engorda 160 RM",
      40,
      [56.69, 57.82, 58.4, 58.99, 59.56, 60.16],
    ]);
    expect(data.PROD.at(-1)?.[1]).toBe("Quali conf 4 pasto");
  });

  it("preserva seis faixas de Juara e dez faixas regionais", () => {
    expect(data.FJUARA).toHaveLength(6);
    expect(data.FREG).toHaveLength(10);
    expect(Array.from(data.FREG[3])).toEqual(["Aripuanã (mín. 10 t)", null, 446]);
    expect(Array.from(data.FREG[9])).toEqual(["Juruena (mín. 9 t)", null, 283]);
  });

  it("preserva as quatorze seções da política", () => {
    expect(data.POLICY).toHaveLength(14);
    expect(data.POLICY[0][0]).toBe("1. Objetivo");
    expect(data.POLICY[13][0]).toBe("14. Vigência e revisão");
  });

  it("preserva as datas comerciais publicadas na origem", () => {
    expect(data.sourceDates).toEqual({
      priceTable: "2026-09-03",
      discountTable: "2026-02-24",
      freightTable: "2026-05-06",
    });
  });

  it("mantém os dados locais em igualdade com o snapshot versionado", () => {
    expect(paymentTermLabels).toEqual(Array.from(data.TERMS));
    expect(discountLines).toEqual(
      Array.from(data.LINES, (line) => ({
        name: line.n,
        percentage: line.p,
      })),
    );
    expect(products).toEqual(
      Array.from(data.PROD, (product) => ({
        group: product[0],
        name: product[1],
        weightKg: product[2],
        prices: Array.from(product[3]),
      })),
    );
    expect(juaraFreightRates).toEqual(
      Array.from(data.FJUARA, (rate) => ({
        distance: rate[0],
        bag25: rate[1],
        bag30: rate[2],
        bag40: rate[3],
        closedPerTon: rate[4],
      })),
    );
    expect(regionalFreightRates).toEqual(
      Array.from(data.FREG, (rate) => ({
        location: rate[0],
        fractionalPerTon: rate[1],
        closedPerTon: rate[2],
      })),
    );
  });
});
