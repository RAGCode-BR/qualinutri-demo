import type { NotDoneReason, VisitType } from "../../features/visits/visitModel";
import { getDemoViewer } from "../app/session";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import type { Row } from "../store/types";
import { nowIso } from "./common";

export type Visit = Row<"visits">;
export type CustomerProperty = Row<"customer_properties">;
export type Seller = { id: string; name: string; role: string };

export class VisitServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com a visita.") {
    super(message);
    this.name = "VisitServiceError";
  }
}

const CHANGED_ELSEWHERE = "Esta visita já foi alterada (talvez em outro aparelho). Atualize a agenda e confira.";

function requireSales() {
  const role = getDemoViewer().role;
  if (role !== "administrador" && role !== "comercial") throw new VisitServiceError("Seu perfil não tem acesso às visitas.");
}

/** Comercial vê e altera só as próprias visitas; o administrador vê todas. */
function visible(visit: Visit) {
  const viewer = getDemoViewer();
  return viewer.role === "administrador" || visit.seller_id === viewer.id;
}

function requireOwnSeller(sellerId: string) {
  const viewer = getDemoViewer();
  if (viewer.role !== "administrador" && sellerId !== viewer.id) throw new VisitServiceError("Você só pode registrar as próprias visitas.");
}

function validateLinks(customerId: string, propertyId: string | null, quoteId: string | null) {
  const tables = db.read();
  if (propertyId && !tables.customer_properties.some((property) => property.id === propertyId && property.customer_id === customerId)) {
    throw new VisitServiceError("A propriedade escolhida não é deste cliente.");
  }
  if (quoteId) {
    const quote = tables.quotes.find((item) => item.id === quoteId);
    if (!quote || quote.customer_id !== customerId) throw new VisitServiceError("O orçamento escolhido não é deste cliente.");
    if (quote.status === "cancelled") throw new VisitServiceError("O orçamento escolhido está cancelado.");
  }
}

export async function listVisits(range: { from: string; to: string }, sellerId?: string | null): Promise<Visit[]> {
  requireSales();
  return simulateLatency(() => clone(db.read().visits
    .filter(visible)
    .filter((visit) => !sellerId || visit.seller_id === sellerId)
    .filter((visit) => {
      const date = visit.visited_date ?? visit.scheduled_date;
      return date !== null && date >= range.from && date <= range.to;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))));
}

export async function listCustomerVisits(customerId: string): Promise<Visit[]> {
  return simulateLatency(() => {
    const date = (visit: Visit) => visit.visited_date ?? visit.scheduled_date ?? "";
    return clone(db.read().visits.filter((visit) => visit.customer_id === customerId && visible(visit)).sort((a, b) => date(b).localeCompare(date(a))).slice(0, 100));
  });
}

