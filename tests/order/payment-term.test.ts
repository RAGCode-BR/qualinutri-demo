import { describe, expect, it } from "vitest";
import { describePaymentTerm, hasPaymentModeChoice, splitPaymentTerm } from "../../src/domain/payment/paymentTerm";

describe("forma do prazo de pagamento", () => {
  it("reconhece os prazos com as duas formas, como estão no banco", () => {
    expect(hasPaymentModeChoice("30/60 ou 45 dd")).toBe(true);
    expect(hasPaymentModeChoice("30/60/90 ou 60 dd")).toBe(true);
    expect(hasPaymentModeChoice("30/60/90/120 ou 75 dd")).toBe(true);
    expect(splitPaymentTerm("30/60/90/120/150 ou 90 dd")).toEqual({ installments: ["30", "60", "90", "120", "150"], singleDays: "90" });
    expect(hasPaymentModeChoice("à vista")).toBe(false);
    expect(hasPaymentModeChoice("30 dd")).toBe(false);
    expect(hasPaymentModeChoice(null)).toBe(false);
  });

  it("descreve só a forma combinada", () => {
    expect(describePaymentTerm("30/60/90/120/150 ou 90 dd", "installments")).toBe("Parcelado em 5x: 30/60/90/120/150 dias");
    expect(describePaymentTerm("30/60/90/120/150 ou 90 dd", "single")).toBe("Direto: pagamento único em 90 dias");
    expect(describePaymentTerm("30/60 ou 45 dd", "installments")).toBe("Parcelado em 2x: 30/60 dias");
  });

  it("mantém o texto original quando o prazo não tem escolha ou o orçamento é antigo", () => {
    expect(describePaymentTerm("30 dd", "single")).toBe("Prazo 30 dd");
    expect(describePaymentTerm("à vista", null)).toBe("Prazo à vista");
    expect(describePaymentTerm("30/60/90 ou 60 dd", null)).toBe("Prazo 30/60/90 ou 60 dd");
  });
});

describe("prazo nas condições do PDF", () => {
  it("mostra a forma escolhida ou o próprio prazo, com inicial maiúscula", async () => {
    const { paymentTermCondition } = await import("../../src/domain/payment/paymentTerm");
    expect(paymentTermCondition("30/60/90 ou 60 dd", "installments")).toBe("Parcelado em 3x: 30/60/90 dias");
    expect(paymentTermCondition("30/60/90 ou 60 dd", "single")).toBe("Direto: pagamento único em 60 dias");
    expect(paymentTermCondition("à vista", null)).toBe("À vista");
    expect(paymentTermCondition("30 dd", null)).toBe("30 dd");
  });
});
