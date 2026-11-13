import { describe, expect, it } from "vitest";
import {
  calculateCurrentOrder,
  calculateFreightPerBag,
  calculateHandlingPerBag,
  calculateTotalDiscount,
  type CurrentCalculationOptions,
  type CurrentOrderItem,
} from "./current-calculator";

const noExtras: CurrentCalculationOptions = {
  anticipatedPayment: false,
  freight: { table: "none" },
  handlingEnabled: false,
  handlingRatePerTon: 40,
};

function item(
  tableUnitPrice: number,
  quantity: number,
  weightKg: number,
  lineDiscountPercentage: number,
  name = "Produto de teste",
): CurrentOrderItem {
  return {
    name,
    tableUnitPrice,
    quantity,
    weightKg,
    lineDiscountPercentage,
  };
}

describe("caracterização dos descontos e preços atuais", () => {
  it("mantém produto sem desconto pelo preço de tabela", () => {
    const result = calculateCurrentOrder([item(56.69, 2, 40, 0)], noExtras);

    expect(result.items[0].finalUnitPrice).toBe(56.69);
    expect(result.productSubtotal).toBeCloseTo(113.38, 10);
    expect(result.economyTotal).toBe(0);
  });

  it("aplica desconto de linha diretamente sobre o preço", () => {
    const result = calculateCurrentOrder([item(150.91, 3, 30, 13)], noExtras);

    expect(result.items[0].totalDiscountPercentage).toBe(13);
    expect(result.items[0].finalUnitPrice).toBeCloseTo(131.2917, 10);
    expect(result.productSubtotal).toBeCloseTo(393.8751, 10);
    expect(result.economyTotal).toBeCloseTo(58.8549, 10);
  });

  it("aplica 1,5% quando antecipação está marcada", () => {
    const result = calculateCurrentOrder([item(56.69, 1, 40, 0)], {
      ...noExtras,
      anticipatedPayment: true,
    });

    expect(result.items[0].totalDiscountPercentage).toBe(1.5);
    expect(result.items[0].finalUnitPrice).toBeCloseTo(55.83965, 10);
    expect(result.economyTotal).toBeCloseTo(0.85035, 10);
  });

  it("soma desconto de linha e antecipação antes de calcular", () => {
    expect(calculateTotalDiscount(13, true)).toBe(14.5);

    const result = calculateCurrentOrder([item(150.91, 1, 30, 13)], {
      ...noExtras,
      anticipatedPayment: true,
    });

    expect(result.items[0].finalUnitPrice).toBeCloseTo(129.02805, 10);
    expect(result.showAccumulationWarning).toBe(true);
  });

  it("não arredonda valores intermediários antes de totalizar", () => {
    const result = calculateCurrentOrder([item(77.77, 4, 30, 6)], noExtras);

    expect(result.items[0].finalUnitPrice).toBeCloseTo(73.1038, 10);
    expect(result.productSubtotal).toBeCloseTo(292.4152, 10);
  });

  it("caracteriza desconto personalizado acima de 100% como subtotal negativo", () => {
    const result = calculateCurrentOrder([item(100, 1, 30, 150)], noExtras);

    expect(result.items[0].finalUnitPrice).toBe(-50);
    expect(result.productSubtotal).toBe(-50);
  });
});

describe("caracterização de múltiplos itens e pesos", () => {
  it("soma quantidade, peso, subtotal e economia de vários itens", () => {
    const result = calculateCurrentOrder(
      [item(100, 2, 40, 0, "Ração"), item(200, 3, 30, 10, "Proteinado")],
      noExtras,
    );

    expect(result.productCount).toBe(2);
    expect(result.totalQuantity).toBe(5);
    expect(result.totalWeightKg).toBe(170);
    expect(result.productSubtotal).toBe(740);
    expect(result.economyTotal).toBe(60);
  });

  it("aceita pedido abaixo de uma tonelada sem erro ou aviso", () => {
    const result = calculateCurrentOrder([item(100, 1, 30, 0)], noExtras);

    expect(result.totalWeightKg).toBe(30);
    expect(result.grandTotal).toBe(100);
  });
});

