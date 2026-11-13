export type WeighedItem = { quantity: number; weightKg: number };

/**
 * Peso da carga do pedido: soma de sacas × peso da saca de cada item. É a mesma
 * conta da Calculadora (calculateCurrentOrder), usada também no PDF.
 */
export function calculateOrderWeight(items: readonly WeighedItem[]) {
  return items.reduce(
    (total, item) => ({ bags: total.bags + item.quantity, weightKg: total.weightKg + item.quantity * item.weightKg }),
    { bags: 0, weightKg: 0 },
  );
}

/** Pesos de saca disponíveis para item com preço manual. */
export const BAG_WEIGHTS_KG = [25, 30, 40] as const;
