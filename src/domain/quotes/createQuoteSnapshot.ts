import type { ReturnTypeOfCurrentOrder } from "./quoteCalculation.types";
import type { CommercialData, Product } from "../../types/commercial";
import type { QuoteSnapshot } from "../../types/quote";
import type { QuoteCustomerSnapshot } from "../../types/customer";
import { hasPaymentModeChoice, type PaymentMode } from "../payment/paymentTerm";

export type QuoteSourceItem = {
  name: string;
  productIndex: string;
  paymentTermIndex: string;
  tableUnitPrice: number;
  quantity: number;
  weightKg: number;
  lineDiscountPercentage: number;
  discountLineIndex?: string;
  /** Quando presente, prevalece sobre a busca pela posição no catálogo. */
  categoryName?: string | null;
};

export type QuoteFreightContext = {
  tableName: string | null;
  zone: string | null;
  loadType: "fractional" | "closed" | null;
};

export type CreateQuoteSnapshotInput = {
  items: QuoteSourceItem[];
  calculation: ReturnTypeOfCurrentOrder;
  products: Product[];
  paymentTermLabels: readonly string[];
  anticipatedPayment: boolean;
  handlingRatePerTon: number;
  freight: QuoteFreightContext;
  customer?: QuoteCustomerSnapshot | null;
  catalog?: CommercialData;
  notes?: string | null;
  /** Só é gravada se algum item tiver prazo com as duas formas. */
  paymentMode?: PaymentMode | null;
};

export function createQuoteSnapshot(input: CreateQuoteSnapshotInput): QuoteSnapshot {
  const anticipatedDiscountPercentage = input.anticipatedPayment ? 1.5 : 0;

  return {
    status: "draft",
    calculationVersion: "legacy-html-v1",
    customerId: input.customer?.id ?? null,
    customerName: input.customer?.name ?? null,
    customerDocument: input.customer?.document ?? null,
    priceTableId: input.catalog?.priceTableId ?? null,
    discountTableId: input.catalog?.discountTableId ?? null,
    freightTableId: input.freight.tableName === "Juara" ? input.catalog?.freightTableIds?.juara ?? null
      : input.freight.tableName === "Regional" ? input.catalog?.freightTableIds?.regional ?? null : null,
    handlingRateTableId: input.catalog?.handlingRateTableId ?? null,
    policyVersionId: input.catalog?.policyVersionId ?? null,
    anticipatedPayment: input.anticipatedPayment,
    anticipatedDiscountPercentage,
    freightTableName: input.freight.tableName,
    freightZone: input.freight.zone,
    loadType: input.freight.loadType,
    handlingRatePerTon: input.handlingRatePerTon,
    productSubtotal: input.calculation.productSubtotal,
    freightTotal: input.calculation.freightTotal,
    handlingTotal: input.calculation.handlingTotal,
    economyTotal: input.calculation.economyTotal,
    grandTotal: input.calculation.grandTotal,
    notes: input.notes?.trim() || null,
    paymentMode: input.paymentMode && input.items.some((item) => item.paymentTermIndex !== "" && hasPaymentModeChoice(input.paymentTermLabels[Number(item.paymentTermIndex)]))
      ? input.paymentMode : null,
    items: input.items.map((item, index) => {
      const calculated = input.calculation.items[index];
      const product = item.productIndex === "" ? undefined : input.products[Number(item.productIndex)];
      const paymentTerm = item.paymentTermIndex === ""
        ? null
        : input.paymentTermLabels[Number(item.paymentTermIndex)] ?? null;
      const discountLine = !item.discountLineIndex
        ? undefined : input.catalog?.discountLines[Number(item.discountLineIndex)];

      return {
        displayOrder: index,
        productId: product?.id ?? null,
        paymentTermId: item.paymentTermIndex === "" ? null : input.catalog?.paymentTermIds?.[Number(item.paymentTermIndex)] ?? null,
        discountRuleId: discountLine?.id ?? null,
        productName: item.name,
        categoryName: item.categoryName !== undefined ? item.categoryName : product?.group ?? null,
        weightKg: item.weightKg,
        paymentTerm,
        tableUnitPrice: item.tableUnitPrice,
        quantity: item.quantity,
        lineDiscountPercentage: item.lineDiscountPercentage,
        anticipatedDiscountPercentage,
        totalDiscountPercentage: calculated.totalDiscountPercentage,
        finalUnitPrice: calculated.finalUnitPrice,
        economyPerUnit: calculated.economyPerUnit,
        freightPerUnit: calculated.freightPerBag,
        handlingPerUnit: calculated.handlingPerBag,
        productSubtotal: calculated.productSubtotal,
        freightSubtotal: calculated.freightTotal,
        handlingSubtotal: calculated.handlingTotal,
        total: calculated.productSubtotal + calculated.freightTotal + calculated.handlingTotal,
      };
    }),
  };
}
