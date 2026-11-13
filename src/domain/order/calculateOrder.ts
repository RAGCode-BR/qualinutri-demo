import {
  calculateFreightPerBag,
  calculateHandlingPerBag,
  type FreightSelection,
} from "../freight/calculateFreight";
import {
  calculateFinalUnitPrice,
  calculateItemSubtotal,
  calculateTotalDiscount,
  calculateUnitEconomy,
} from "../pricing/calculatePricing";

export type CurrentOrderItem = {
  name: string;
  tableUnitPrice: number;
  quantity: number;
  weightKg: number;
  lineDiscountPercentage: number;
};

export type CurrentCalculationOptions = {
  anticipatedPayment: boolean;
  freight: FreightSelection;
  handlingEnabled: boolean;
  handlingRatePerTon: number;
};

export function shouldShowAccumulationWarning(
  items: CurrentOrderItem[],
  anticipatedPayment: boolean,
): boolean {
  return anticipatedPayment && items.some((item) => item.lineDiscountPercentage > 0);
}

export function calculateCurrentOrder(
  items: CurrentOrderItem[],
  options: CurrentCalculationOptions,
) {
  let productSubtotal = 0;
  let freightTotal = 0;
  let handlingTotal = 0;
  let economyTotal = 0;
  let totalQuantity = 0;
  let totalWeightKg = 0;
  const notes = new Set<string>();

  const calculatedItems = items.map((item) => {
    const totalDiscountPercentage = calculateTotalDiscount(
      item.lineDiscountPercentage,
      options.anticipatedPayment,
    );
    const finalUnitPrice = calculateFinalUnitPrice(item.tableUnitPrice, totalDiscountPercentage);
    const economyPerUnit = calculateUnitEconomy(item.tableUnitPrice, finalUnitPrice);
    const freightPerBag = calculateFreightPerBag(options.freight, item.weightKg);
    const handlingPerBag = calculateHandlingPerBag(
      options.handlingEnabled,
      options.handlingRatePerTon,
      item.weightKg,
    );
    const itemProductSubtotal = calculateItemSubtotal(finalUnitPrice, item.quantity);
    const itemFreightTotal = freightPerBag.value * item.quantity;
    const itemHandlingTotal = handlingPerBag * item.quantity;

    productSubtotal += itemProductSubtotal;
    freightTotal += itemFreightTotal;
    handlingTotal += itemHandlingTotal;
    economyTotal += economyPerUnit * item.quantity;
    totalQuantity += item.quantity;
    totalWeightKg += item.weightKg * item.quantity;
    if (freightPerBag.note) notes.add(freightPerBag.note);

    return {
      ...item,
      totalDiscountPercentage,
      finalUnitPrice,
      economyPerUnit,
      freightPerBag: freightPerBag.value,
      handlingPerBag,
      productSubtotal: itemProductSubtotal,
      freightTotal: itemFreightTotal,
      handlingTotal: itemHandlingTotal,
    };
  });

  return {
    items: calculatedItems,
    productCount: items.length,
    totalQuantity,
    totalWeightKg,
    productSubtotal,
    freightTotal,
    handlingTotal,
    economyTotal,
    averageHandlingPerBag: totalQuantity > 0 ? handlingTotal / totalQuantity : 0,
    grandTotal: productSubtotal + freightTotal + handlingTotal,
    notes: [...notes],
    showAccumulationWarning: shouldShowAccumulationWarning(items, options.anticipatedPayment),
  };
}
