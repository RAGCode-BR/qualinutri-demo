import type { CurrentOrderItem, LoadType } from "../../domain";

export type OrderItem = CurrentOrderItem & {
  id: number;
  productIndex: string;
  /** Prazo do orçamento no momento em que o item foi gravado (é o mesmo para todos). */
  paymentTermIndex: string;
  /**
   * Preço veio da tabela do catálogo (não foi digitado). Ao trocar o prazo do
   * orçamento, só esses itens recebem o preço da nova coluna.
   */
  priceFromTable?: boolean;
  discountLineIndex: string;
  customDiscountPercentage: number;
  /** Categoria do produto no momento em que o item foi adicionado. */
  categoryName?: string | null;
};

export type ItemFormState = {
  productIndex: string;
  paymentTermIndex: string;
  tableUnitPrice: string;
  discountLineIndex: string;
  customDiscountPercentage: string;
  quantity: string;
  bagWeightKg: string;
};

export type FreightFormState = {
  table: "" | "juara" | "regional";
  rangeIndex: string;
  loadType: LoadType;
};
