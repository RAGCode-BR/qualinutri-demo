import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { listCustomers, type CustomerSummary } from "../../services/customerService";
import { deletePlannedVisit, listProperties, listSellers, listVisits, type CustomerProperty, type Seller, type Visit } from "../../services/visitService";
import { toIsoDate } from "../reports/reportPeriod";
import { NotDoneDialog, RegisterVisitDialog, ScheduleVisitDialog } from "./VisitDialogs";
import { getQuoteNumbers } from "../../services/quoteService";
import { saveVisitDraft, takeVisitDraft, type VisitDraft } from "./visitDraft";
import { useRef } from "react";
import {
  agendaRange,
  agendaViewLabels,
  formatAgendaTitle,
  formatDayHeading,
  notDoneReasonLabels,
  shiftAnchor,
  visitStatusLabels,
  visitTypeLabels,
  type AgendaView,
  type NotDoneReason,
  type VisitStatus,
  type VisitType,
} from "./visitModel";
import { Select } from "../../components/Select";

type DialogState =
  | null
  | { kind: "schedule"; visit?: Visit; customerId?: string }
  | { kind: "register"; visit?: Visit; draft?: VisitDraft }
  | { kind: "notDone"; visit: Visit }
  | { kind: "delete"; visit: Visit };

const statusBadge: Record<VisitStatus, string> = { planned: "is-issued", completed: "is-approved", not_done: "is-cancelled" };

