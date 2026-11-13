export type PaymentTerm = {
  id: string;
  label: string;
  condition: string;
  notes: string;
};

export type DiscountLine = {
  /** Presente apenas quando a tabela vem do Supabase. */
  id?: string;
  name: string;
  percentage: number | null;
};

export type Product = {
  /** Presente apenas quando o catálogo vem do Supabase. */
  id?: string;
  group: string;
  name: string;
  weightKg: number;
  prices: readonly number[];
};

export type JuaraFreightRate = {
  /** Presente apenas quando a tabela vem do Supabase. */
  id?: string;
  distance: string;
  bag25: number;
  bag30: number;
  bag40: number;
  closedPerTon: number;
};

export type RegionalFreightRate = {
  /** Presente apenas quando a tabela vem do Supabase. */
  id?: string;
  location: string;
  fractionalPerTon: number | null;
  closedPerTon: number;
};

export type PolicySection = {
  title: string;
  content: string;
  pending?: boolean;
};

export type CommercialData = {
  paymentTermLabels: readonly string[];
  /** Ids dos prazos na mesma ordem de paymentTermLabels; ausente nos dados locais. */
  paymentTermIds?: readonly string[];
  paymentTerms: PaymentTerm[];
  discountLines: DiscountLine[];
  rationProducts: Product[];
  mineralProducts: Product[];
  products: Product[];
  /** Início de vigência da tabela de preços ativa (AAAA-MM-DD); ausente nos dados locais. */
  priceTableFrom?: string;
  priceTableId?: string;
  discountTableId?: string;
  freightTableIds?: { juara: string; regional: string };
  handlingRateTableId?: string;
  policyVersionId?: string;
  juaraFreightRates: JuaraFreightRate[];
  regionalFreightRates: RegionalFreightRate[];
  handlingRatePerTon: number;
  policyVersion: string;
  policySections: PolicySection[];
};
