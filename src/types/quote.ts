export type QuoteStatus = "draft" | "issued" | "approved" | "cancelled" | "expired";

export type QuoteSnapshotItem = {
  displayOrder: number;
  productId: string | null;
  paymentTermId: string | null;
  discountRuleId: string | null;
  productName: string;
  categoryName: string | null;
  weightKg: number;
  paymentTerm: string | null;
  tableUnitPrice: number;
  quantity: number;
  lineDiscountPercentage: number;
  anticipatedDiscountPercentage: number;
  totalDiscountPercentage: number;
  finalUnitPrice: number;
  economyPerUnit: number;
  freightPerUnit: number;
  handlingPerUnit: number;
  productSubtotal: number;
  freightSubtotal: number;
  handlingSubtotal: number;
  total: number;
};

export type QuoteSnapshot = {
  status: QuoteStatus;
  calculationVersion: string;
  customerId: string | null;
  customerName: string | null;
  customerDocument: string | null;
  priceTableId: string | null;
  discountTableId: string | null;
  freightTableId: string | null;
  handlingRateTableId: string | null;
  policyVersionId: string | null;
  anticipatedPayment: boolean;
  anticipatedDiscountPercentage: number;
  freightTableName: string | null;
  freightZone: string | null;
  loadType: "fractional" | "closed" | null;
  handlingRatePerTon: number;
  productSubtotal: number;
  freightTotal: number;
  handlingTotal: number;
  economyTotal: number;
  grandTotal: number;
  /** Observações do orçamento; saem no PDF. */
  notes: string | null;
  /** Forma do prazo com duas opções ("30/60 ou 45 dd"): parcelado ou direto. */
  paymentMode: "installments" | "single" | null;
  items: QuoteSnapshotItem[];
};
