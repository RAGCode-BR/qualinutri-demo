import { describe, expect, it } from "vitest";
import {
  formatDocumentInput,
  guessDocumentKind,
  isValidCnpj,
  isValidCpf,
  validateDocument,
} from "../../src/domain/documents/brazilianDocument";

describe("CPF", () => {
  it("aceita CPF com dígitos verificadores corretos, com ou sem pontuação", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("aceita CNPJ alfanumérico válido, inclusive digitado em minúsculas", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });

  it("recusa dígito verificador errado, letra no verificador e sequência repetida", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-3A")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("validação do documento do cliente", () => {
  it("trata vazio como ausente", () => {
    expect(validateDocument("  ")).toEqual({ valid: true, kind: null, formatted: null });
    expect(validateDocument(null)).toEqual({ valid: true, kind: null, formatted: null });
  });

  it("devolve o documento no formato padrão", () => {
    expect(validateDocument("52998224725")).toEqual({ valid: true, kind: "cpf", formatted: "529.982.247-25" });
    expect(validateDocument("11222333000181")).toEqual({ valid: true, kind: "cnpj", formatted: "11.222.333/0001-81" });
    expect(validateDocument("12abc34501de35")).toEqual({ valid: true, kind: "cnpj", formatted: "12.ABC.345/01DE-35" });
  });

  it("explica o erro quando o documento é inválido", () => {
    expect(validateDocument("529.982.247-26")).toMatchObject({ valid: false, message: expect.stringContaining("CPF") });
    expect(validateDocument("11.222.333/0001-82")).toMatchObject({ valid: false, message: expect.stringContaining("CNPJ") });
    expect(validateDocument("123")).toMatchObject({ valid: false });
  });
});

describe("pontuação durante a digitação", () => {
  it("usa a máscara de CPF até 11 dígitos", () => {
    expect(formatDocumentInput("529")).toBe("529");
    expect(formatDocumentInput("5299822")).toBe("529.982.2");
    expect(formatDocumentInput("52998224725")).toBe("529.982.247-25");
  });

  it("muda para a máscara de CNPJ com 12 caracteres ou com letras", () => {
    expect(formatDocumentInput("112223330001")).toBe("11.222.333/0001");
    expect(formatDocumentInput("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocumentInput("12abc")).toBe("12.ABC");
  });

  it("ignora caracteres além do limite", () => {
    expect(formatDocumentInput("112223330001819999")).toBe("11.222.333/0001-81");
  });
});

describe("tipo provável do documento", () => {
  it("identifica CPF, CNPJ e campo vazio enquanto o usuário digita", () => {
    expect(guessDocumentKind("")).toBeNull();
    expect(guessDocumentKind("529.982")).toBe("cpf");
    expect(guessDocumentKind("52998224725")).toBe("cpf");
    expect(guessDocumentKind("112223330001")).toBe("cnpj");
    expect(guessDocumentKind("12A")).toBe("cnpj");
  });
});
