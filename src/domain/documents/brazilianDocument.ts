/**
 * CPF (11 dígitos) e CNPJ (14 caracteres). Desde julho de 2026 a Receita Federal
 * emite CNPJs alfanuméricos: as 12 primeiras posições aceitam letras maiúsculas e
 * os 2 dígitos verificadores continuam numéricos. A mesma regra está no banco,
 * em public.normalize_customer_document.
 */

export type DocumentKind = "cpf" | "cnpj";

export type DocumentValidation =
  | { valid: true; kind: DocumentKind | null; formatted: string | null }
  | { valid: false; message: string };

export const DOCUMENT_MAX_LENGTH = 18;

/** Remove pontuação e espaços; letras ficam maiúsculas. */
export function stripDocument(value: string) {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function characterValue(character: string) {
  return character.charCodeAt(0) - 48;
}

function checkDigit(base: string, weights: number[]) {
  const sum = [...base].reduce((total, character, index) => total + characterValue(character) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasRepeatedCharacters(value: string) {
  return /^(.)\1*$/.test(value);
}

export function isValidCpf(value: string) {
  const cpf = stripDocument(value);
  if (!/^\d{11}$/.test(cpf) || hasRepeatedCharacters(cpf)) return false;
  const first = checkDigit(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${first}${second}`);
}

export function isValidCnpj(value: string) {
  const cnpj = stripDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || hasRepeatedCharacters(cnpj)) return false;
  const first = checkDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function applyMask(characters: string, mask: string) {
  let result = "";
  let index = 0;
  for (const slot of mask) {
    if (index >= characters.length) break;
    if (slot === "#") result += characters[index++];
    else result += slot;
  }
  return result;
}

/** Tipo provável enquanto o usuário digita: só números até 11 posições é CPF. */
export function guessDocumentKind(value: string | null | undefined): DocumentKind | null {
  const characters = stripDocument(value ?? "");
  if (!characters) return null;
  return characters.length <= 11 && /^\d+$/.test(characters) ? "cpf" : "cnpj";
}

/** Aplica a pontuação enquanto o usuário digita. Até 11 dígitos usa a máscara de CPF. */
export function formatDocumentInput(value: string) {
  const characters = stripDocument(value).slice(0, 14);
  const looksLikeCpf = characters.length <= 11 && /^\d*$/.test(characters);
  return looksLikeCpf
    ? applyMask(characters, "###.###.###-##")
    : applyMask(characters, "##.###.###/####-##");
}

export function validateDocument(value: string | null | undefined): DocumentValidation {
  const characters = stripDocument(value ?? "");
  if (!characters) return { valid: true, kind: null, formatted: null };

  if (characters.length === 11) {
    return isValidCpf(characters)
      ? { valid: true, kind: "cpf", formatted: applyMask(characters, "###.###.###-##") }
      : { valid: false, message: "CPF inválido. Confira os números digitados." };
  }
  if (characters.length === 14) {
    return isValidCnpj(characters)
      ? { valid: true, kind: "cnpj", formatted: applyMask(characters, "##.###.###/####-##") }
      : { valid: false, message: "CNPJ inválido. Confira os caracteres digitados." };
  }
  return { valid: false, message: "Informe um CPF com 11 dígitos ou um CNPJ com 14 caracteres." };
}