describe("caracterização do frete Juara", () => {
  const fractional = {
    table: "juara" as const,
    loadType: "fractional" as const,
    rates: { bag25: 1.6, bag30: 1.9, bag40: 2.5, closedPerTon: 25 },
  };

  it.each([
    [25, 1.6],
    [30, 1.9],
    [40, 2.5],
  ])("usa a coluna específica para saco de %i kg", (weightKg, expected) => {
    expect(calculateFreightPerBag(fractional, weightKg)).toEqual({
      value: expected,
      note: "",
    });
  });

  it("usa a tarifa fechada para peso fracionado fora de 25/30/40 kg", () => {
    expect(calculateFreightPerBag(fractional, 50)).toEqual({
      value: 1.25,
      note: "Peso fora de 25/30/40 kg: convertido pela carga fechada.",
    });
  });

  it("converte carga fechada por tonelada para valor por saca", () => {
    const result = calculateFreightPerBag(
      { ...fractional, loadType: "closed" },
      30,
    );

    expect(result.value).toBeCloseTo(0.75, 10);
  });

  it("aceita carga fechada com apenas uma saca", () => {
    const result = calculateCurrentOrder([item(100, 1, 30, 0)], {
      ...noExtras,
      freight: { ...fractional, loadType: "closed" },
    });

    expect(result.totalWeightKg).toBe(30);
    expect(result.freightTotal).toBeCloseTo(0.75, 10);
  });
});

describe("caracterização do frete Regional", () => {
  const brasnorte = {
    table: "regional" as const,
    loadType: "fractional" as const,
    rates: { fractionalPerTon: 210, closedPerTon: 185 },
  };

  it("calcula modalidade fracionada por tonelada e peso da saca", () => {
    expect(calculateFreightPerBag(brasnorte, 30).value).toBeCloseTo(6.3, 10);
  });

  it("calcula carga fechada por tonelada e peso da saca", () => {
    expect(
      calculateFreightPerBag({ ...brasnorte, loadType: "closed" }, 30).value,
    ).toBeCloseTo(5.55, 10);
  });

  it("retorna zero e aviso quando a cidade não possui tarifa fracionada", () => {
    const aripuana = {
      table: "regional" as const,
      loadType: "fractional" as const,
      rates: { fractionalPerTon: null, closedPerTon: 446 },
    };

    expect(calculateFreightPerBag(aripuana, 30)).toEqual({
      value: 0,
      note: "Esta cidade só tem carga fechada (mínimo de tonelagem).",
    });
  });

  it("não valida o mínimo de 10 toneladas em Aripuanã", () => {
    const result = calculateCurrentOrder([item(100, 1, 30, 0)], {
      ...noExtras,
      freight: {
        table: "regional",
        loadType: "closed",
        rates: { fractionalPerTon: null, closedPerTon: 446 },
      },
    });

    expect(result.totalWeightKg).toBe(30);
    expect(result.freightTotal).toBeCloseTo(13.38, 10);
  });
});

describe("caracterização da chapa e do total geral", () => {
  it("calcula chapa por tonelada e peso da saca", () => {
    expect(calculateHandlingPerBag(true, 40, 30)).toBeCloseTo(1.2, 10);
    expect(calculateHandlingPerBag(false, 40, 30)).toBe(0);
  });

  it("soma produto, frete e chapa no total geral", () => {
    const result = calculateCurrentOrder([item(100, 10, 30, 10)], {
      anticipatedPayment: false,
      freight: {
        table: "regional",
        loadType: "fractional",
        rates: { fractionalPerTon: 210, closedPerTon: 185 },
      },
      handlingEnabled: true,
      handlingRatePerTon: 40,
    });

    expect(result.productSubtotal).toBe(900);
    expect(result.freightTotal).toBe(63);
    expect(result.handlingTotal).toBe(12);
    expect(result.averageHandlingPerBag).toBeCloseTo(1.2, 10);
    expect(result.grandTotal).toBe(975);
  });

  it("permite chapa em carga fracionada", () => {
    const result = calculateCurrentOrder([item(100, 1, 30, 0)], {
      ...noExtras,
      freight: {
        table: "regional",
        loadType: "fractional",
        rates: { fractionalPerTon: 210, closedPerTon: 185 },
      },
      handlingEnabled: true,
    });

    expect(result.handlingTotal).toBeCloseTo(1.2, 10);
  });
});
