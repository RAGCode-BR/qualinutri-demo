import { describe, expect, it } from "vitest";
import { isValidLogin, loginToInternalEmail, normalizeLogin } from "../../src/features/auth/login";

describe("credencial de login", () => {
  it("normaliza espaços e letras maiúsculas", () => {
    expect(normalizeLogin("  Meu.Login  ")).toBe("meu.login");
  });

  it("aceita apenas o conjunto de caracteres permitido", () => {
    expect(isValidLogin("usuario_01")).toBe(true);
    expect(isValidLogin("ab")).toBe(false);
    expect(isValidLogin("usuário")).toBe(false);
    expect(isValidLogin("usuario@email.com")).toBe(false);
  });

  it("gera o identificador interno sem expor um e-mail pessoal", () => {
    expect(loginToInternalEmail("Meu.Login")).toBe("meu.login@login.qualinutri.invalid");
  });
});
