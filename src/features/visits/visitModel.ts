import { toIsoDate } from "../reports/reportPeriod";

export type VisitStatus = "planned" | "completed" | "not_done";
export type VisitType = "relationship" | "prospecting" | "closing" | "technical";
export type NotDoneReason = "customer_absent" | "customer_rescheduled" | "customer_emergency" | "seller_emergency" | "other";
export type AgendaView = "day" | "week" | "month";

export const visitTypeLabels: Record<VisitType, string> = {
  relationship: "Relacionamento",
  prospecting: "Prospecção",
  closing: "Fechamento",
  // Fora de uso: aparece só em visitas antigas, não pode mais ser escolhido.
  technical: "Assistência técnica",
};

/** Tipos que podem ser escolhidos ao registrar uma visita. */
export const selectableVisitTypes: VisitType[] = ["relationship", "prospecting", "closing"];

export const visitStatusLabels: Record<VisitStatus, string> = {
  planned: "Agendada",
  completed: "Realizada",
  not_done: "Não realizada",
};

export const notDoneReasonLabels: Record<NotDoneReason, string> = {
  customer_absent: "Cliente não estava",
  customer_rescheduled: "Cliente remarcou",
  customer_emergency: "Emergência do cliente",
  seller_emergency: "Emergência do vendedor",
  other: "Outro",
};

export const agendaViewLabels: Record<AgendaView, string> = { day: "Dia", week: "Semana", month: "Mês" };

/** Data local (AAAA-MM-DD) a partir de um texto de data, sem passar por UTC. */
export function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Intervalo inclusivo da agenda. A semana vai de segunda a domingo. */
export function agendaRange(view: AgendaView, anchor: string) {
  const date = parseIsoDate(anchor);
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const monday = addDays(date, -((date.getDay() + 6) % 7));
    return { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) };
  }
  return {
    from: toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

/** Avança ou volta um período inteiro da agenda. */
export function shiftAnchor(view: AgendaView, anchor: string, direction: 1 | -1) {
  const date = parseIsoDate(anchor);
  if (view === "day") return toIsoDate(addDays(date, direction));
  if (view === "week") return toIsoDate(addDays(date, 7 * direction));
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + direction, 1));
}

export function formatAgendaTitle(view: AgendaView, anchor: string) {
  const range = agendaRange(view, anchor);
  const format = (value: string, options: Intl.DateTimeFormatOptions) => parseIsoDate(value).toLocaleDateString("pt-BR", options);
  if (view === "day") return format(anchor, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (view === "week") return `${format(range.from, { day: "2-digit", month: "2-digit" })} a ${format(range.to, { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const title = format(anchor, { month: "long", year: "numeric" });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function formatDayHeading(value: string, today: string) {
  const label = parseIsoDate(value).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return value === today ? `Hoje, ${capitalized.toLowerCase()}` : capitalized;
}
