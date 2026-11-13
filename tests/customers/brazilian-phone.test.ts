import { describe, expect, it } from "vitest";
import { formatPhoneInput, validatePhone } from "../../src/domain/contacts/brazilianPhone";

describe("telefone/celular", () => {
  it("aceita fixo e celular com DDD e devolve o formato padrão", () => {
    expect(validatePhone("6635562300")).toEqual({ valid: true, kind: "landline", formatted: "(66) 3556-2300" });
    expect(validatePhone("(66) 99912-3456")).toEqual({ valid: true, kind: "mobile", formatted: "(66) 99912-3456" });
  });

  it("trata vazio como ausente", () => {
    expect(validatePhone(" ")).toEqual({ valid: true, kind: null, formatted: null });
  });

  it("recusa número sem DDD, DDD inválido e tamanho errado", () => {
    expect(validatePhone("35562300")).toMatchObject({ valid: false });
    expect(validatePhone("0635562300")).toMatchObject({ valid: false, message: expect.stringContaining("DDD") });
    expect(validatePhone("663556230")).toMatchObject({ valid: false });
  });

  it("recusa celular sem o 9 e fixo começando com dígito de celular", () => {
    expect(validatePhone("66899123456")).toMatchObject({ valid: false });
    expect(validatePhone("6699123456")).toMatchObject({ valid: false });
  });

  it("aplica a pontuação durante a digitação e respeita o limite", () => {
    expect(formatPhoneInput("6")).toBe("(6");
    expect(formatPhoneInput("663")).toBe("(66) 3");
    expect(formatPhoneInput("6635562")).toBe("(66) 3556-2");
    expect(formatPhoneInput("6635562300")).toBe("(66) 3556-2300");
    expect(formatPhoneInput("66999123456")).toBe("(66) 99912-3456");
    expect(formatPhoneInput("669991234567890")).toBe("(66) 99912-3456");
  });
});
