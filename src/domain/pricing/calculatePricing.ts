export function calculateTotalDiscount(
  lineDiscountPercentage: number,
  anticipatedPayment: boolean,
): number {
  const anticipatedDiscount = anticipatedPayment ? 1.5 : 0;
  return lineDiscountPercentage + anticipatedDiscount;
}

export function calculateFinalUnitPrice(
  tableUnitPrice: number,
  totalDiscountPercentage: number,
): number {
  return tableUnitPrice * (1 - totalDiscountPercentage / 100);
}

export function calculateUnitEconomy(
  tableUnitPrice: number,
  finalUnitPrice: number,
): number {
  return tableUnitPrice - finalUnitPrice;
}

export function calculateItemSubtotal(
  finalUnitPrice: number,
  quantity: number,
): number {
  return finalUnitPrice * quantity;
}
