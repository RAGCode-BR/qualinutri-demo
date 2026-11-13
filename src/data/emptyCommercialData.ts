import type { CommercialData } from "../types/commercial";

/** Estado inicial sem informações comerciais embarcadas no JavaScript público. */
export const emptyCommercialData: CommercialData = {
  paymentTermLabels: [],
  paymentTerms: [],
  discountLines: [],
  rationProducts: [],
  mineralProducts: [],
  products: [],
  juaraFreightRates: [],
  regionalFreightRates: [],
  handlingRatePerTon: 0,
  policyVersion: "",
  policySections: [],
};
