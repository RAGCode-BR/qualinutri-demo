import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog";
import type { CustomerSummary } from "../../services/customerService";
import { listQuotes, type SavedQuoteSummary } from "../../services/quoteService";
import {
  listProperties,
  markVisitNotDone,
  registerVisit,
  rescheduleVisit,
  scheduleVisit,
  type CustomerProperty,
  type Seller,
  type Visit,
} from "../../services/visitService";
import { formatCurrency } from "../../utils/formatters";
import { toIsoDate } from "../reports/reportPeriod";
import { quoteStatusLabels } from "../quotes/quoteStatus";
import type { VisitDraft } from "./visitDraft";
import { notDoneReasonLabels, selectableVisitTypes, visitTypeLabels, type NotDoneReason, type VisitType } from "./visitModel";
import { Select } from "../../components/Select";
import { DateInput } from "../../components/DateInput";

type SellerContext = { isAdmin: boolean; currentUserId: string; sellers: Seller[] };

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Propriedades do cliente escolhido, recarregadas quando o cliente muda. */
function useCustomerProperties(customerId: string) {
  const [properties, setProperties] = useState<CustomerProperty[]>([]);
  useEffect(() => {
    if (!customerId) { setProperties([]); return; }
    let active = true;
    listProperties(customerId).then((rows) => { if (active) setProperties(rows); }).catch(() => { if (active) setProperties([]); });
    return () => { active = false; };
  }, [customerId]);
  return properties;
}

function SellerField({ context, value, onChange }: { context: SellerContext; value: string; onChange: (value: string) => void }) {
  if (!context.isAdmin) return null;
  return (
    <div className="field">
      <label htmlFor="visitSeller">Vendedor</label>
      <Select
        id="visitSeller"
        value={value}
        onChange={onChange}
        options={context.sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
      />
    </div>
  );
}

function CustomerAndPropertyFields({ customers, customerId, propertyId, onCustomer, onProperty, locked }: {
  customers: CustomerSummary[];
  customerId: string;
  propertyId: string;
  onCustomer: (value: string) => void;
  onProperty: (value: string) => void;
  locked?: boolean;
}) {
  const properties = useCustomerProperties(customerId);
  const activeCustomers = customers.filter((customer) => customer.active || customer.id === customerId);
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="visitCustomer">Cliente</label>
        <Select
          id="visitCustomer"
          disabled={locked}
          value={customerId}
          onChange={(value) => { onCustomer(value); onProperty(""); }}
          searchable
          placeholder="Escolha o cliente"
          options={[{ value: "", label: "Escolha o cliente" }, ...activeCustomers.map((customer) => ({ value: customer.id, label: `${customer.legal_name}${customer.legacy_code ? ` · ${customer.legacy_code}` : ""}` }))]}
        />
      </div>
      <div className="field">
        <label htmlFor="visitProperty">Propriedade (opcional)</label>
        <Select
          id="visitProperty"
          disabled={!customerId || properties.length === 0}
          value={propertyId}
          onChange={onProperty}
          options={[
            { value: "", label: !customerId ? "Escolha o cliente primeiro" : properties.length === 0 ? "Cliente sem propriedades" : "Sem propriedade" },
            ...properties.map((property) => ({
              value: property.id,
              label: `${property.name}${property.city ? ` (${property.city}${property.state ? `/${property.state}` : ""})` : ""}`,
            })),
          ]}
        />
      </div>
    </div>
  );
}

