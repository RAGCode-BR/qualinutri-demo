import { supabase } from "../lib/supabase";
import type { Database } from "../types/database.types";
import type { NotDoneReason, VisitType } from "../features/visits/visitModel";

export type Visit = Database["public"]["Tables"]["visits"]["Row"];
export type CustomerProperty = Database["public"]["Tables"]["customer_properties"]["Row"];
export type Seller = { id: string; name: string; role: string };

export class VisitServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com a visita.") {
    super(message);
    this.name = "VisitServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new VisitServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

/** Erros de regra do banco (22023, 42501) já vêm com mensagem para o usuário. */
function toVisitError(error: { code?: string; message?: string } | null, fallback?: string) {
  const readable = (error?.code === "22023" || error?.code === "42501") && error.message;
  return new VisitServiceError(readable || fallback);
}

/** Visitas agendadas ou registradas no período (datas inclusivas). */
export async function listVisits(range: { from: string; to: string }, sellerId?: string | null): Promise<Visit[]> {
  let query = requireClient()
    .from("visits")
    .select("*")
    .or(`and(visited_date.gte.${range.from},visited_date.lte.${range.to}),and(visited_date.is.null,scheduled_date.gte.${range.from},scheduled_date.lte.${range.to})`)
    .order("created_at");
  if (sellerId) query = query.eq("seller_id", sellerId);
  const { data, error } = await query;
  if (error || !data) throw toVisitError(error, "Não foi possível carregar a agenda.");
  return data;
}

export async function listCustomerVisits(customerId: string): Promise<Visit[]> {
  const { data, error } = await requireClient()
    .from("visits")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) throw toVisitError(error, "Não foi possível carregar as visitas do cliente.");
  const date = (visit: Visit) => visit.visited_date ?? visit.scheduled_date ?? "";
  return [...data].sort((a, b) => date(b).localeCompare(date(a)));
}

export async function listSellers(): Promise<Seller[]> {
  const { data, error } = await requireClient().rpc("list_sellers");
  if (error || !data) throw toVisitError(error, "Não foi possível carregar os vendedores.");
  return data;
}

export async function scheduleVisit(input: { sellerId: string; customerId: string; propertyId: string | null; date: string; followUpOf?: string | null }) {
  const { error } = await requireClient().from("visits").insert({
    seller_id: input.sellerId,
    customer_id: input.customerId,
    property_id: input.propertyId,
    scheduled_date: input.date,
    status: "planned",
    follow_up_of: input.followUpOf ?? null,
  });
  if (error) throw toVisitError(error, "Não foi possível agendar a visita.");
}

const CHANGED_ELSEWHERE = "Esta visita já foi alterada (talvez em outro aparelho). Atualize a agenda e confira.";

export async function rescheduleVisit(visitId: string, date: string) {
  const { data, error } = await requireClient().from("visits").update({ scheduled_date: date }).eq("id", visitId).eq("status", "planned").select("id");
  if (error) throw toVisitError(error, "Não foi possível reagendar a visita.");
  if (!data?.length) throw new VisitServiceError(CHANGED_ELSEWHERE);
}

export async function deletePlannedVisit(visitId: string) {
  const { data, error } = await requireClient().from("visits").delete().eq("id", visitId).eq("status", "planned").select("id");
  if (error) throw toVisitError(error, "Não foi possível excluir a visita.");
  if (!data?.length) throw new VisitServiceError(CHANGED_ELSEWHERE);
}

export type VisitReport = {
  sellerId: string;
  customerId: string;
  propertyId: string | null;
  visitedDate: string;
  developed: string;
  types: VisitType[];
  quoteId: string | null;
  nextAction: string | null;
};

/** Registra a visita: completa uma agendada (visitId) ou cria uma já realizada. */
export async function registerVisit(visitId: string | null, report: VisitReport): Promise<string> {
  const values = {
    seller_id: report.sellerId,
    customer_id: report.customerId,
    property_id: report.propertyId,
    status: "completed",
    visited_date: report.visitedDate,
    developed: report.developed,
    visit_types: report.types,
    quote_id: report.types.includes("closing") ? report.quoteId : null,
    next_action: report.nextAction,
    not_done_reason: null,
    not_done_note: null,
  };
  const client = requireClient();
  const { data, error } = visitId
    ? await client.from("visits").update(values).eq("id", visitId).in("status", ["planned", "completed"]).select("id").maybeSingle()
    : await client.from("visits").insert({ ...values, scheduled_date: report.visitedDate }).select("id").single();
  if (error) throw toVisitError(error, "Não foi possível registrar a visita.");
  if (!data) throw new VisitServiceError(CHANGED_ELSEWHERE);
  return data.id;
}

export async function markVisitNotDone(visitId: string, reason: NotDoneReason, note: string | null) {
  const { data, error } = await requireClient()
    .from("visits")
    .update({ status: "not_done", not_done_reason: reason, not_done_note: note })
    .eq("id", visitId)
    .eq("status", "planned")
    .select("id");
  if (error) throw toVisitError(error, "Não foi possível marcar a visita como não realizada.");
  if (!data?.length) throw new VisitServiceError(CHANGED_ELSEWHERE);
}

export async function listProperties(customerId?: string): Promise<CustomerProperty[]> {
  let query = requireClient().from("customer_properties").select("*").eq("active", true).order("name");
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error || !data) throw toVisitError(error, "Não foi possível carregar as propriedades.");
  return data;
}

export async function saveProperty(input: { id?: string; customerId: string; name: string; city: string | null; state: string | null }) {
  const values = {
    customer_id: input.customerId,
    name: input.name.trim(),
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase() || null,
  };
  const client = requireClient();
  const { error } = input.id
    ? await client.from("customer_properties").update(values).eq("id", input.id)
    : await client.from("customer_properties").insert(values);
  if (error) throw toVisitError(error, "Não foi possível salvar a propriedade.");
}

export async function deactivateProperty(propertyId: string) {
  const { error } = await requireClient().from("customer_properties").update({ active: false }).eq("id", propertyId);
  if (error) throw toVisitError(error, "Não foi possível excluir a propriedade.");
}
