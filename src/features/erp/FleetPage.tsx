import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Printer, Truck, Wrench, XCircle } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { overdueTargets, recordCost, targetsFor } from "../../demo/checklist/compliance";
import { TAB_BY_ID } from "../../demo/checklist/tabs";
import { addDays, isoDate, today } from "../../demo/store/ids";
import { createFleetRequest, decideFleetRequest, finishFleetRequest } from "../../demo/erp/service";
import type { FleetRequest } from "../../demo/erp/types";
import { Sheet } from "../../components/demo/DetailSheets";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { Stat, Tabs, dateBr, money } from "./shared";
import { FileDropZone } from "../../components/demo/FileDropZone";
import { storeEvidence } from "../../demo/checklist/evidence";
import type { ChecklistRecord, EvidenceRef } from "../../demo/checklist/types";
import { EvidenceThumb, Lightbox, StatusChip, formatDateTime } from "../checklist/shared";
import { RecordDialog } from "../checklist/RecordDialog";
import { printTabReport } from "../checklist/report";

type Section = "inspection" | "requests" | "profit" | "patterns";

/** Dados para abrir um pedido de conserto já preenchido (ex.: a partir de uma conferência reprovada). */
export type RepairDraft = { vehicle: string; problem: string; evidence: EvidenceRef[]; checkRecordId: string | null };

/** Itens reprovados de uma conferência viram o texto do pedido de conserto. */
export function repairDraftFrom(record: ChecklistRecord): RepairDraft | null {
  const failed = Object.entries(record.checks).filter(([, ok]) => ok === false).map(([item]) => item);
  if (!failed.length || !record.targetLabel) return null;
  const notes = record.notes ? ` ${record.notes}` : "";
  return { vehicle: record.targetLabel, problem: `${TAB_BY_ID[record.tab].label} de ${dateBr(record.date)}: ${failed.join(", ")} reprovado${failed.length > 1 ? "s" : ""}.${notes}`, evidence: record.evidence, checkRecordId: record.id };
}
const statusLabel: Record<FleetRequest["status"], string> = { aguardando: "Aguardando aprovação", aprovado: "Aprovado · em execução", recusado: "Recusado", concluido: "Concluído" };

export function FleetPage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("inspection");
  const waiting = tables.erp.fleetRequests.filter((item) => item.status === "aguardando").length;
  const late = overdueTargets("fleetCheck", tables, today()).length;
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[{ id: "inspection", label: "Conferência dos veículos", badge: late }, { id: "requests", label: "Pedidos de conserto", badge: waiting }, { id: "profit", label: "Frete × custo por caminhão" }, { id: "patterns", label: "Padrões de quebra" }]} />
      <div className="page-enter" key={section}>
        {section === "inspection" && <Inspections onGoRequests={() => setSection("requests")} />}
        {section === "requests" && <Requests />}
        {section === "profit" && <Profit />}
        {section === "patterns" && <Patterns />}
      </div>
    </div>
  );
}

