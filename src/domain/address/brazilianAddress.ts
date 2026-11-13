export const BRAZILIAN_STATES = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"] as const;

export const POSTAL_CODE_MAX_LENGTH = 9;

/** Põe a máscara do CEP enquanto o usuário digita: 78575000 → 78575-000. */
export function formatPostalCodeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidPostalCode(value: string) {
  return /^\d{5}-\d{3}$/.test(value);
}
