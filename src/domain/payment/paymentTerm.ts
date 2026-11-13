export type PaymentMode = "installments" | "single";

export const paymentModeLabels: Record<PaymentMode, string> = {
  installments: "Parcelado",
  single: "Direto",
};

type SplitTerm = { installments: string[]; singleDays: string };

/**
 * Prazos como "30/60/90 ou 60 dd" têm duas formas com o mesmo preço:
 * parcelado (30/60/90) ou direto (pagamento único em 60 dias).
 */
export function splitPaymentTerm(label: string | null | undefined): SplitTerm | null {
  const match = label?.trim().match(/^(\d+(?:\s*\/\s*\d+)+)\s+ou\s+(\d+)\s*dd\.?$/i);
  if (!match) return null;
  return { installments: match[1].split("/").map((days) => days.trim()), singleDays: match[2] };
}

export function hasPaymentModeChoice(label: string | null | undefined) {
  return splitPaymentTerm(label) !== null;
}

/** Prazo do orçamento nas condições do PDF: "Parcelado em 5x: …", "Direto: …" ou o próprio prazo ("À vista"). */
export function paymentTermCondition(label: string, mode: PaymentMode | null | undefined) {
  const text = describePaymentTerm(label, mode).replace(/^Prazo /, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Texto do prazo no PDF: só a forma combinada, quando o prazo tem as duas. */
export function describePaymentTerm(label: string, mode: PaymentMode | null | undefined) {
  const split = splitPaymentTerm(label);
  if (!split || !mode) return `Prazo ${label}`;
  return mode === "installments"
    ? `Parcelado em ${split.installments.length}x: ${split.installments.join("/")} dias`
    : `Direto: pagamento único em ${split.singleDays} dias`;
}
