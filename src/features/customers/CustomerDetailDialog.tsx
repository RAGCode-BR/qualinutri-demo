import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import type { Customer } from "../../services/customerService";
import { listQuotes, type SavedQuoteSummary } from "../../services/quoteService";
import { deactivateProperty, listCustomerVisits, listProperties, saveProperty, type CustomerProperty, type Visit } from "../../services/visitService";
import { formatCurrency } from "../../utils/formatters";
import { quoteStatusLabels } from "../quotes/quoteStatus";
import { notDoneReasonLabels, visitStatusLabels, visitTypeLabels, type NotDoneReason, type VisitStatus, type VisitType } from "../visits/visitModel";
import { Select } from "../../components/Select";
import { sourceField } from "./customerSourceFields";
import { BRAZILIAN_STATES } from "../../domain/address/brazilianAddress";

const STATES = BRAZILIAN_STATES;

const formatDate = (value: string | null) => value ? value.split("-").reverse().join("/") : "";

type PropertyDraft = { id?: string; name: string; city: string; state: string };

/** Ficha do cliente: propriedades, visitas e orçamentos. */
export function CustomerDetailDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { profile } = useAuth();
  const [properties, setProperties] = useState<CustomerProperty[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [quotes, setQuotes] = useState<SavedQuoteSummary[]>([]);
  const [draft, setDraft] = useState<PropertyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<CustomerProperty | null>(null);
  const [load, setLoad] = useState<Record<"properties" | "visits" | "quotes", "loading" | "ready" | "error">>({ properties: "loading", visits: "loading", quotes: "loading" });
  const mark = (key: keyof typeof load, state: "ready" | "error") => setLoad((current) => ({ ...current, [key]: state }));

  async function reloadProperties() {
    setProperties(await listProperties(customer.id));
  }

  function loadAll() {
    setLoad({ properties: "loading", visits: "loading", quotes: "loading" });
    reloadProperties().then(() => mark("properties", "ready")).catch(() => mark("properties", "error"));
    listCustomerVisits(customer.id).then((rows) => { setVisits(rows); mark("visits", "ready"); }).catch(() => mark("visits", "error"));
    listQuotes({ customer: customer.id }).then((rows) => { setQuotes(rows); mark("quotes", "ready"); }).catch(() => mark("quotes", "error"));
  }

  useEffect(() => { loadAll(); }, [customer.id]);

  /** Texto de carregamento ou de erro da seção; null quando os dados estão prontos. */
  function sectionState(key: keyof typeof load) {
    if (load[key] === "loading") return <p className="muted">Carregando…</p>;
    if (load[key] === "error") {
      return <p className="auth-error" role="alert">Não foi possível carregar. <button type="button" className="link-button" onClick={loadAll}>Tentar novamente</button></p>;
    }
    return null;
  }

  async function submitProperty(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    if (!draft.name.trim()) return setError("Informe o nome da propriedade.");
    setSaving(true);
    setError("");
    try {
      await saveProperty({ id: draft.id, customerId: customer.id, name: draft.name, city: draft.city, state: draft.state });
      setDraft(null);
      await reloadProperties();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a propriedade.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProperty(property: CustomerProperty) {
    await deactivateProperty(property.id);
    setRemoving(null);
    await reloadProperties();
  }

  const propertyName = (id: string | null) => properties.find((property) => property.id === id)?.name;
  const visitDate = (visit: Visit) => visit.visited_date ?? visit.scheduled_date;
  const lastVisit = visits.find((visit) => visit.status === "completed");
  const source = customer.legacy_details;
  const address = customer.address;
  const contactFacts = [
    ["Código original", customer.legacy_code],
    ["Nome fantasia", customer.trade_name],
    ["CPF/CNPJ", customer.document ?? sourceField(source, "document_raw")],
    ["Inscrição estadual/RG", sourceField(source, "registration")],
    ["Órgão expedidor", sourceField(source, "agency")],
    ["Telefone 1", customer.phone],
    ["Telefone 2", sourceField(source, "phone_secondary")],
    ["Fax", sourceField(source, "fax")],
    ["Contato", sourceField(source, "contact_name")],
    ["E-mail principal", customer.email],
    ["E-mails no PDF", sourceField(source, "email_raw")],
    ["Data de nascimento", sourceField(source, "birth_date")],
  ] as const;
  const addressFacts = [
    ["Endereço", sourceField(address, "street")],
    ["Complemento", sourceField(address, "complement")],
    ["Bairro", sourceField(address, "district")],
    ["Cidade", sourceField(address, "city")],
    ["UF", sourceField(address, "state")],
    ["CEP", sourceField(address, "postal_code")],
  ] as const;

  function factList(facts: readonly (readonly [string, string | null])[]) {
    return <dl className="customer-facts">{facts.filter(([, value]) => Boolean(value)).map(([label, value]) => (
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
    ))}</dl>;
  }

  return (
    <Dialog title={customer.legal_name} description={[customer.document, customer.phone, customer.email].filter(Boolean).join(" · ") || undefined} onClose={() => { if (!saving) onClose(); }}>
      {error && <p className="auth-error" role="alert">{error}</p>}

      <section className="detail-section" aria-labelledby="detailContact">
        <h3 id="detailContact">Cadastro e contato</h3>
        {factList(contactFacts)}
        {!customer.document && sourceField(source, "document_raw") && <p className="field-hint">Documento transcrito do PDF; número inválido ou incompleto. Corrija pelo botão Editar.</p>}
      </section>
      {addressFacts.some(([, value]) => Boolean(value)) && <section className="detail-section" aria-labelledby="detailAddress">
        <h3 id="detailAddress">Endereço</h3>
        {factList(addressFacts)}
      </section>}

      <section className="detail-section" aria-labelledby="detailProperties">
        <div className="detail-section-head">
          <h3 id="detailProperties">Propriedades</h3>
          {!draft && <button type="button" className="row-button is-primary" onClick={() => setDraft({ name: "", city: "", state: "MT" })}>Nova propriedade</button>}
        </div>
        {draft && (
          <form className="property-form" onSubmit={submitProperty}>
            <div className="field">
              <label htmlFor="propertyName">Nome da propriedade</label>
              <input id="propertyName" required maxLength={120} placeholder="Ex.: Fazenda Boa Vista" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="form-grid compact">
              <div className="field">
                <label htmlFor="propertyCity">Cidade</label>
                <input id="propertyCity" maxLength={80} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="propertyState">UF</label>
                <Select
                  id="propertyState"
                  value={draft.state}
                  onChange={(value) => setDraft({ ...draft, state: value })}
                  options={[{ value: "", label: "—" }, ...STATES.map((state) => ({ value: state, label: state }))]}
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : draft.id ? "Salvar propriedade" : "Adicionar propriedade"}</button>
            </div>
          </form>
        )}
        {sectionState("properties") ?? (properties.length === 0 && !draft ? <p className="muted">Nenhuma propriedade cadastrada.</p> : (
          <ul className="detail-list">
            {properties.map((property) => (
              <li key={property.id}>
                <div>
                  <strong>{property.name}</strong>
                  {(property.city || property.state) && <span className="cell-sub">{[property.city, property.state].filter(Boolean).join("/")}</span>}
                </div>
                <div className="detail-actions">
                  <button type="button" className="row-button" disabled={saving} onClick={() => setDraft({ id: property.id, name: property.name, city: property.city ?? "", state: property.state ?? "" })}>Editar</button>
                  <button type="button" className="row-button is-danger" disabled={saving} onClick={() => setRemoving(property)}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="detail-section" aria-labelledby="detailVisits">
        <div className="detail-section-head">
          <h3 id="detailVisits">Visitas</h3>
          {lastVisit && <span className="cell-sub">Última visita em {formatDate(lastVisit.visited_date)}</span>}
        </div>
        {profile?.role !== "administrador" && <p className="field-hint">Você vê apenas as suas visitas a este cliente.</p>}
        {sectionState("visits") ?? (visits.length === 0 ? <p className="muted">Nenhuma visita registrada.</p> : (
          <ul className="detail-list">
            {visits.slice(0, 20).map((visit) => (
              <li key={visit.id} className="detail-visit">
                <div>
                  <strong>{formatDate(visitDate(visit))}</strong>
                  <span className="cell-sub">
                    {visit.status === "completed"
                      ? [(visit.visit_types as VisitType[]).map((type) => visitTypeLabels[type]).join(", "), propertyName(visit.property_id)].filter(Boolean).join(" · ")
                      : visit.status === "not_done" ? notDoneReasonLabels[visit.not_done_reason as NotDoneReason] : propertyName(visit.property_id) ?? ""}
                  </span>
                  {visit.developed && <p>{visit.developed}</p>}
                </div>
                <span className={`status-badge ${visit.status === "completed" ? "is-approved" : visit.status === "not_done" ? "is-cancelled" : "is-issued"}`}>{visitStatusLabels[visit.status as VisitStatus]}</span>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="detail-section" aria-labelledby="detailQuotes">
        <div className="detail-section-head"><h3 id="detailQuotes">Orçamentos</h3></div>
        {sectionState("quotes") ?? (quotes.length === 0 ? <p className="muted">Nenhum orçamento para este cliente.</p> : (
          <ul className="detail-list">
            {quotes.slice(0, 20).map((quote) => (
              <li key={quote.id}>
                <div>
                  <strong>#{quote.quote_number}</strong>
                  <span className="cell-sub">{new Date(quote.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="detail-actions">
                  <span className="strong">{formatCurrency(Number(quote.grand_total))}</span>
                  <span className={`status-badge is-${quote.status}`}>{quoteStatusLabels[quote.status] ?? quote.status}</span>
                </div>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Fechar</button>
      </div>

      {removing && (
        <ConfirmDialog
          title={`Excluir a propriedade ${removing.name}?`}
          description="Ela sai das listas de visita. Visitas já feitas nela continuam no histórico."
          confirmLabel="Excluir propriedade"
          danger
          onConfirm={() => removeProperty(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Dialog>
  );
}
