import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Truck, Wrench, XCircle } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { recordCost } from "../../demo/checklist/compliance";
import { createFleetRequest, decideFleetRequest, finishFleetRequest } from "../../demo/erp/service";
import type { FleetRequest } from "../../demo/erp/types";
import { Sheet } from "../../components/demo/DetailSheets";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { Stat, Tabs, dateBr, money } from "./shared";
import { FileDropZone } from "../../components/demo/FileDropZone";
import { storeEvidence } from "../../demo/checklist/evidence";
import type { EvidenceRef } from "../../demo/checklist/types";
import { EvidenceThumb } from "../checklist/shared";

type Section = "requests" | "profit" | "patterns";
const statusLabel: Record<FleetRequest["status"], string> = { aguardando: "Aguardando aprovação", aprovado: "Aprovado · em execução", recusado: "Recusado", concluido: "Concluído" };

export function FleetPage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("requests");
  const waiting = tables.erp.fleetRequests.filter((item) => item.status === "aguardando").length;
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[{ id: "requests", label: "Pedidos de conserto", badge: waiting }, { id: "profit", label: "Frete × custo por caminhão" }, { id: "patterns", label: "Padrões de quebra" }]} />
      <div className="page-enter" key={section}>
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
      <p className="muted">Já gasto neste veículo: <strong>{money(totalHistory)}</strong> em {history.length ? "manutenções registradas" : "nenhuma manutenção registrada"}.</p>
      {request.status === "aguardando" && (isAdmin ? (
        <div className="erp-actions-row is-end">
          <button type="button" className="secondary-button compact-secondary" onClick={() => void decideFleetRequest(request.id, false)}><XCircle size={15} aria-hidden="true" />&nbsp;Recusar</button>
          <button type="button" className="primary-button compact-button" onClick={() => void decideFleetRequest(request.id, true, chosen)}><CheckCircle2 size={15} aria-hidden="true" />&nbsp;Aprovar {request.quotes[chosen]?.shop}</button>
        </div>
      ) : <p className="erp-notice">Aguardando a gestão aprovar. Troque para o perfil Administrador para aprovar.</p>)}
      {request.status === "aprovado" && <button type="button" className="primary-button" onClick={() => void finishFleetRequest(request.id)}>Marcar como concluído</button>}
    </div>
  );
}

function NewRequest({ onClose }: { onClose: () => void }) {
  const tables = useDemoTables();
  const [vehicle, setVehicle] = useState(tables.vehicles[0]?.name ?? "");
  const [problem, setProblem] = useState("");
  const [quotes, setQuotes] = useState([{ shop: "Auto Diesel Juruena", value: 0, days: 2 }, { shop: "Oficina interna", value: 0, days: 1 }]);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<EvidenceRef[]>([]);
  async function addFiles(list: FileList) {
    const stored = await Promise.all([...list].slice(0, 8).map((file) => storeEvidence(file)));
    setFiles((current) => [...current, ...stored]);
  }
  async function save() {
    try {
      await createFleetRequest({ vehicle, problem, quotes: quotes.filter((quote) => quote.value > 0) });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro.");
    }
  }
  return (
    <Sheet variant="center" label="Novo pedido de conserto" onClose={onClose}>
      <form className="kpi-sheet" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2>Novo pedido de conserto</h2>
        <div className="field"><label htmlFor="fr-vehicle">Veículo</label><select id="fr-vehicle" className="ck-target-filter" value={vehicle} onChange={(event) => setVehicle(event.target.value)}>{[...tables.vehicles.map((item) => item.name), ...tables.checklist.equipment.filter((item) => item.kind !== "Produção" && item.kind !== "Envase").map((item) => item.name)].map((name) => <option key={name}>{name}</option>)}</select></div>
        <div className="field"><label htmlFor="fr-problem">O que aconteceu</label><textarea id="fr-problem" rows={2} value={problem} onChange={(event) => setProblem(event.target.value)} /></div>
        <h3>Orçamentos</h3>
        {quotes.map((quote, index) => (
          <div key={index} className="ck-form-grid">
            <div className="field"><label>Oficina</label><input value={quote.shop} onChange={(event) => setQuotes((current) => current.map((row, position) => position === index ? { ...row, shop: event.target.value } : row))} /></div>
            <div className="field"><label>Valor (R$)</label><input type="number" value={quote.value || ""} onChange={(event) => setQuotes((current) => current.map((row, position) => position === index ? { ...row, value: Number(event.target.value) } : row))} /></div>
          </div>
        ))}
        <button type="button" className="link-button" onClick={() => setQuotes((current) => [...current, { shop: "", value: 0, days: 1 }])}>+ Outro orçamento</button>
        <h3>Fotos do problema e orçamentos em PDF</h3>
        <FileDropZone compact onFiles={(list) => void addFiles(list)} label="Arraste fotos do defeito e os orçamentos das oficinas" />
        {files.length > 0 && <div className="ck-thumbs">{files.map((file) => <EvidenceThumb key={file.id} evidence={file} />)}</div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="erp-actions-row is-end"><button type="button" className="secondary-button compact-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button compact-button">Enviar para aprovação</button></div>
      </form>
    </Sheet>
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