function Requests() {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "administrador";
  const [open, setOpen] = useState<FleetRequest | null>(null);
  const [creating, setCreating] = useState(false);
  const columns: Array<{ status: FleetRequest["status"][]; title: string }> = [
    { status: ["aguardando"], title: "Aguardando aprovação da gestão" },
    { status: ["aprovado"], title: "Aprovado · na oficina" },
    { status: ["concluido", "recusado"], title: "Concluído / recusado" },
  ];
  const spent = tables.erp.fleetRequests.filter((item) => item.status === "concluido" || item.status === "aprovado").reduce((sum, item) => sum + (item.chosen !== null ? item.quotes[item.chosen]?.value ?? 0 : 0), 0);
  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Aguardando aprovação" value={tables.erp.fleetRequests.filter((item) => item.status === "aguardando").length} format="number" tone="warn" caption="A gestão aprova pelo sistema" />
        <Stat index={1} label="Gasto aprovado com consertos" value={spent} format="currency" />
        <Stat index={2} label="Frota" value={tables.vehicles.length + tables.checklist.equipment.filter((item) => item.kind === "Veículo leve" || item.kind === "Movimentação").length} format="number" caption="3 caminhões · 2 carros · empilhadeira" />
      </section>
      <div className="erp-actions-row is-end"><button type="button" className="primary-button compact-button" onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />&nbsp;Novo pedido de conserto</button></div>
      <section className="kpi-board is-three">
        {columns.map((column) => {
          const list = tables.erp.fleetRequests.filter((item) => column.status.includes(item.status));
          return (
            <div key={column.title} className={`kpi-board-col is-${column.status[0]}`}>
              <h3>{column.title}<span>{list.length}</span></h3>
              {list.map((item, index) => (
                <button type="button" key={item.id} className="kpi-board-card" style={{ animationDelay: `${index * 40}ms` }} onClick={() => setOpen(item)}>
                  <strong><Wrench size={13} aria-hidden="true" /> {item.vehicle}</strong>
                  <small>{item.problem}</small>
                  {item.context && <small className="erp-warn"><AlertTriangle size={12} aria-hidden="true" /> {item.context}</small>}
                  <span>{item.chosen !== null ? money(item.quotes[item.chosen].value) : `${item.quotes.length} orçamentos · menor ${money(Math.min(...item.quotes.map((quote) => quote.value)))}`}</span>
                </button>
              ))}
            </div>
          );
        })}
      </section>
      {open && (
        <Sheet variant="center" label="Pedido de conserto" onClose={() => setOpen(null)}>
          <RequestDetail request={tables.erp.fleetRequests.find((item) => item.id === open.id) ?? open} isAdmin={isAdmin} />
        </Sheet>
      )}
      {creating && <NewRequest onClose={() => setCreating(false)} />}
    </div>
  );
}

