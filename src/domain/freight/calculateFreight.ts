export type LoadType = "fractional" | "closed";

export type NoFreight = { table: "none" };

export type JuaraFreight = {
  table: "juara";
  loadType: LoadType;
  rates: { bag25: number; bag30: number; bag40: number; closedPerTon: number };
};

export type RegionalFreight = {
  table: "regional";
  loadType: LoadType;
  rates: { fractionalPerTon: number | null; closedPerTon: number | null };
};

export type FreightSelection = NoFreight | JuaraFreight | RegionalFreight;

export type FreightPerBagResult = { value: number; note: string };

export function calculateFreightPerBag(
  freight: FreightSelection,
  weightKg: number,
): FreightPerBagResult {
  if (freight.table === "none") return { value: 0, note: "" };

  if (freight.table === "juara") {
    if (freight.loadType === "fractional") {
      if (weightKg === 25) return { value: freight.rates.bag25, note: "" };
      if (weightKg === 30) return { value: freight.rates.bag30, note: "" };
      if (weightKg === 40) return { value: freight.rates.bag40, note: "" };
      return {
        value: (freight.rates.closedPerTon * weightKg) / 1000,
        note: "Peso fora de 25/30/40 kg: convertido pela carga fechada.",
      };
    }
    return { value: (freight.rates.closedPerTon * weightKg) / 1000, note: "" };
  }

  const ratePerTon = freight.loadType === "fractional"
    ? freight.rates.fractionalPerTon
    : freight.rates.closedPerTon;

  if (ratePerTon === null) {
    return { value: 0, note: "Esta cidade só tem carga fechada (mínimo de tonelagem)." };
  }

  return { value: (ratePerTon * weightKg) / 1000, note: "" };
}

export function calculateHandlingPerBag(
  enabled: boolean,
  ratePerTon: number,
  weightKg: number,
): number {
  return enabled ? (ratePerTon * weightKg) / 1000 : 0;
}
