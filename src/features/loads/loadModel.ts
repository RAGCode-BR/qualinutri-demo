import type { Packing } from "../../domain/loads/summarizeLoad";
import type { LoadStatus, QuoteShipping } from "../../services/loadService";
import { formatNumber } from "../../utils/formatters";

export const loadStatusLabels: Record<LoadStatus, string> = {
  planned: "Planejada",
  loaded: "Carregada",
  shipped: "Expedida",
  cancelled: "Cancelada",
};

/** Reaproveita as cores das situações de orçamento. */
export const loadStatusBadge: Record<LoadStatus, string> = {
  planned: "is-draft",
  loaded: "is-issued",
  shipped: "is-approved",
  cancelled: "is-cancelled",
};

export const packingLabels: Record<Packing, string> = { pallet: "Palete", loose: "Solta" };

/** Entrega mínima por cliente na política de frete. */
export const MIN_DELIVERY_KG = 1000;

export function formatKg(kg: number) {
  return `${formatNumber(Math.round(kg))} kg`;
}

/** ABC1234 vira ABC-1234; a placa Mercosul (ABC1D23) fica como está. */
export function formatPlate(plate: string | null) {
  if (!plate) return "";
  return /^[A-Z]{3}[0-9]{4}$/.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

export function formatDate(value: string | null) {
  if (!value) return null;
  // Datas sem hora (AAAA-MM-DD) não passam por fuso horário.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return new Date(value).toLocaleDateString("pt-BR");
}

export type ShippingState = { label: string; badge: string };

/** Andamento do envio de um orçamento aprovado. */
export function shippingState(shipping: QuoteShipping | undefined): ShippingState | null {
  if (!shipping || shipping.totalBags === 0) return null;
  if (shipping.shippedBags >= shipping.totalBags) return { label: "Expedido", badge: "is-approved" };
  if (shipping.shippedBags > 0) return { label: "Expedição parcial", badge: "is-warning" };
  if (shipping.plannedBags > 0) return { label: "Em carga", badge: "is-issued" };
  return { label: "Aguardando carga", badge: "is-draft" };
}