function RequestDetail({ request, isAdmin }: { request: FleetRequest; isAdmin: boolean }) {
  const tables = useDemoTables();
  const [chosen, setChosen] = useState(request.chosen ?? request.quotes.indexOf([...request.quotes].sort((a, b) => a.value - b.value)[0]));
  const [preview, setPreview] = useState<{ url: string; type?: string } | null>(null);
  const [error, setError] = useState("");
  const act = (action: Promise<void>) => { setError(""); void action.catch((reason: Error) => setError(reason.message)); };
  const history = tables.checklist.records.filter((record) => record.tab === "maintenance" && record.targetLabel === request.vehicle).slice(0, 5);
  const totalHistory = tables.checklist.records.filter((record) => record.tab === "maintenance" && record.targetLabel === request.vehicle).reduce((sum, record) => sum + recordCost("maintenance", record.values), 0);
  return (
    <div className="kpi-sheet">
      <header className="kpi-sheet-hero"><span className="kpi-sheet-icon"><Truck size={26} /></span><div><p>{statusLabel[request.status]} · pedido por {request.requestedBy} em {dateBr(request.date)}</p><strong>{request.vehicle}</strong><small>{request.problem}</small></div></header>
      {request.context && <p className="ck-alert">{request.context}</p>}
      <h3>Orçamentos</h3>
      <div className="quote-options">
        {request.quotes.map((quote, index) => (
          <button type="button" key={index} aria-pressed={chosen === index} disabled={request.status !== "aguardando"} onClick={() => setChosen(index)}>
            <strong>{quote.shop}</strong><span>{money(quote.value)}</span><small>{quote.days} {quote.days === 1 ? "dia" : "dias"} parado</small>
          </button>
        ))}
      </div>
      {request.evidence && request.evidence.length > 0 && (
        <>
          <h3>Fotos e orçamentos anexados</h3>
          <div className="ck-thumbs">{request.evidence.map((file) => <EvidenceThumb key={file.id} evidence={file} onOpen={(url, type) => setPreview({ url, type })} />)}</div>
        </>
      )}
      {request.checkRecordId && <p className="muted"><ClipboardCheck size={14} aria-hidden="true" /> Aberto a partir de uma conferência do veículo.</p>}
      <p className="muted">Já gasto neste veículo: <strong>{money(totalHistory)}</strong> em {history.length ? "manutenções registradas" : "nenhuma manutenção registrada"}.</p>
      {request.status === "aguardando" && (isAdmin ? (
        <div className="erp-actions-row is-end">
          <button type="button" className="secondary-button compact-secondary" onClick={() => act(decideFleetRequest(request.id, false))}><XCircle size={15} aria-hidden="true" />&nbsp;Recusar</button>
          <button type="button" className="primary-button compact-button" onClick={() => act(decideFleetRequest(request.id, true, chosen))}><CheckCircle2 size={15} aria-hidden="true" />&nbsp;Aprovar {request.quotes[chosen]?.shop}</button>
        </div>
      ) : <p className="erp-notice">Aguardando a gestão aprovar. Troque para o perfil Administrador para aprovar.</p>)}
      {request.status === "aprovado" && <button type="button" className="primary-button" onClick={() => act(finishFleetRequest(request.id))}>Marcar como concluído</button>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {preview && <Lightbox url={preview.url} type={preview.type} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function NewRequest({ initial, onClose, onCreated }: { initial?: RepairDraft | null; onClose: () => void; onCreated?: () => void }) {
  const tables = useDemoTables();
  const vehicleNames = [...tables.vehicles.map((item) => item.name), ...tables.checklist.equipment.filter((item) => item.kind !== "Produção" && item.kind !== "Envase").map((item) => item.name)];
  const [vehicle, setVehicle] = useState(initial?.vehicle ?? tables.vehicles[0]?.name ?? "");
  const [problem, setProblem] = useState(initial?.problem ?? "");
  const [busy, setBusy] = useState(false);
  const [quotes, setQuotes] = useState([{ shop: "Auto Diesel Juruena", value: 0, days: 2 }, { shop: "Oficina interna", value: 0, days: 1 }]);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<EvidenceRef[]>(initial?.evidence ?? []);
  async function addFiles(list: FileList) {
    const stored = await Promise.all([...list].slice(0, 8).map((file) => storeEvidence(file)));
    setFiles((current) => [...current, ...stored]);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await createFleetRequest({ vehicle, problem, quotes: quotes.filter((quote) => quote.value > 0), evidence: files, checkRecordId: initial?.checkRecordId ?? null });
      onCreated?.();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro.");
      setBusy(false);
    }
  }
  return (
    <Sheet variant="center" label="Novo pedido de conserto" onClose={onClose}>
      <form className="kpi-sheet" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2>Novo pedido de conserto</h2>
        {initial?.checkRecordId && <p className="erp-notice">Itens reprovados na conferência já vieram no texto e nas fotos. Informe os orçamentos das oficinas e envie para a gestão aprovar.</p>}
        <div className="field"><label htmlFor="fr-vehicle">Veículo</label><select id="fr-vehicle" className="ck-target-filter" value={vehicle} onChange={(event) => setVehicle(event.target.value)}>{(vehicleNames.includes(vehicle) ? vehicleNames : [vehicle, ...vehicleNames]).map((name) => <option key={name}>{name}</option>)}</select></div>
        <div className="field"><label htmlFor="fr-problem">O que aconteceu</label><textarea id="fr-problem" rows={3} value={problem} onChange={(event) => setProblem(event.target.value)} /></div>
        <h3>Orçamentos</h3>
        {quotes.map((quote, index) => (
          <div key={index} className="ck-form-grid">
            <div className="field"><label htmlFor={`fr-shop-${index}`}>Oficina</label><input id={`fr-shop-${index}`} value={quote.shop} onChange={(event) => setQuotes((current) => current.map((row, position) => position === index ? { ...row, shop: event.target.value } : row))} /></div>
            <div className="field"><label htmlFor={`fr-value-${index}`}>Valor (R$)</label><input id={`fr-value-${index}`} type="number" min={0} step="0.01" value={quote.value || ""} onChange={(event) => setQuotes((current) => current.map((row, position) => position === index ? { ...row, value: Number(event.target.value) } : row))} /></div>
          </div>
        ))}
        <button type="button" className="link-button" onClick={() => setQuotes((current) => [...current, { shop: "", value: 0, days: 1 }])}>+ Outro orçamento</button>
        <h3>Fotos do problema e orçamentos em PDF</h3>
        <FileDropZone compact onFiles={(list) => void addFiles(list)} label="Arraste fotos do defeito e os orçamentos das oficinas" />
        {files.length > 0 && <div className="ck-thumbs">{files.map((file) => <div className="ck-thumb-wrap" key={file.id}><EvidenceThumb evidence={file} /><button type="button" className="ck-thumb-remove" aria-label={`Remover ${file.name}`} onClick={() => setFiles((current) => current.filter((row) => row.id !== file.id))}>×</button></div>)}</div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="erp-actions-row is-end"><button type="button" className="secondary-button compact-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button compact-button" disabled={busy}>{busy ? "Enviando…" : "Enviar para aprovação"}</button></div>
      </form>
    </Sheet>
  );
}

function Inspections({ onGoRequests }: { onGoRequests: () => void }) {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const canWrite = profile?.role !== "consulta";
  const now = today();
  const [dialog, setDialog] = useState<{ target?: string | null; record?: ChecklistRecord } | null>(null);
  const [repair, setRepair] = useState<RepairDraft | null>(null);
  const [notice, setNotice] = useState("");
  const targets = targetsFor("fleetCheck", tables);
  const records = tables.checklist.records.filter((record) => record.tab === "fleetCheck").sort((a, b) => b.date.localeCompare(a.date));
  const overdue = new Map(overdueTargets("fleetCheck", tables, now).map((item) => [item.id, item]));
  const todayKey = isoDate(now);
  const from = isoDate(addDays(now, -29));
  const recent = records.filter((record) => isoDate(new Date(record.date)) >= from);
  const repairOpenFor = new Set(tables.erp.fleetRequests.filter((item) => item.checkRecordId).map((item) => item.checkRecordId));
  const driverName = (id: unknown) => tables.checklist.employees.find((item) => item.id === id)?.name ?? "—";

  function onSaved(record: ChecklistRecord) {
    const draft = repairDraftFrom(record);
    if (draft) setRepair(draft);
    else setNotice(`Conferência do ${record.targetLabel ?? "veículo"} registrada: tudo conforme.`);
  }

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Conferências hoje" value={records.filter((record) => isoDate(new Date(record.date)) === todayKey).length} format="number" tone="good" caption="Saída e retorno" />
        <Stat index={1} label="Com item reprovado · 30 dias" value={recent.filter((record) => record.status === "nao_conforme").length} format="number" tone="bad" caption="Viram pedido de conserto" />
        <Stat index={2} label="Veículos sem conferência na semana" value={overdue.size} format="number" tone="warn" caption={`de ${targets.length} na frota`} />
      </section>
      <div className="erp-actions-row is-end">
        <button type="button" className="secondary-button compact-secondary" onClick={() => printTabReport("fleetCheck", recent, tables, "últimos 30 dias")}><Printer size={15} aria-hidden="true" />&nbsp;Relatório</button>
        {canWrite && <button type="button" className="primary-button compact-button" onClick={() => setDialog({ target: null })}><Plus size={15} aria-hidden="true" />&nbsp;Nova conferência</button>}
      </div>
      {notice && <p className="erp-notice" role="status">{notice}</p>}
      <div className="truck-grid">
        {targets.map((target, index) => {
          const last = records.find((record) => record.targetId === target.id);
          const failed = last ? Object.entries(last.checks).filter(([, ok]) => ok === false).map(([item]) => item) : [];
          const late = overdue.get(target.id);
          return (
            <article key={target.id} className={`truck-card fleet-check-card${last?.status === "nao_conforme" ? " is-loss" : ""}`} style={{ animationDelay: `${index * 60}ms` }}>
              <header><Truck size={20} aria-hidden="true" /><strong>{target.label}</strong>{target.sub && <small>{target.sub}</small>}</header>
              {last ? (
                <>
                  <dl>
                    <div><dt>Última</dt><dd>{formatDateTime(last.date)}</dd></div>
                    <div><dt>Momento</dt><dd>{String(last.values.moment ?? "—")}</dd></div>
                    <div><dt>Km</dt><dd>{typeof last.values.odometer === "number" ? last.values.odometer.toLocaleString("pt-BR") : "—"}</dd></div>
                  </dl>
                  <small className="muted">Condutor: {driverName(last.values.driver)} · por {last.responsible}</small>
                  <StatusChip status={last.status} />
                  {failed.length > 0 && <p className="erp-warn"><AlertTriangle size={13} aria-hidden="true" /> Reprovado: {failed.join(", ")}</p>}
                </>
              ) : <p className="muted">Nenhuma conferência registrada.</p>}
              {late && <p className="erp-warn"><AlertTriangle size={13} aria-hidden="true" /> Conferência atrasada{late.lastDate ? ` · última em ${dateBr(late.lastDate)}` : ""}</p>}
              <div className="erp-actions-row">
                {canWrite && <button type="button" className="primary-button compact-button" onClick={() => setDialog({ target: target.id })}><ClipboardCheck size={15} aria-hidden="true" />&nbsp;Conferir agora</button>}
                {last && <button type="button" className="secondary-button compact-secondary" onClick={() => setDialog({ record: last })}>Ver última</button>}
                {canWrite && last && failed.length > 0 && !repairOpenFor.has(last.id) && <button type="button" className="link-button" onClick={() => setRepair(repairDraftFrom(last))}><Wrench size={13} aria-hidden="true" /> Pedir conserto</button>}
                {last && repairOpenFor.has(last.id) && <button type="button" className="link-button" onClick={onGoRequests}><Wrench size={13} aria-hidden="true" /> Conserto pedido</button>}
              </div>
            </article>
          );
        })}
      </div>
      <section className="dash-card">
        <header className="dash-card-head"><h2>Últimas conferências</h2><span className="count-badge">{recent.length} em 30 dias</span></header>
        <div className="ck-list">
          {records.slice(0, 15).map((record) => (
            <div role="button" tabIndex={0} key={record.id} className={`ck-row is-${record.status}`} onClick={() => setDialog({ record })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDialog({ record }); } }}>
              <span className="ck-row-date">{formatDateTime(record.date)}</span>
              <span className="ck-row-main"><strong>{record.targetLabel}</strong><small>{String(record.values.moment ?? "")} · {driverName(record.values.driver)} · {record.responsible}</small></span>
              <span className="ck-row-thumbs">{record.evidence.slice(0, 3).map((item) => <EvidenceThumb key={item.id} evidence={item} />)}</span>
              <StatusChip status={record.status} />
            </div>
          ))}
          {records.length === 0 && <p className="drawer-empty">Nenhuma conferência ainda.</p>}
        </div>
      </section>
      {dialog && <RecordDialog tabId="fleetCheck" record={dialog.record} presetTarget={dialog.target} readOnly={!canWrite} onSaved={(record) => { setNotice(""); onSaved(record); }} onClose={() => setDialog(null)} />}
      {repair && <NewRequest initial={repair} onClose={() => setRepair(null)} onCreated={() => setNotice("Pedido de conserto enviado para a gestão aprovar (veja em Pedidos de conserto e em Aprovações).")} />}
    </div>
  );
}

function Profit() {
  const tables = useDemoTables();
  const [drawer, setDrawer] = useState<DrawerSelection | null>(null);
  const rows = useMemo(() => tables.vehicles.map((vehicle) => {
    const trips = tables.erp.trips.filter((trip) => trip.vehicle === vehicle.name);
    const freight = trips.reduce((sum, trip) => sum + trip.freightCharged, 0);
    const running = trips.reduce((sum, trip) => sum + trip.fuel + trip.tolls, 0);
    const maintenance = tables.checklist.records.filter((record) => record.tab === "maintenance" && record.targetId === vehicle.id).reduce((sum, record) => sum + recordCost("maintenance", record.values), 0)
      + tables.erp.fleetRequests.filter((item) => item.vehicle === vehicle.name && item.chosen !== null && item.status !== "recusado").reduce((sum, item) => sum + item.quotes[item.chosen!].value, 0);
    const fixed = 6_800 * 3; // parcela, seguro e salário do motorista no período (simulado)
    const cost = running + maintenance + fixed;
    return { vehicle, trips, freight, running, maintenance, fixed, cost, result: freight - cost, tons: trips.reduce((sum, trip) => sum + trip.tons, 0) };
  }), [tables]);
  const max = Math.max(1, ...rows.flatMap((row) => [row.freight, row.cost]));
  return (
    <div className="erp-grid">
      <p className="muted">O frete cobrado dos clientes nos últimos 3 meses paga a estrutura de cada caminhão? Clique num caminhão para ver as viagens.</p>
      <div className="truck-grid">
        {rows.map((row, index) => (
          <button type="button" key={row.vehicle.id} className={`truck-card${row.result < 0 ? " is-loss" : ""}`} style={{ animationDelay: `${index * 80}ms` }} onClick={() => setDrawer({ title: `${row.vehicle.name} · viagens`, columns: [{ key: "date", label: "Data", format: "date" }, { key: "customer", label: "Cliente" }, { key: "km", label: "Km", format: "number" }, { key: "tons", label: "t", format: "number" }, { key: "freight", label: "Frete cobrado", format: "currency" }, { key: "cost", label: "Diesel + pedágio", format: "currency" }], rows: row.trips.map((trip) => ({ id: trip.id, date: trip.date.slice(0, 10), customer: trip.customer, km: trip.km, tons: trip.tons, freight: trip.freightCharged, cost: trip.fuel + trip.tolls })) })}>
            <header><Truck size={20} aria-hidden="true" /><strong>{row.vehicle.name}</strong><small>{row.vehicle.plate}</small></header>
            <div className="truck-bars">
              <span><i style={{ width: `${(row.freight / max) * 100}%` }} className="is-in" /><b>Frete cobrado {money(row.freight)}</b></span>
              <span><i style={{ width: `${(row.cost / max) * 100}%` }} className="is-out" /><b>Custo total {money(row.cost)}</b></span>
            </div>
            <dl>
              <div><dt>Viagens</dt><dd>{row.trips.length}</dd></div>
              <div><dt>Toneladas</dt><dd>{row.tons.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</dd></div>
              <div><dt>Manutenção</dt><dd>{money(row.maintenance)}</dd></div>
            </dl>
            <p className="truck-result">{row.result >= 0 ? "Se paga" : "Não se paga"} · <strong>{money(row.result)}</strong></p>
          </button>
        ))}
      </div>
      {drawer && <DetailDrawer selection={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function Patterns() {
  const tables = useDemoTables();
  const incidents = tables.erp.trips.filter((trip) => trip.incident);
  const byCustomer = new Map<string, typeof incidents>();
  for (const trip of incidents) byCustomer.set(trip.customer, [...(byCustomer.get(trip.customer) ?? []), trip]);
  const ranking = [...byCustomer.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="erp-grid">
      <p className="muted">Toda entrega com problema fica ligada ao cliente e ao caminhão. Assim aparece o padrão: “sempre que vai na fazenda X, volta quebrado”.</p>
      <div className="pattern-grid">
        {ranking.map(([customer, trips], index) => (
          <article key={customer} className={`pattern-card${trips.length > 1 ? " is-repeat" : ""}`} style={{ animationDelay: `${index * 60}ms` }}>
            <header><AlertTriangle size={18} aria-hidden="true" /><strong>{customer}</strong><span>{trips.length}×</span></header>
            <ul>{trips.map((trip) => <li key={trip.id}><b>{dateBr(trip.date)}</b> {trip.incident} <small>{trip.vehicle} · {trip.km} km · {trip.tons} t</small></li>)}</ul>
            {trips.length > 1 && <p className="erp-warn">Padrão de quebra: revise a rota ou o tipo de caminhão para este cliente.</p>}
          </article>
        ))}
        {ranking.length === 0 && <p className="muted">Nenhuma ocorrência registrada.</p>}
      </div>
    </div>
  );
}
