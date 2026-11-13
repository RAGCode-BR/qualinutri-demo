/**
 * Telefone brasileiro com DDD: fixo com 8 dígitos (começa de 2 a 5) ou
 * celular com 9 dígitos (começa com 9).
 */

export type PhoneValidation =
  | { valid: true; kind: "landline" | "mobile" | null; formatted: string | null }
  | { valid: false; message: string };

/** "(66) 99912-3456" */
export const PHONE_MAX_LENGTH = 15;

export function stripPhone(value: string) {
  return value.replace(/\D/g, "");
}

function format(digits: string) {
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (digits.length <= 2) return digits.length ? `(${ddd}` : "";
  const splitAt = number.length > 8 ? 5 : 4;
  const head = number.slice(0, splitAt);
  const tail = number.slice(splitAt);
  return `(${ddd}) ${head}${tail ? `-${tail}` : ""}`;
}

/** Aplica a pontuação enquanto o usuário digita. */
export function formatPhoneInput(value: string) {
  return format(stripPhone(value).slice(0, 11));
}

export function validatePhone(value: string | null | undefined): PhoneValidation {
  const digits = stripPhone(value ?? "");
  if (!digits) return { valid: true, kind: null, formatted: null };

  if (!/^[1-9]{2}/.test(digits)) {
    return { valid: false, message: "DDD inválido. Informe os 2 dígitos do DDD antes do número." };
  }
  if (digits.length === 10 && /^[2-5]$/.test(digits[2])) {
    return { valid: true, kind: "landline", formatted: format(digits) };
  }
  if (digits.length === 11 && digits[2] === "9") {
    return { valid: true, kind: "mobile", formatted: format(digits) };
  }
  return { valid: false, message: "Telefone inválido. Fixo: DDD + 8 dígitos. Celular: DDD + 9 dígitos, começando com 9." };
}