export function VisitsPage() {
  const { profile } = useAuth();
  const { openCalculatorForCustomer } = useQuoteEditing();
  const isAdmin = profile?.role === "administrador";
  const today = toIsoDate(new Date());
  const [view, setView] = useState<AgendaView>("week");
  const [anchor, setAnchor] = useState(today);
  const [sellerFilter, setSellerFilter] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [properties, setProperties] = useState<CustomerProperty[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState(false);
  const [customersError, setCustomersError] = useState("");
  const [quoteNumbers, setQuoteNumbers] = useState<Map<string, number>>(new Map());
  const request = useRef(0);
  const range = agendaRange(view, anchor);

  // Volta de "Criar orçamento": reabre o registro da visita com o que já estava preenchido.
  useEffect(() => {
    const draft = takeVisitDraft();
    if (draft) {
      setMessage("Continue o registro da visita e vincule o orçamento que você acabou de criar.");
      setDialog({ kind: "register", visit: draft.visit, draft });
    }
  }, []);

  useEffect(() => {
    listCustomers(true).then(setCustomers).catch(() => setCustomersError("Não foi possível carregar os clientes. Os nomes podem aparecer como “Cliente”."));
    listSellers().then(setSellers).catch(() => setSellers([]));
  }, []);

  async function reload() {
    // Só a resposta do período mais recente é usada (navegação rápida entre semanas).
    const current = ++request.current;
    setLoading(true);
    try {
      const [rows, propertyRows] = await Promise.all([listVisits(range, isAdmin ? sellerFilter || null : null), listProperties()]);
      if (current !== request.current) return;
      setVisits(rows);
      setProperties(propertyRows);
      setError("");
      const linked = [...new Set(rows.map((visit) => visit.quote_id).filter((id): id is string => Boolean(id)))];
      getQuoteNumbers(linked).then((numbers) => { if (current === request.current) setQuoteNumbers(numbers); });
    } catch (loadError) {
      if (current === request.current) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a agenda.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [range.from, range.to, sellerFilter]);
  // Mensagem da ação anterior não acompanha a troca de período ou vendedor.
  const firstRange = useRef(true);
  useEffect(() => {
    if (firstRange.current) { firstRange.current = false; return; }
    setMessage("");
  }, [range.from, range.to, sellerFilter]);

  const customerById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const sellerById = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller.name])), [sellers]);
  const context = { isAdmin, currentUserId: profile?.id ?? "", sellers };

  const days = useMemo(() => {
    const grouped = new Map<string, Visit[]>();
    for (const visit of visits) {
      const date = visit.visited_date ?? visit.scheduled_date ?? "";
      grouped.set(date, [...(grouped.get(date) ?? []), visit]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visits]);

  const counts = {
    planned: visits.filter((visit) => visit.status === "planned").length,
    completed: visits.filter((visit) => visit.status === "completed").length,
    notDone: visits.filter((visit) => visit.status === "not_done").length,
  };

  function done(text: string) {
    setDialog(null);
    setMessage(text);
    void reload();
  }

  async function confirmDelete(visit: Visit) {
    setDeleting(true);
    try {
      await deletePlannedVisit(visit.id);
      done("Visita agendada excluída.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a visita.");
      setDialog(null);
    } finally {
      setDeleting(false);
    }
  }

  const customerName = (visit: Visit) => customerById.get(visit.customer_id)?.legal_name ?? "Cliente";

  return (
    <>
      {message && <p className="form-message page-notice" role="status">{message}</p>}
      {error && <p className="auth-error page-notice" role="alert">{error}</p>}
      {customersError && <p className="auth-error page-notice" role="alert">{customersError}</p>}

      <div className="agenda-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Período da agenda">
          {(Object.keys(agendaViewLabels) as AgendaView[]).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={view === option} className={view === option ? "is-selected" : undefined} onClick={() => setView(option)}>
              {agendaViewLabels[option]}
            </button>
          ))}
        </div>
        <div className="agenda-nav">
          <button type="button" className="secondary-button compact-secondary" aria-label="Período anterior" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}>‹</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => setAnchor(today)}>Hoje</button>
          <button type="button" className="secondary-button compact-secondary" aria-label="Próximo período" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}>›</button>
          <strong className="agenda-title">{formatAgendaTitle(view, anchor)}</strong>
        </div>
        {isAdmin && (
          <div className="field agenda-seller">
            <label className="sr-only" htmlFor="agendaSeller">Vendedor</label>
            <Select
              id="agendaSeller"
              value={sellerFilter}
              onChange={setSellerFilter}
              options={[{ value: "", label: "Todos os vendedores" }, ...sellers.map((seller) => ({ value: seller.id, label: seller.name }))]}
            />
          </div>
        )}
        <div className="agenda-actions">
          <button type="button" className="secondary-button compact-secondary" onClick={() => { setMessage(""); setDialog({ kind: "register" }); }}>Registrar visita</button>
          <button type="button" className="primary-button compact-button" onClick={() => { setMessage(""); setDialog({ kind: "schedule" }); }}>Agendar visita</button>
        </div>
      </div>

      <p className="report-scope">
        {counts.planned} {counts.planned === 1 ? "agendada" : "agendadas"}, {counts.completed} {counts.completed === 1 ? "realizada" : "realizadas"} e {counts.notDone} não {counts.notDone === 1 ? "realizada" : "realizadas"} no período.
        {!isAdmin && " Você vê apenas as suas visitas."}
      </p>

      <div className={`report-content${loading && visits.length > 0 ? " is-refreshing" : ""}`}>
        {loading && visits.length === 0 ? <p className="muted">Carregando agenda…</p> : days.length === 0 ? (
          <Panel>
            <EmptyState title="Nenhuma visita neste período.">Use “Agendar visita” para planejar ou “Registrar visita” para lançar uma visita já feita.</EmptyState>
          </Panel>
        ) : days.map(([date, dayVisits]) => (
          <section key={date} className="agenda-day" aria-labelledby={`day-${date}`}>
            <h2 className={`agenda-day-title${date === today ? " is-today" : ""}`} id={`day-${date}`}>{formatDayHeading(date, today)}</h2>
            <ul className="agenda-list">
              {dayVisits.map((visit) => {
                const status = visit.status as VisitStatus;
                const property = visit.property_id ? propertyById.get(visit.property_id) : undefined;
                const overdue = status === "planned" && (visit.scheduled_date ?? "") < today;
                return (
                  <li key={visit.id} className={`visit-card is-${status}`}>
                    <div className="visit-card-head">
                      <div>
                        <strong>{customerName(visit)}</strong>
                        <span className="cell-sub">
                          {[property?.name, isAdmin ? sellerById.get(visit.seller_id) : null].filter(Boolean).join(" · ") || "Sem propriedade"}
                        </span>
                      </div>
                      <span className={`status-badge ${overdue ? "is-warning" : statusBadge[status]}`}>{overdue ? "Atrasada" : visitStatusLabels[status]}</span>
                    </div>
                    {status === "completed" && (
                      <div className="visit-card-body">
                        <p className="visit-types">{(visit.visit_types as VisitType[]).map((type) => visitTypeLabels[type]).join(", ")}</p>
                        <p>{visit.developed}</p>
                        {visit.next_action && <p className="visit-next"><strong>Próxima ação:</strong> {visit.next_action}</p>}
                        {visit.quote_id && <p className="visit-next">Orçamento vinculado{quoteNumbers.get(visit.quote_id) ? ` #${quoteNumbers.get(visit.quote_id)}` : ""}</p>}
                      </div>
                    )}
                    {status === "not_done" && (
                      <div className="visit-card-body">
                        <p>Motivo: {notDoneReasonLabels[visit.not_done_reason as NotDoneReason]}{visit.not_done_note ? `. ${visit.not_done_note}` : ""}</p>
                      </div>
                    )}
                    <div className="visit-card-actions">
                      {status === "planned" && <>
                        <button type="button" className="row-button is-primary" onClick={() => { setMessage(""); setDialog({ kind: "register", visit }); }}>Registrar</button>
                        <button type="button" className="row-button" onClick={() => { setMessage(""); setDialog({ kind: "notDone", visit }); }}>Não realizada</button>
                        <button type="button" className="row-button" onClick={() => { setMessage(""); setDialog({ kind: "schedule", visit }); }}>Reagendar</button>
                        <button type="button" className="row-button is-danger" onClick={() => setDialog({ kind: "delete", visit })}>Excluir</button>
                      </>}
                      {status === "completed" && (
                        <button type="button" className="row-button" onClick={() => { setMessage(""); setDialog({ kind: "register", visit }); }}>Editar</button>
                      )}
                      {status === "not_done" && (
                        <button type="button" className="row-button" onClick={() => { setMessage(""); setDialog({ kind: "schedule", customerId: visit.customer_id }); }}>Agendar novamente</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {dialog?.kind === "schedule" && (
        <ScheduleVisitDialog context={context} customers={customers} visit={dialog.visit} initialCustomerId={dialog.customerId} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog?.kind === "register" && (
        <RegisterVisitDialog
          context={context}
          customers={customers}
          visit={dialog.visit}
          draft={dialog.draft}
          onClose={() => setDialog(null)}
          onSaved={done}
          onCreateQuote={(customer, draft) => {
            saveVisitDraft({ ...draft, visit: dialog.visit });
            setDialog(null);
            openCalculatorForCustomer({ id: customer.id, name: customer.legal_name, document: customer.document });
          }}
        />
      )}
      {dialog?.kind === "notDone" && (
        <NotDoneDialog visit={dialog.visit} customerName={customerName(dialog.visit)} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog?.kind === "delete" && (
        <Dialog title="Excluir visita agendada?" description={`${customerName(dialog.visit)}. Só visitas ainda não registradas podem ser excluídas.`} size="small" onClose={() => { if (!deleting) setDialog(null); }}>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={deleting} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button is-danger" disabled={deleting} onClick={() => void confirmDelete(dialog.visit)}>{deleting ? "Excluindo…" : "Excluir visita"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
