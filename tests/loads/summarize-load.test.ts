import { describe, expect, it } from "vitest";
import { summarizeLoad, weightKey, type LoadLine } from "../../src/domain/loads/summarizeLoad";

const settings = { palletWeightKg: 20, bagsPerPallet: { "30": 10, "40": 35 } };

describe("resumo da carga", () => {
  it("soma sacas e peso de cargas soltas, sem paletes", () => {
    const lines: LoadLine[] = [
      { quoteId: "a", weightKg: 40, quantity: 10, packing: "loose" },
      { quoteId: "b", weightKg: 25, quantity: 4, packing: "loose" },
    ];
    expect(summarizeLoad(lines, 1000, settings)).toMatchObject({
      bags: 14, bagsWeightKg: 500, pallets: 0, totalWeightKg: 500, remainingKg: 500, level: "ok",
    });
  });

  it("conta paletes por pedido e peso de saca, arredondando para cima, e soma o palete vazio", () => {
    // Igual ao teste da migration: 20 sacas de 30 kg em paletes de 10 → 2 paletes de 20 kg.
    expect(summarizeLoad([{ quoteId: "a", weightKg: 30, quantity: 20, packing: "pallet" }], 1000, settings))
      .toMatchObject({ pallets: 2, palletsWeightKg: 40, totalWeightKg: 640 });
    // Pedidos diferentes não dividem palete: 5 + 5 sacas → 2 paletes, não 1.
    const twoOrders = summarizeLoad([
      { quoteId: "a", weightKg: 30, quantity: 5, packing: "pallet" },
      { quoteId: "b", weightKg: 30, quantity: 5, packing: "pallet" },
    ], 1000, settings);
    expect(twoOrders.pallets).toBe(2);
    // No mesmo pedido, itens do mesmo peso dividem palete.
    const sameOrder = summarizeLoad([
      { quoteId: "a", weightKg: 30, quantity: 5, packing: "pallet" },
      { quoteId: "a", weightKg: 30, quantity: 6, packing: "pallet" },
    ], 1000, settings);
    expect(sameOrder.pallets).toBe(2);
  });

  it("avisa os pesos paletizados sem sacas por palete cadastradas e não conta esses paletes", () => {
    const summary = summarizeLoad([{ quoteId: "a", weightKg: 25, quantity: 50, packing: "pallet" }], 2000, settings);
    expect(summary.pallets).toBe(0);
    expect(summary.missingPalletWeights).toEqual([25]);
  });

  it("classifica a ocupação: vazia, normal, alerta a partir de 90% e acima da capacidade", () => {
    const line = (quantity: number): LoadLine[] => [{ quoteId: "a", weightKg: 40, quantity, packing: "loose" }];
    expect(summarizeLoad([], 1000, settings).level).toBe("empty");
    expect(summarizeLoad(line(22), 1000, settings).level).toBe("ok");
    expect(summarizeLoad(line(23), 1000, settings).level).toBe("warning");
    expect(summarizeLoad(line(25), 1000, settings).level).toBe("warning");
    const over = summarizeLoad(line(26), 1000, settings);
    expect(over.level).toBe("over");
    expect(over.remainingKg).toBe(-40);
  });

  it("usa a mesma chave de peso do banco", () => {
    expect(weightKey(25)).toBe("25");
    expect(weightKey(12.5)).toBe("12.5");
    expect(weightKey(Number("40.000"))).toBe("40");
  });
});
