import type { JuaraFreightRate, RegionalFreightRate } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import { logCatalogChange, normalizeName, requireAdmin } from "./common";

export type FreightCatalog = {
  juaraFreightRates: JuaraFreightRate[];
  regionalFreightRates: RegionalFreightRate[];
  handlingRatePerTon: number;
  freightTableIds: { juara: string; regional: string };
  handlingRateTableId: string;
};

export type FreightTableCode = "juara" | "regional";
export type JuaraZoneInput = { bag25: number; bag30: number; bag40: number; closedPerTon: number };
export type RegionalZoneInput = { fractionalPerTon: number | null; closedPerTon: number };

export class FreightServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreightServiceError";
  }
}

export async function loadFreightCatalog(_client?: unknown): Promise<FreightCatalog> {
  return simulateLatency(() => {
    const { catalog } = db.read();
    return clone({
      juaraFreightRates: catalog.juaraFreightRates,
      regionalFreightRates: catalog.regionalFreightRates,
      handlingRatePerTon: catalog.handlingRatePerTon,
      freightTableIds: catalog.freightTableIds ?? { juara: "", regional: "" },
      handlingRateTableId: catalog.handlingRateTableId ?? "",
    });
  });
}

/** Cria (sem id) ou edita uma faixa da tabela Juara ou uma cidade da Regional. */
export async function saveFreightZone(table: FreightTableCode, zoneId: string | null, label: string, rates: JuaraZoneInput | RegionalZoneInput): Promise<void> {
  requireAdmin(FreightServiceError);
  const name = label.trim();
  if (!name) throw new FreightServiceError("Informe o nome da faixa ou cidade.");
  const values = Object.values(rates).filter((value): value is number => value !== null);
  if (values.some((value) => !(value >= 0))) throw new FreightServiceError("Os valores do frete não podem ser negativos.");
  const { catalog } = db.read();
  const names = table === "juara" ? catalog.juaraFreightRates.map((rate) => ({ id: rate.id, name: rate.distance })) : catalog.regionalFreightRates.map((rate) => ({ id: rate.id, name: rate.location }));
  if (names.some((item) => item.id !== zoneId && normalizeName(item.name) === normalizeName(name))) {
    throw new FreightServiceError("Já existe uma faixa com esse nome nesta tabela.");
  }
  await simulateLatency(null);
  db.write(({ catalog: current }) => {
    if (table === "juara" && "bag25" in rates) {
      const rate: JuaraFreightRate = { id: zoneId ?? newId(), distance: name, ...rates };
      current.juaraFreightRates = zoneId ? current.juaraFreightRates.map((item) => item.id === zoneId ? rate : item) : [...current.juaraFreightRates, rate];
    } else if (table === "regional" && "fractionalPerTon" in rates) {
      const rate: RegionalFreightRate = { id: zoneId ?? newId(), location: name, ...rates };
      current.regionalFreightRates = zoneId ? current.regionalFreightRates.map((item) => item.id === zoneId ? rate : item) : [...current.regionalFreightRates, rate];
    }
  });
  logCatalogChange(`Frete ${table === "juara" ? "Juara" : "Regional"}: "${name}" ${zoneId ? "alterado" : "criado"}`);
}

export async function deactivateFreightZone(zoneId: string): Promise<void> {
  requireAdmin(FreightServiceError);
  await simulateLatency(null);
  let name = "";
  db.write(({ catalog }) => {
    name = catalog.juaraFreightRates.find((rate) => rate.id === zoneId)?.distance ?? catalog.regionalFreightRates.find((rate) => rate.id === zoneId)?.location ?? "";
    catalog.juaraFreightRates = catalog.juaraFreightRates.filter((rate) => rate.id !== zoneId);
    catalog.regionalFreightRates = catalog.regionalFreightRates.filter((rate) => rate.id !== zoneId);
  });
  if (!name) throw new FreightServiceError("Não foi possível excluir.");
  logCatalogChange(`Frete: "${name}" excluído`);
}

export async function saveHandlingRate(amountPerTon: number): Promise<void> {
  requireAdmin(FreightServiceError);
  if (!(amountPerTon >= 0)) throw new FreightServiceError("Informe um valor válido para a chapa.");
  await simulateLatency(null);
  db.write(({ catalog }) => { catalog.handlingRatePerTon = amountPerTon; });
  logCatalogChange(`Chapa alterada para R$ ${amountPerTon.toLocaleString("pt-BR")}/t`);
}