export async function listSellers(): Promise<Seller[]> {
  requireSales();
  return simulateLatency(() => db.read().profiles
    .filter((profile) => profile.active && (profile.role === "administrador" || profile.role === "comercial"))
    .map((profile) => ({ id: profile.id, name: profile.displayName || profile.login, role: profile.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
}

export async function scheduleVisit(input: { sellerId: string; customerId: string; propertyId: string | null; date: string; followUpOf?: string | null }) {
  requireSales();
  requireOwnSeller(input.sellerId);
  validateLinks(input.customerId, input.propertyId, null);
  await simulateLatency(null);
  const at = nowIso();
  db.write((tables) => {
    tables.visits.push({
      id: newId(), seller_id: input.sellerId, customer_id: input.customerId, property_id: input.propertyId, scheduled_date: input.date,
      status: "planned", follow_up_of: input.followUpOf ?? null, visited_date: null, developed: null, visit_types: [], quote_id: null,
      next_action: null, not_done_reason: null, not_done_note: null, created_at: at, updated_at: at, created_by: getDemoViewer().id, updated_by: null,
    });
  });
}

function updatePlanned(visitId: string, change: (visit: Visit) => void) {
  let found = false;
  db.write((tables) => {
    const visit = tables.visits.find((item) => item.id === visitId && item.status === "planned" && visible(item));
    if (!visit) return;
    found = true;
    change(visit);
    visit.updated_at = nowIso();
    visit.updated_by = getDemoViewer().id;
  });
  if (!found) throw new VisitServiceError(CHANGED_ELSEWHERE);
}

export async function rescheduleVisit(visitId: string, date: string) {
  await simulateLatency(null);
  updatePlanned(visitId, (visit) => { visit.scheduled_date = date; });
}

export async function deletePlannedVisit(visitId: string) {
  await simulateLatency(null);
  const exists = db.read().visits.some((visit) => visit.id === visitId && visit.status === "planned" && visible(visit));
  if (!exists) throw new VisitServiceError(CHANGED_ELSEWHERE);
  db.write((tables) => { tables.visits = tables.visits.filter((visit) => visit.id !== visitId); });
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

export async function registerVisit(visitId: string | null, report: VisitReport): Promise<string> {
  requireSales();
  requireOwnSeller(report.sellerId);
  const quoteId = report.types.includes("closing") ? report.quoteId : null;
  validateLinks(report.customerId, report.propertyId, quoteId);
  if (!report.developed.trim()) throw new VisitServiceError("Conte o que foi feito na visita.");
  if (report.types.length === 0) throw new VisitServiceError("Escolha ao menos um tipo de visita.");
  await simulateLatency(null);
  const values = {
    seller_id: report.sellerId, customer_id: report.customerId, property_id: report.propertyId, status: "completed",
    visited_date: report.visitedDate, developed: report.developed, visit_types: report.types, quote_id: quoteId,
    next_action: report.nextAction, not_done_reason: null, not_done_note: null,
  };
  const at = nowIso();
  let id = visitId;
  db.write((tables) => {
    if (visitId) {
      const visit = tables.visits.find((item) => item.id === visitId && (item.status === "planned" || item.status === "completed") && visible(item));
      if (!visit) { id = null; return; }
      Object.assign(visit, values, { updated_at: at, updated_by: getDemoViewer().id });
      return;
    }
    id = newId();
    tables.visits.push({ id, ...values, scheduled_date: report.visitedDate, follow_up_of: null, created_at: at, updated_at: at, created_by: getDemoViewer().id, updated_by: null });
  });
  if (!id) throw new VisitServiceError(CHANGED_ELSEWHERE);
  return id;
}

export async function markVisitNotDone(visitId: string, reason: NotDoneReason, note: string | null) {
  await simulateLatency(null);
  updatePlanned(visitId, (visit) => {
    visit.status = "not_done";
    visit.not_done_reason = reason;
    visit.not_done_note = note;
  });
}

export async function listProperties(customerId?: string): Promise<CustomerProperty[]> {
  return simulateLatency(() => clone(db.read().customer_properties
    .filter((property) => property.active && (!customerId || property.customer_id === customerId))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))));
}

export async function saveProperty(input: { id?: string; customerId: string; name: string; city: string | null; state: string | null }) {
  requireSales();
  const values = { customer_id: input.customerId, name: input.name.trim(), city: input.city?.trim() || null, state: input.state?.trim().toUpperCase() || null };
  if (!values.name) throw new VisitServiceError("Informe o nome da propriedade.");
  await simulateLatency(null);
  const at = nowIso();
  db.write((tables) => {
    if (input.id) {
      const property = tables.customer_properties.find((item) => item.id === input.id);
      if (property) Object.assign(property, values, { updated_at: at });
      return;
    }
    tables.customer_properties.push({ id: newId(), ...values, notes: null, active: true, created_at: at, updated_at: at, created_by: getDemoViewer().id });
  });
}

export async function deactivateProperty(propertyId: string) {
  requireSales();
  await simulateLatency(null);
  db.write((tables) => {
    const property = tables.customer_properties.find((item) => item.id === propertyId);
    if (property) property.active = false;
  });
}
