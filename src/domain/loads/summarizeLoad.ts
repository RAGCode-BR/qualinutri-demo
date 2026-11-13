export type Packing = "pallet" | "loose";

export type LoadLine = {
  /** Pedido (orçamento) do item; paletes não misturam pedidos. */
  quoteId: string;
  weightKg: number;
  quantity: number;
  packing: Packing;
};

export type PalletSettings = {
  palletWeightKg: number | null;
  /** Sacas por palete conforme o peso da saca, ex.: { "25": 56, "40": 35 }. */
  bagsPerPallet: Record<string, number>;
};

export type LoadLevel = "empty" | "ok" | "warning" | "over";

export type LoadSummary = {
  bags: number;
  bagsWeightKg: number;
  pallets: number;
  palletsWeightKg: number;
  totalWeightKg: number;
  capacityKg: number;
  remainingKg: number;
  /** Ocupação do peso, de 0 a 1 (pode passar de 1). */
  fillRatio: number;
  level: LoadLevel;
  /** Pesos de saca paletizados sem "sacas por palete" cadastrado. */
  missingPalletWeights: number[];
};

/** A partir de 90% da capacidade a carga fica em alerta. */
export const WARNING_RATIO = 0.9;

/** Mesma chave do banco (trim_scale): 25 → "25", 12.5 → "12.5". */
export function weightKey(weightKg: number) {
  return String(Number(weightKg));
}

/**
 * Peso e paletes da carga, com a mesma regra da função save_load do banco:
 * paletes contados por pedido e peso de saca (arredondando para cima), e o
 * peso do palete vazio somado ao das sacas.
 */
export function summarizeLoad(lines: readonly LoadLine[], capacityKg: number, settings: PalletSettings): LoadSummary {
  let bags = 0;
  let bagsWeightKg = 0;
  const palletGroups = new Map<string, { weight: number; bags: number }>();

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    bags += line.quantity;
    bagsWeightKg += line.quantity * line.weightKg;
    if (line.packing !== "pallet") continue;
    const key = `${line.quoteId}|${weightKey(line.weightKg)}`;
    const group = palletGroups.get(key) ?? { weight: line.weightKg, bags: 0 };
    group.bags += line.quantity;
    palletGroups.set(key, group);
  }

  let pallets = 0;
  const missing = new Set<number>();
  for (const group of palletGroups.values()) {
    const perPallet = settings.bagsPerPallet[weightKey(group.weight)];
    if (perPallet && perPallet > 0) pallets += Math.ceil(group.bags / perPallet);
    else missing.add(group.weight);
  }

  const palletsWeightKg = pallets * (settings.palletWeightKg ?? 0);
  const totalWeightKg = bagsWeightKg + palletsWeightKg;
  const fillRatio = capacityKg > 0 ? totalWeightKg / capacityKg : 0;
  const level: LoadLevel = totalWeightKg === 0 ? "empty"
    : totalWeightKg > capacityKg ? "over"
      : fillRatio >= WARNING_RATIO ? "warning" : "ok";

  return {
    bags,
    bagsWeightKg,
    pallets,
    palletsWeightKg,
    totalWeightKg,
    capacityKg,
    remainingKg: capacityKg - totalWeightKg,
    fillRatio,
    level,
    missingPalletWeights: [...missing].sort((a, b) => a - b),
  };
}