/** Agendar uma visita nova ou reagendar (só a data) uma visita agendada. */
export function ScheduleVisitDialog({ context, customers, visit, initialCustomerId, onClose, onSaved }: {
  context: SellerContext;
  customers: CustomerSummary[];
  visit?: Visit;
  initialCustomerId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const rescheduling = Boolean(visit);
  const [sellerId, setSellerId] = useState(visit?.seller_id ?? context.currentUserId);
  const [customerId, setCustomerId] = useState(visit?.customer_id ?? initialCustomerId ?? "");
  const [propertyId, setPropertyId] = useState(visit?.property_id ?? "");
  const [date, setDate] = useState(visit?.scheduled_date ?? toIsoDate(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!customerId) return setError("Escolha o cliente.");
    if (!date) return setError("Escolha a data da visita.");
    setSaving(true);
    setError("");
    try {
      if (visit) await rescheduleVisit(visit.id, date);
      else await scheduleVisit({ sellerId, customerId, propertyId: propertyId || null, date });
      onSaved(visit ? "Visita reagendada." : "Visita agendada.");
    } catch (saveError) {
      setError(errorText(saveError, "Não foi possível salvar a visita."));
      setSaving(false);
    }
  }

  return (
    <Dialog title={rescheduling ? "Reagendar visita" : "Agendar visita"} onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        {!rescheduling && <SellerField context={context} value={sellerId} onChange={setSellerId} />}
        <CustomerAndPropertyFields customers={customers} customerId={customerId} propertyId={propertyId} onCustomer={setCustomerId} onProperty={setPropertyId} locked={rescheduling} />
        <div className="field">
          <label htmlFor="visitDate">Data da visita</label>
          <DateInput id="visitDate" required value={date} onChange={setDate} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : rescheduling ? "Reagendar" : "Agendar visita"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Registrar uma visita: completa uma agendada, edita uma realizada ou cria uma direto. */
export function RegisterVisitDialog({ context, customers, visit, draft, onClose, onSaved, onCreateQuote }: {
  context: SellerContext;
  customers: CustomerSummary[];
  visit?: Visit;
  /** Registro retomado depois de criar um orçamento na Calculadora. */
  draft?: VisitDraft;
  onClose: () => void;
  onSaved: (message: string) => void;
  onCreateQuote: (customer: CustomerSummary, draft: VisitDraft) => void;
}) {
  const editing = visit?.status === "completed";
  const [sellerId, setSellerId] = useState(draft?.sellerId ?? visit?.seller_id ?? context.currentUserId);
  const [customerId, setCustomerId] = useState(draft?.customerId ?? visit?.customer_id ?? "");
  const [propertyId, setPropertyId] = useState(draft?.propertyId ?? visit?.property_id ?? "");
  const [visitedDate, setVisitedDate] = useState(draft?.visitedDate ?? visit?.visited_date ?? visit?.scheduled_date ?? toIsoDate(new Date()));
  const [developed, setDeveloped] = useState(draft?.developed ?? visit?.developed ?? "");
  const [types, setTypes] = useState<VisitType[]>(() => (draft?.types ?? (visit?.visit_types ?? []) as VisitType[]).filter((type) => selectableVisitTypes.includes(type)));
  const [quoteId, setQuoteId] = useState(visit?.quote_id ?? "");
  const [nextAction, setNextAction] = useState(draft?.nextAction ?? visit?.next_action ?? "");
  const [returnDate, setReturnDate] = useState(draft?.returnDate ?? "");
  const [quotes, setQuotes] = useState<SavedQuoteSummary[]>([]);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closing = types.includes("closing");

  useEffect(() => {
    if (!customerId || !closing) { setQuotes([]); return; }
    let active = true;
    listQuotes({ customer: customerId })
      // Orçamento já vinculado continua visível mesmo se foi cancelado depois.
      .then((rows) => { if (active) setQuotes(rows.filter((quote) => quote.status !== "cancelled" || quote.id === visit?.quote_id)); })
      .catch(() => { if (active) setQuotes([]); });
    return () => { active = false; };
  }, [customerId, closing]);

  function toggleType(type: VisitType, checked: boolean) {
    setTypes((current) => checked ? [...current, type] : current.filter((value) => value !== type));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!customerId) return setError("Escolha o cliente.");
    if (!visitedDate) return setError("Informe a data da visita.");
    if (!developed.trim()) return setError("Descreva o que foi feito na visita.");
    if (types.length === 0) return setError("Marque pelo menos um tipo de visita.");
    if (returnDate && returnDate <= visitedDate) return setError("A data de retorno deve ser depois da data da visita.");
    setSaving(true);
    setError("");
    try {
      // Se o retorno falhou numa tentativa anterior, a visita já foi gravada: atualiza em vez de duplicar.
      const savedId = await registerVisit(visit?.id ?? savedVisitId, {
        sellerId, customerId, propertyId: propertyId || null, visitedDate,
        developed: developed.trim(), types, quoteId: quoteId || null, nextAction: nextAction.trim() || null,
      });
      setSavedVisitId(savedId);
      if (returnDate) {
        try {
          await scheduleVisit({ sellerId, customerId, propertyId: propertyId || null, date: returnDate, followUpOf: savedId });
        } catch {
          onSaved("Visita registrada, mas não foi possível agendar o retorno. Agende pela agenda de visitas.");
          return;
        }
      }
      onSaved(returnDate
        ? `Visita registrada e retorno agendado para ${returnDate.split("-").reverse().join("/")}.`
        : editing ? "Visita atualizada." : "Visita registrada.");
    } catch (saveError) {
      setError(errorText(saveError, "Não foi possível registrar a visita."));
      setSaving(false);
    }
  }

  const customer = customers.find((option) => option.id === customerId);

  return (
    <Dialog title={editing ? "Editar visita" : "Registrar visita"} onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        {!visit && <SellerField context={context} value={sellerId} onChange={setSellerId} />}
        <CustomerAndPropertyFields customers={customers} customerId={customerId} propertyId={propertyId} onCustomer={(value) => { setCustomerId(value); setQuoteId(""); }} onProperty={setPropertyId} locked={Boolean(visit)} />
        <div className="field">
          <label htmlFor="visitedDate">Data da visita</label>
          <DateInput id="visitedDate" required value={visitedDate} onChange={setVisitedDate} />
        </div>
        <fieldset className="price-fieldset visit-type-fieldset">
          <legend>Tipo de visita</legend>
          <div className="visit-type-options">
            {selectableVisitTypes.map((type) => (
              <label key={type} className="check-field">
                <input type="checkbox" checked={types.includes(type)} onChange={(event) => toggleType(type, event.target.checked)} />
                <span>{visitTypeLabels[type]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {closing && (
          <div className="field visit-quote-field">
            <label htmlFor="visitQuote">Orçamento do fechamento</label>
            <Select
              id="visitQuote"
              value={quoteId}
              disabled={!customerId}
              onChange={setQuoteId}
              options={[
                { value: "", label: !customerId ? "Escolha o cliente primeiro" : quotes.length === 0 ? "Nenhum orçamento deste cliente" : "Sem orçamento vinculado" },
                ...quotes.map((quote) => ({ value: quote.id, label: `#${quote.quote_number} · ${formatCurrency(Number(quote.grand_total))} · ${quoteStatusLabels[quote.status] ?? quote.status}` })),
              ]}
            />
            {customer && (
              <p className="field-hint">
                Ainda não fez o orçamento?{" "}
                <button type="button" className="link-button" disabled={saving} onClick={() => onCreateQuote(customer, { visitId: visit?.id ?? null, sellerId, customerId, propertyId, visitedDate, developed, types, nextAction, returnDate })}>Criar orçamento na Calculadora</button>
                . O que você já preencheu aqui fica guardado: depois de salvar o orçamento, volte a Visitas para vincular.
              </p>
            )}
          </div>
        )}
        <div className="field">
          <label htmlFor="visitDeveloped">O que foi feito na visita</label>
          <textarea id="visitDeveloped" required rows={4} maxLength={2000} placeholder="Ex.: apresentação da linha mineral, avaliação do cocho, negociação de prazo…" value={developed} onChange={(event) => setDeveloped(event.target.value)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="visitNextAction">Próxima ação (opcional)</label>
            <input id="visitNextAction" maxLength={300} placeholder="Ex.: enviar proposta de proteinado" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </div>
          {!editing && (
            <div className="field">
              <label htmlFor="visitReturn">Agendar retorno (opcional)</label>
              <DateInput id="visitReturn" min={visitedDate} value={returnDate} onChange={setReturnDate} />
            </div>
          )}
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar visita"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NotDoneDialog({ visit, customerName, onClose, onSaved }: { visit: Visit; customerName: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState<NotDoneReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!reason) return setError("Escolha o motivo.");
    if (reason === "other" && !note.trim()) return setError("Descreva o motivo.");
    setSaving(true);
    setError("");
    try {
      await markVisitNotDone(visit.id, reason, note.trim() || null);
      onSaved("Visita marcada como não realizada.");
    } catch (saveError) {
      setError(errorText(saveError, "Não foi possível salvar."));
      setSaving(false);
    }
  }

  return (
    <Dialog title="Visita não realizada" description={customerName} size="small" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <fieldset className="price-fieldset">
          <legend>Motivo</legend>
          <div className="visit-reason-options">
            {(Object.keys(notDoneReasonLabels) as NotDoneReason[]).map((option) => (
              <label key={option} className="check-field">
                <input type="radio" name="notDoneReason" checked={reason === option} onChange={() => setReason(option)} />
                <span>{notDoneReasonLabels[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="notDoneNote">{reason === "other" ? "Descreva o motivo" : "Observação (opcional)"}</label>
          <input id="notDoneNote" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Dialog>
  );
}
