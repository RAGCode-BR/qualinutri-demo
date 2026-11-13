import { useState } from "react";
import { FileCheck2, FileWarning, Printer, Search, ShieldAlert, ShieldCheck, Truck } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { cancelInvoice, checkIe, emitInvoice, emitMdfe } from "../../demo/erp/service";
import type { Invoice } from "../../demo/erp/types";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import { DanfeDocument, MdfeDocument } from "../../components/demo/docs/FiscalDocuments";
import type { Mdfe } from "../../demo/erp/types";
import { Chip, Stat, Tabs, dateBr, money } from "./shared";

type Section = "nfe" | "mdfe";
const drivers = ["Waldir Nunes", "Gilmar Teixeira", "Reginaldo Sá"];

export function FiscalPage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("nfe");
  const invoiced = new Set(tables.erp.invoices.filter((item) => item.status === "autorizada").map((item) => item.quoteId));
  const toInvoice = tables.quotes.filter((quote) => quote.status === "approved" && !invoiced.has(quote.id)).sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? "")).slice(0, 14);
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[{ id: "nfe", label: "NF-e", badge: toInvoice.length }, { id: "mdfe", label: "MDF-e (transporte)" }]} />
      <div className="page-enter" key={section}>{section === "nfe" ? <Nfe toInvoice={toInvoice} /> : <MdfeView />}</div>
    </div>
  );
}

