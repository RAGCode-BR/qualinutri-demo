import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { JuaraFreightRate, RegionalFreightRate } from "../types/commercial";
import type { Database } from "../types/database.types";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export type FreightCatalog = {
  juaraFreightRates: JuaraFreightRate[];
  regionalFreightRates: RegionalFreightRate[];
  handlingRatePerTon: number;
  freightTableIds: { juara: string; regional: string };
  handlingRateTableId: string;
};

export async function loadFreightCatalog(client: SupabaseClient<Database>): Promise<FreightCatalog> {
  const [tablesResult, handlingResult] = await Promise.all([
    client.from("freight_tables").select("id,code").eq("status", "active"),
    client.from("handling_rate_tables").select("id,amount_per_ton").eq("status", "active").eq("code", "handling").limit(1).maybeSingle(),
  ]);
  const tables = ensureData(tablesResult.data, tablesResult.error);
  const handling = ensureData(handlingResult.data, handlingResult.error);
  const juaraTable = tables.find((table) => table.code === "juara");
  const regionalTable = tables.find((table) => table.code === "regional");
  if (!juaraTable || !regionalTable || !handling) throw new CommercialDataServiceError();

  const zonesResult = await client
    .from("freight_zones")
    .select("id,freight_table_id,label,display_order")
    .in("freight_table_id", [juaraTable.id, regionalTable.id])
    .eq("active", true)
    .order("display_order");
  const zones = ensureData(zonesResult.data, zonesResult.error);
  if (zones.length === 0) throw new CommercialDataServiceError();

  const ratesResult = await client
    .from("freight_rates")
    .select("freight_zone_id,load_type,rate_basis,bag_weight_kg,amount")
    .in("freight_zone_id", zones.map((zone) => zone.id));
  const rates = ensureData(ratesResult.data, ratesResult.error);

  const rateAmount = (zoneId: string, loadType: "fractional" | "closed", basis: "per_bag" | "per_ton", weight?: number) => {
    const rate = rates.find((candidate) =>
      candidate.freight_zone_id === zoneId
      && candidate.load_type === loadType
      && candidate.rate_basis === basis
      && (weight === undefined || Number(candidate.bag_weight_kg) === weight));
    return rate ? Number(rate.amount) : null;
  };

  const juaraFreightRates = zones
    .filter((zone) => zone.freight_table_id === juaraTable.id)
    .flatMap<JuaraFreightRate>((zone) => {
      const bag25 = rateAmount(zone.id, "fractional", "per_bag", 25);
      const bag30 = rateAmount(zone.id, "fractional", "per_bag", 30);
      const bag40 = rateAmount(zone.id, "fractional", "per_bag", 40);
      const closedPerTon = rateAmount(zone.id, "closed", "per_ton");
      // Faixa com valor faltando fica fora da lista, sem derrubar o catálogo.
      if (bag25 === null || bag30 === null || bag40 === null || closedPerTon === null) {
        console.warn(`Faixa de frete ignorada por dados incompletos: ${zone.label}`);
        return [];
      }
      return [{ id: zone.id, distance: zone.label, bag25, bag30, bag40, closedPerTon }];
    });

  const regionalFreightRates = zones
    .filter((zone) => zone.freight_table_id === regionalTable.id)
    .flatMap<RegionalFreightRate>((zone) => {
      const closedPerTon = rateAmount(zone.id, "closed", "per_ton");
      if (closedPerTon === null) {
        console.warn(`Cidade de frete ignorada por dados incompletos: ${zone.label}`);
        return [];
      }
      return [{
        id: zone.id,
        location: zone.label,
        fractionalPerTon: rateAmount(zone.id, "fractional", "per_ton"),
        closedPerTon,
      }];
    });

  return {
    juaraFreightRates,
    regionalFreightRates,
    handlingRatePerTon: Number(handling.amount_per_ton),
    freightTableIds: { juara: juaraTable.id, regional: regionalTable.id },
    handlingRateTableId: handling.id,
  };
}

export type FreightTableCode = "juara" | "regional";

export type JuaraZoneInput = { bag25: number; bag30: number; bag40: number; closedPerTon: number };
export type RegionalZoneInput = { fractionalPerTon: number | null; closedPerTon: number };

export class FreightServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreightServiceError";
  }
}

function requireFreightClient() {
  if (!supabase) throw new FreightServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

/** Erros de validação do banco (22023, 23505) já vêm com mensagem para o usuário. */
function toFreightError(error: { code?: string; message?: string }, fallback: string) {
  const readable = (error.code === "22023" || error.code === "23505") && error.message;
  return new FreightServiceError(readable || fallback);
}

/** Cria (sem id) ou edita uma faixa da tabela Juara ou uma cidade da Regional. */
export async function saveFreightZone(
  table: FreightTableCode,
  zoneId: string | null,
  label: string,
  rates: JuaraZoneInput | RegionalZoneInput,
): Promise<void> {
  const payload = "bag25" in rates
    ? { bag25: rates.bag25, bag30: rates.bag30, bag40: rates.bag40, closed_per_ton: rates.closedPerTon }
    : { fractional_per_ton: rates.fractionalPerTon, closed_per_ton: rates.closedPerTon };
  const { error } = await requireFreightClient().rpc("save_freight_zone", {
    p_table_code: table,
    p_zone_id: zoneId,
    p_label: label,
    p_rates: payload,
  });
  if (error) throw toFreightError(error, "Não foi possível salvar o frete.");
}

export async function deactivateFreightZone(zoneId: string): Promise<void> {
  const { error } = await requireFreightClient().rpc("deactivate_freight_zone", { p_zone_id: zoneId });
  if (error) throw toFreightError(error, "Não foi possível excluir.");
}

export async function saveHandlingRate(amountPerTon: number): Promise<void> {
  const { error } = await requireFreightClient().rpc("save_handling_rate", { p_amount_per_ton: amountPerTon });
  if (error) throw toFreightError(error, "Não foi possível salvar o valor da chapa.");
}
