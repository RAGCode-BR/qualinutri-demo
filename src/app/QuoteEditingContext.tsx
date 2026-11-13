import { createContext, useContext } from "react";
import type { QuoteCustomerSnapshot } from "../types/customer";

export type QuoteEditingContextValue = {
  /** Orçamento que a Calculadora deve abrir para edição. */
  pendingQuoteId: string | null;
  /** Leva o usuário à Calculadora com o orçamento carregado. */
  openQuoteForEditing: (quoteId: string) => void;
  /** Chamado pela Calculadora depois de carregar o orçamento. */
  clearPendingQuote: () => void;
  /** Cliente que a Calculadora deve já trazer escolhido num pedido novo. */
  pendingCustomer: QuoteCustomerSnapshot | null;
  /** Leva o usuário à Calculadora com o cliente escolhido (ex.: a partir de uma visita). */
  openCalculatorForCustomer: (customer: QuoteCustomerSnapshot) => void;
  clearPendingCustomer: () => void;
};

export const QuoteEditingContext = createContext<QuoteEditingContextValue | null>(null);

export function useQuoteEditing() {
  const value = useContext(QuoteEditingContext);
  if (!value) throw new Error("useQuoteEditing deve ser usado dentro de QuoteEditingContext.");
  return value;
}