function Nfe({ toInvoice }: { toInvoice: ReturnType<typeof useDemoTables>["quotes"] }) {
  const tables = useDemoTables();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ quoteId: string; message: string } | null>(null);
  const [danfe, setDanfe] = useState<Invoice | null>(null);
  const ieOf = (customerId: string | null) => tables.erp.ie.find((item) => item.customerId === customerId);
  const authorized = tables.erp.invoices.filter((item) => item.status === "autorizada");
  const irregular = tables.erp.ie.filter((item) => item.status !== "ativa");

  async function emit(quoteId: string) {
    setBusy(quoteId);
    setError(null);
    try {
      const invoice = await emitInvoice(quoteId);
      setDanfe(invoice);
    } catch (emitError) {
      setError({ quoteId, message: emitError instanceof Error ? emitError.message : "Falha na emissão." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="NF-e autorizadas · 30 dias" value={authorized.length} format="number" tone="good" caption={money(authorized.reduce((sum, item) => sum + item.value, 0))} />
        <Stat index={1} label="Pedidos aprovados sem nota" value={toInvoice.length} format="number" tone="warn" />
        <Stat index={2} label="Rejeitadas pela SEFAZ" value={tables.erp.invoices.filter((item) => item.status === "rejeitada").length} format="number" tone="bad" />
        <Stat index={3} label="Clientes com IE irregular" value={irregular.length} format="number" tone="bad" caption="Bloqueados para faturar" />
      </section>

      <section className="dash-card">
        <header className="dash-card-head"><h2>Pedidos prontos para faturar</h2><Chip tone="info"><ShieldCheck size={12} aria-hidden="true" /> IE conferida no SINTEGRA antes de emitir</Chip></header>
        <ul className="erp-list is-actions">
          {toInvoice.map((quote) => {
            const ie = ieOf(quote.customer_id);
            const ok = !ie || ie.status === "ativa";
            return (
              <li key={quote.id} className={ok ? undefined : "is-blocked"}>
                <span className="erp-list-icon">{ok ? <FileCheck2 size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}</span>
                <span>
                  <strong>#{quote.quote_number} · {quote.customer_name_snapshot ?? "Consumidor"}</strong>
                  <small>Aprovado {dateBr(quote.approved_at)} · IE {ie?.ie ?? "isento"} · {ie ? <b className={ok ? "ok" : "bad"}>{ie.status}</b> : "—"}</small>
                  {error?.quoteId === quote.id && <small className="erp-error">{error.message}</small>}
                </span>
                <strong>{money(quote.grand_total)}</strong>
                <span className="erp-buttons">
                  {quote.customer_id && <button type="button" className="link-button" onClick={() => void checkIe(quote.customer_id!)}><Search size={13} aria-hidden="true" /> SINTEGRA</button>}
                  <button type="button" className={`primary-button compact-button${ok ? "" : " is-danger"}`} disabled={busy === quote.id} onClick={() => void emit(quote.id)}>{busy === quote.id ? "Transmitindo…" : ok ? "Emitir NF-e" : "Tentar emitir"}</button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="dash-card">
        <header className="dash-card-head"><h2>Notas emitidas</h2></header>
        <table className="erp-table">
          <thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Situação</th><th className="is-number">Valor</th><th /></tr></thead>
          <tbody>
            {[...tables.erp.invoices].reverse().slice(0, 30).map((invoice) => (
              <tr key={invoice.id} className="is-clickable" onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) setDanfe(invoice); }}>
                <td><strong>{invoice.number}</strong></td>
                <td>{invoice.customer}{invoice.rejection && <small className="erp-error">{invoice.rejection}</small>}</td>
                <td>{dateBr(invoice.date)}</td>
                <td><Chip tone={invoice.status === "autorizada" ? "good" : invoice.status === "rejeitada" ? "bad" : "muted"}>{invoice.status}</Chip></td>
                <td className="is-number">{money(invoice.value)}</td>
                <td className="erp-buttons">{invoice.status === "autorizada" && <><button type="button" className="link-button" onClick={() => setDanfe(invoice)}><Printer size={13} aria-hidden="true" /> DANFE</button><button type="button" className="link-button is-warn" onClick={() => void cancelInvoice(invoice.id)}>Cancelar</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {danfe && (
        <DocViewer title={`NF-e nº ${danfe.number} · DANFE`} subtitle={`${danfe.customer} · ${danfe.status}`} onClose={() => setDanfe(null)} actions={<button type="button" className="primary-button compact-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir</button>}>
          <DanfeDocument tables={tables} invoice={danfe} />
        </DocViewer>
      )}
    </div>
  );
}

function MdfeView() {
  const tables = useDemoTables();
  const [driver, setDriver] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [viewing, setViewing] = useState<Mdfe | null>(null);
  const withMdfe = new Set(tables.erp.mdfe.map((item) => item.loadId));
  const pending = tables.loads.filter((load) => (load.status === "loaded" || load.status === "planned") && !withMdfe.has(load.id));
  // Preferência de motorista por veículo (histórico).
  const preferred = (vehicle: string) => tables.erp.mdfe.filter((item) => item.vehicle === vehicle).at(-1)?.driver ?? drivers[0];

  async function emit(loadId: string, vehicle: string) {
    setError(null);
    try {
      setViewing(await emitMdfe(loadId, driver[loadId] ?? preferred(vehicle)));
    } catch (emitError) {
      setError({ id: loadId, message: emitError instanceof Error ? emitError.message : "Falha." });
    }
  }

  return (
    <div className="erp-grid">
      <section className="dash-card">
        <header className="dash-card-head"><h2>Cargas aguardando MDF-e</h2><Chip tone="info">notas, veículo, placa e motorista já preenchidos</Chip></header>
        {pending.length === 0 && <p className="muted">Nenhuma carga aguardando.</p>}
        <ul className="erp-list is-actions">
          {pending.map((load) => {
            const quoteIds = new Set(tables.load_items.filter((item) => item.load_id === load.id).map((item) => item.quote_id));
            const notes = tables.erp.invoices.filter((item) => quoteIds.has(item.quoteId) && item.status === "autorizada");
            return (
              <li key={load.id}>
                <span className="erp-list-icon"><Truck size={16} aria-hidden="true" /></span>
                <span>
                  <strong>Carga #{load.load_number} · {load.vehicle_name_snapshot} · {load.vehicle_plate_snapshot}</strong>
                  <small>{notes.length ? `NF-e ${notes.map((item) => item.number).join(", ")}` : <span className="erp-warn"><FileWarning size={12} aria-hidden="true" /> Faltam as NF-e dos pedidos</span>} · {(load.total_weight_kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</small>
                  {error?.id === load.id && <small className="erp-error">{error.message}</small>}
                </span>
                <select className="ck-target-filter" value={driver[load.id] ?? preferred(load.vehicle_name_snapshot)} onChange={(event) => setDriver((current) => ({ ...current, [load.id]: event.target.value }))} aria-label="Motorista">
                  {drivers.map((name) => <option key={name}>{name}</option>)}
                </select>
                <button type="button" className="primary-button compact-button" onClick={() => void emit(load.id, load.vehicle_name_snapshot)}>Emitir MDF-e</button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="dash-card">
        <header className="dash-card-head"><h2>MDF-e emitidos</h2></header>
        <table className="erp-table">
          <thead><tr><th>Nº</th><th>Veículo</th><th>Motorista</th><th>NF-e</th><th>Data</th><th>Situação</th></tr></thead>
          <tbody>{[...tables.erp.mdfe].reverse().map((item) => <tr key={item.id} className="is-clickable" onClick={() => setViewing(item)}><td><strong>{item.number}</strong></td><td>{item.vehicle}<small>{item.plate}</small></td><td>{item.driver}</td><td>{item.invoices.join(", ") || "—"}</td><td>{dateBr(item.date)}</td><td><Chip tone={item.status === "encerrado" ? "muted" : "good"}>{item.status}</Chip></td></tr>)}</tbody>
        </table>
      </section>
      {viewing && (
        <DocViewer title={`MDF-e nº ${viewing.number} · DAMDFE`} subtitle={`${viewing.vehicle} · ${viewing.driver}`} onClose={() => setViewing(null)} actions={<button type="button" className="primary-button compact-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir</button>}>
          <MdfeDocument tables={tables} mdfe={viewing} />
        </DocViewer>
      )}
    </div>
  );
}
