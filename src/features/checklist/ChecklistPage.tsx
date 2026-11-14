import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, ChevronRight, ClipboardCheck, Database, Kanban, LayoutGrid, List, Plus, Printer, Search, Truck } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { attentionList, costByTarget, overdueTargets, recordCost, summaryLine, tabSummary, targetsFor, upcomingMaintenance } from "../../demo/checklist/compliance";
import { moveStage } from "../../demo/checklist/service";
import { CHECKLIST_TABS, TAB_BY_ID } from "../../demo/checklist/tabs";
import type { ChecklistRecord, ChecklistTabId, RecordStatus } from "../../demo/checklist/types";
import { addDays, isoDate, today } from "../../demo/store/ids";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import { Sparkline } from "../../components/demo/Sparkline";
import { formatKpi } from "../../components/demo/format";
import { useCountUp } from "../../components/demo/useCountUp";
import { RecordDialog } from "./RecordDialog";
import { NewRequest, repairDraftFrom, type RepairDraft } from "../erp/FleetPage";
import { RegistryView } from "./RegistryView";
import { printTabReport } from "./report";
import { EvidenceThumb, Lightbox, Ring, StatusChip, formatDateTime, toneFor } from "./shared";

type View = "panel" | "registry" | ChecklistTabId;
type DialogState = { tab: ChecklistTabId; record?: ChecklistRecord; target?: string | null } | null;
const VIEW_KEY = "qualinutri-demo:checklist-view";

function Count({ value }: { value: number }) {
  return <>{Math.round(useCountUp(value, 700)).toLocaleString("pt-BR")}</>;
}

export function ChecklistPage() {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const canWrite = profile?.role !== "consulta";
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View | null) ?? "panel"; } catch { return "panel"; }
  });
  const [statusFilter, setStatusFilter] = useState<RecordStatus | "all">("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  // Item reprovado em veículo ou equipamento: oferece abrir o pedido de conserto na hora.
  const [repairOffer, setRepairOffer] = useState<RepairDraft | null>(null);
  const [repair, setRepair] = useState<RepairDraft | null>(null);
  const [notice, setNotice] = useState("");

  function onSaved(record: ChecklistRecord) {
    setNotice("");
    setRepairOffer(TAB_BY_ID[record.tab].target === "vehicle" ? repairDraftFrom(record) : null);
  }

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* sem armazenamento */ }
    document.querySelector(".ck-rail [aria-current='page']")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [view]);

  const now = today();
  const summaries = useMemo(() => Object.fromEntries(CHECKLIST_TABS.map((tab) => [tab.id, tabSummary(tab.id, tables, now)])), [tables]); // eslint-disable-line react-hooks/exhaustive-deps

  function open(tab: View, status: RecordStatus | "all" = "all") {
    setStatusFilter(status);
    setView(tab);
  }

  function openRecord(recordId: string) {
    const record = tables.checklist.records.find((item) => item.id === recordId);
    if (record) setDialog({ tab: record.tab, record });
  }

  return (
    <div className="ck-page">
      <nav className="ck-rail" aria-label="Abas do módulo">
        <button type="button" aria-current={view === "panel" ? "page" : undefined} onClick={() => open("panel")}><LayoutGrid size={16} aria-hidden="true" />Painel</button>
        {CHECKLIST_TABS.map((tab) => {
          const Icon = tab.icon;
          const summary = summaries[tab.id];
          const alerts = summary.nonConforming + summary.pending;
          return (
            <button key={tab.id} type="button" aria-current={view === tab.id ? "page" : undefined} onClick={() => open(tab.id)} title={tab.label}>
              <Icon size={16} aria-hidden="true" />{tab.short}
              {alerts > 0 && <span className={`ck-rail-badge${summary.nonConforming ? " is-bad" : ""}`}>{alerts}</span>}
            </button>
          );
        })}
        <button type="button" aria-current={view === "registry" ? "page" : undefined} onClick={() => open("registry")}><Database size={16} aria-hidden="true" />Cadastros</button>
      </nav>

      {repairOffer && (
        <div className="erp-notice ck-repair-offer" role="status">
          <span><AlertTriangle size={15} aria-hidden="true" /> {repairOffer.vehicle}: item reprovado na conferência.</span>
          <button type="button" className="primary-button compact-button" onClick={() => { setRepair(repairOffer); setRepairOffer(null); }}>Abrir pedido de conserto</button>
          <button type="button" className="link-button" onClick={() => setRepairOffer(null)}>Agora não</button>
        </div>
      )}
      {notice && <p className="erp-notice" role="status">{notice}</p>}
      <div className="page-enter" key={view}>
        {view === "panel" && <ConformityPanel summaries={summaries} onOpen={open} onOpenRecord={openRecord} />}
        {view === "registry" && <RegistryView canWrite={canWrite} />}
        {view !== "panel" && view !== "registry" && (
          <TabView tabId={view} initialStatus={statusFilter} canWrite={canWrite} onNew={(target) => setDialog({ tab: view, target })} onOpenRecord={(record) => setDialog({ tab: view, record })} />
        )}
      </div>

      {canWrite && view !== "registry" && (
        <button type="button" className="ck-fab" onClick={() => setDialog({ tab: view === "panel" ? "maintenance" : view })} aria-label="Novo registro">
          <Plus size={24} aria-hidden="true" />
        </button>
      )}
      {dialog && <RecordDialog tabId={dialog.tab} record={dialog.record} presetTarget={dialog.target} readOnly={!canWrite} onSaved={onSaved} onClose={() => setDialog(null)} />}
      {repair && <NewRequest initial={repair} onClose={() => setRepair(null)} onCreated={() => setNotice("Pedido de conserto enviado para a gestão aprovar (Frota → Pedidos de conserto).")} />}
    </div>
  );
}

type Summaries = Record<string, ReturnType<typeof tabSummary>>;

function ConformityPanel({ summaries, onOpen, onOpenRecord }: { summaries: Summaries; onOpen: (view: View, status?: RecordStatus | "all") => void; onOpenRecord: (id: string) => void }) {
  const tables = useDemoTables();
  const attention = useMemo(() => attentionList(tables, today()), [tables]);
  const totals = Object.values(summaries).reduce((sum, item) => ({ done: sum.done + item.done, pending: sum.pending + item.pending, nc: sum.nc + item.nonConforming }), { done: 0, pending: 0, nc: 0 });
  const overall = Math.round((totals.done / Math.max(1, totals.done + totals.pending + totals.nc)) * 100);
  const [showAll, setShowAll] = useState(false);
  const [drawerStatus, setDrawerStatus] = useState<RecordStatus | null>(null);
  const from = isoDate(addDays(today(), -29));

  return (
    <div className="ck-panel">
      <section className="ck-hero glass-dark">
        <Ring value={overall} size={120} stroke={11} tone={toneFor(overall)} />
        <div className="ck-hero-text">
          <p className="dash-greet"><ClipboardCheck size={16} aria-hidden="true" /> Conformidade geral · 30 dias</p>
          <h2>Checklist – Controles – Análises</h2>
          <p>Tudo o que foi feito, o que está pendente e o que saiu do padrão, por área. Clique em qualquer número para ver os registros.</p>
        </div>
        <div className="ck-hero-stats">
          <button type="button" onClick={() => setDrawerStatus("conforme")} className="is-good"><strong><Count value={totals.done} /></strong><span>Feitos e conformes</span></button>
          <button type="button" onClick={() => setDrawerStatus("pendente")} className="is-warn"><strong><Count value={totals.pending} /></strong><span>Pendentes</span></button>
          <button type="button" onClick={() => setDrawerStatus("nao_conforme")} className="is-bad"><strong><Count value={totals.nc} /></strong><span>Fora de conformidade</span></button>
        </div>
      </section>

      <section className="ck-grid" aria-label="Conformidade por área">
        {CHECKLIST_TABS.map((tab, index) => {
          const summary = summaries[tab.id];
          const Icon = tab.icon;
          return (
            <article key={tab.id} className="ck-card" style={{ animationDelay: `${index * 45}ms` }}>
              <button type="button" className="ck-card-main" onClick={() => onOpen(tab.id)}>
                <span className="ck-card-head"><span className="mega-icon"><Icon size={18} aria-hidden="true" /></span><strong>{tab.label}</strong></span>
                <span className="ck-card-body">
                  <Ring value={summary.pct} size={64} tone={toneFor(summary.pct)} />
                  <Sparkline values={summary.trend} width={110} height={34} />
                </span>
              </button>
              <div className="ck-card-stats">
                <button type="button" className="is-good" onClick={() => onOpen(tab.id, "conforme")}><strong>{summary.done}</strong>feitos</button>
                <button type="button" className="is-warn" onClick={() => onOpen(tab.id, "pendente")}><strong>{summary.pending}</strong>pendentes</button>
                <button type="button" className="is-bad" onClick={() => onOpen(tab.id, "nao_conforme")}><strong>{summary.nonConforming}</strong>fora</button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dash-card" id="ck-attention">
        <header className="dash-card-head">
          <h2>Precisa de atenção <span className="ck-count">{attention.length}</span></h2>
          {attention.length > 8 && <button type="button" className="link-button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Ver menos" : "Ver tudo"}</button>}
        </header>
        {attention.length === 0 ? <p className="muted">Nada pendente. Tudo em conformidade.</p> : (
          <ul className="alert-list ck-attention">
            {(showAll ? attention : attention.slice(0, 8)).map((item, index) => (
              <li key={item.id} style={{ animationDelay: `${index * 30}ms` }}>
                <button type="button" className={`alert-item is-${item.level}`} onClick={() => (item.recordId ? onOpenRecord(item.recordId) : onOpen(item.tab, "pendente"))}>
                  <span className="alert-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
                  <span className="alert-text"><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {drawerStatus && (
        <DetailDrawer
          selection={{
            title: drawerStatus === "conforme" ? "Registros conformes · 30 dias" : drawerStatus === "pendente" ? "Registros pendentes" : "Registros fora de conformidade",
            columns: [{ key: "date", label: "Data", format: "date" }, { key: "area", label: "Área" }, { key: "item", label: "Item" }, { key: "who", label: "Responsável" }],
            rows: tables.checklist.records
              .filter((record) => record.status === drawerStatus && (drawerStatus !== "conforme" || isoDate(new Date(record.date)) >= from))
              .map((record) => ({ id: record.id, date: isoDate(new Date(record.date)), area: TAB_BY_ID[record.tab].short, item: record.targetLabel ?? summaryLine(record.tab, record, tables), who: record.responsible })),
          }}
          onClose={() => setDrawerStatus(null)}
        />
      )}
    </div>
  );
}

type TabViewProps = {
  tabId: ChecklistTabId;
  initialStatus: RecordStatus | "all";
  canWrite: boolean;
  onNew: (target?: string | null) => void;
  onOpenRecord: (record: ChecklistRecord) => void;
};

function TabView({ tabId, initialStatus, canWrite, onNew, onOpenRecord }: TabViewProps) {
  const tab = TAB_BY_ID[tabId];
  const tables = useDemoTables();
  const now = today();
  const [status, setStatus] = useState<RecordStatus | "all">(initialStatus);
  const [days, setDays] = useState<30 | 90 | 0>(90);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"list" | "board" | "targets">(tab.stages ? "board" : "list");
  const [day, setDay] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type?: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setStatus(initialStatus); }, [initialStatus, tabId]);

  const summary = tabSummary(tabId, tables, now);
  const overdue = overdueTargets(tabId, tables, now);
  const upcoming = tabId === "maintenance" ? upcomingMaintenance(tables, now) : [];
  const all = tables.checklist.records.filter((record) => record.tab === tabId);
  const from = days ? isoDate(addDays(now, -days + 1)) : "";
  const needle = query.trim().toLowerCase();
  const records = all
    .filter((record) => status === "all" || record.status === status)
    .filter((record) => !from || isoDate(new Date(record.date)) >= from || (status === "pendente" && record.status === "pendente"))
    .filter((record) => !target || record.targetId === target)
    .filter((record) => !day || isoDate(new Date(record.date)) === day)
    .filter((record) => !needle || `${record.targetLabel ?? ""} ${summaryLine(tabId, record, tables)} ${record.responsible} ${record.notes}`.toLowerCase().includes(needle))
    .sort((a, b) => b.date.localeCompare(a.date));

  const daily = Array.from({ length: 30 }, (_, index) => {
    const key = isoDate(addDays(now, index - 29));
    const ofDay = all.filter((record) => isoDate(new Date(record.date)) === key);
    return { key, ok: ofDay.filter((record) => record.status === "conforme").length, nc: ofDay.filter((record) => record.status === "nao_conforme").length, open: ofDay.filter((record) => record.status === "pendente").length };
  });
  const maxDay = Math.max(1, ...daily.map((item) => item.ok + item.nc + item.open));
  const costs = tab.fields.some((field) => field.cost) ? costByTarget(tabId, tables) : null;
  const targetList = targetsFor(tabId, tables);
  const Icon = tab.icon;

  function onDrop(stage: string) {
    if (dragId && canWrite) void moveStage(dragId, stage);
    setDragId(null);
  }

  return (
    <div className="ck-tab">
      <header className="ck-tab-head">
        <span className="mega-icon"><Icon size={22} aria-hidden="true" /></span>
        <div>
          <h2>{tab.label}</h2>
          <p>{tab.description}</p>
          <span className="ck-rule"><AlertTriangle size={13} aria-hidden="true" /> Fora de conformidade: {tab.rule}</span>
        </div>
        <div className="ck-tab-actions">
          <button type="button" className="secondary-button compact-secondary" onClick={() => printTabReport(tabId, records, tables, days ? `últimos ${days} dias` : "todo o histórico")}><Printer size={16} aria-hidden="true" />&nbsp;Relatório</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => setDrawer(true)}>Exportar</button>
          {canWrite && <button type="button" className="primary-button compact-button" onClick={() => onNew(target || null)}><Plus size={16} aria-hidden="true" />&nbsp;Registrar</button>}
        </div>
      </header>

      <section className="kpi-strip">
        <button type="button" className="strip-card" onClick={() => setStatus("conforme")}><span className="strip-label">Conformes · 30 dias</span><strong className="strip-value"><Count value={summary.done} /></strong></button>
        <button type="button" className="strip-card is-warn" onClick={() => setStatus("pendente")}><span className="strip-label">Pendentes</span><strong className="strip-value"><Count value={summary.pending} /></strong>{summary.overdue > 0 && <span className="strip-caption">{summary.overdue} {tab.id === "maintenance" ? "revisões vencidas" : "atrasados"}</span>}</button>
        <button type="button" className="strip-card is-bad" onClick={() => setStatus("nao_conforme")}><span className="strip-label">Fora de conformidade</span><strong className="strip-value"><Count value={summary.nonConforming} /></strong></button>
        <button type="button" className="strip-card" onClick={() => setStatus("all")}><span className="strip-label">Conformidade</span><strong className="strip-value">{summary.pct}%</strong><span className="strip-caption">{summary.total} registros em 30 dias</span></button>
        {costs && <button type="button" className="strip-card" onClick={() => setMode("targets")}><span className="strip-label">Custo · 30 dias</span><strong className="strip-value">{formatKpi(summary.cost, "currency", true)}</strong><span className="strip-caption">Ver por veículo</span></button>}
      </section>

      <section className="dash-card ck-chart">
        <header className="dash-card-head"><h2>Registros por dia</h2>{day && <button type="button" className="link-button" onClick={() => setDay(null)}>Limpar dia {day.split("-").reverse().slice(0, 2).join("/")}</button>}</header>
        <div className="ck-bars">
          {daily.map((item, index) => (
            <button type="button" key={item.key} className={day === item.key ? "is-active" : undefined} title={`${item.key.split("-").reverse().join("/")}: ${item.ok} conformes, ${item.open} pendentes, ${item.nc} fora`} onClick={() => setDay(day === item.key ? null : item.key)} style={{ animationDelay: `${index * 15}ms` }}>
              <span className="ck-bar-stack" style={{ height: `${((item.ok + item.nc + item.open) / maxDay) * 100}%` }}>
                {item.nc > 0 && <span className="is-bad" style={{ flex: item.nc }} />}
                {item.open > 0 && <span className="is-warn" style={{ flex: item.open }} />}
                {item.ok > 0 && <span className="is-good" style={{ flex: item.ok }} />}
              </span>
            </button>
          ))}
        </div>
      </section>

      {(overdue.length > 0 || upcoming.length > 0) && (
        <section className="dash-card ck-overdue">
          <header className="dash-card-head"><h2>{tab.id === "maintenance" ? "Revisões vencidas e próximas" : `${tab.targetLabel ?? "Itens"} com registro atrasado`}</h2></header>
          <div className="ck-overdue-list">
            {[...overdue.map((item) => ({ ...item, late: true })), ...upcoming.map((item) => ({ ...item, late: false }))].map((item) => (
              <div key={item.id} className={`ck-overdue-item${item.late ? " is-late" : ""}`}>
                <div><strong>{item.label}</strong><small>{item.late ? "Venceu" : "Vence"} em {item.dueDate.split("-").reverse().join("/")}{item.lastDate ? ` · último ${item.lastDate.split("-").reverse().join("/")}` : ""}</small></div>
                {canWrite && <button type="button" className="link-button" onClick={() => onNew(item.id)}>{tab.id === "maintenance" ? "Registrar revisão" : "Registrar agora"}</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ck-toolbar">
        <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
          {(["all", "conforme", "pendente", "nao_conforme"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={status === value} onClick={() => setStatus(value)}>{value === "all" ? "Todos" : value === "conforme" ? "Conformes" : value === "pendente" ? "Pendentes" : "Fora"}</button>
          ))}
        </div>
        <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Período">
          {([30, 90, 0] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={days === value} onClick={() => setDays(value)}>{value ? `${value} dias` : "Tudo"}</button>)}
        </div>
        {targetList.length > 0 && (
          <select className="ck-target-filter" value={target} onChange={(event) => setTarget(event.target.value)} aria-label={tab.targetLabel}>
            <option value="">Todos: {tab.targetLabel?.toLowerCase()}</option>
            {targetList.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        )}
        <label className="drawer-search ck-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Visualização">
          <button type="button" role="radio" aria-checked={mode === "list"} onClick={() => setMode("list")} title="Lista"><List size={16} aria-hidden="true" /></button>
          {tab.stages && <button type="button" role="radio" aria-checked={mode === "board"} onClick={() => setMode("board")} title="Quadro"><Kanban size={16} aria-hidden="true" /></button>}
          {targetList.length > 0 && <button type="button" role="radio" aria-checked={mode === "targets"} onClick={() => setMode("targets")} title={`Por ${tab.targetLabel?.toLowerCase()}`}><Truck size={16} aria-hidden="true" /></button>}
        </div>
      </section>

      {mode === "list" && (
        <section className="ck-list" aria-label="Registros">
          {records.length === 0 && <p className="drawer-empty">Nenhum registro com esses filtros.</p>}
          {records.slice(0, 120).map((record, index) => (
            <div role="button" tabIndex={0} key={record.id} className={`ck-row is-${record.status}`} onClick={() => onOpenRecord(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenRecord(record); } }} style={{ animationDelay: `${Math.min(index, 20) * 20}ms` }}>
              <span className="ck-row-date">{formatDateTime(record.date)}</span>
              <span className="ck-row-main"><strong>{record.targetLabel ?? summaryLine(tabId, record, tables)}</strong><small>{record.responsible}{record.stage ? ` · ${record.stage}` : ""}{recordCost(tabId, record.values) ? ` · ${formatKpi(recordCost(tabId, record.values), "currency")}` : ""}</small></span>
              <span className="ck-row-thumbs">{record.evidence.slice(0, 3).map((item) => <EvidenceThumb key={item.id} evidence={item} onOpen={(url, type) => setPreview({ url, type })} />)}</span>
              <StatusChip status={record.status} />
            </div>
          ))}
          {records.length > 120 && <p className="muted">Mostrando 120 de {records.length}. Use os filtros ou exporte a lista.</p>}
        </section>
      )}

      {mode === "board" && tab.stages && (
        <section className="ck-board" aria-label="Quadro por etapa (arraste os cartões)">
          {tab.stages.map((stage) => {
            const cards = records.filter((record) => record.stage === stage).slice(0, stage === tab.stages!.at(-1) ? 12 : 60);
            return (
              <div key={stage} className="ck-column" onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => onDrop(stage)}>
                <h3>{stage}<span>{records.filter((record) => record.stage === stage).length}</span></h3>
                {cards.map((record) => (
                  <article key={record.id} className={`ck-kcard is-${record.status}${dragId === record.id ? " is-dragging" : ""}`} draggable={canWrite} onDragStart={() => setDragId(record.id)} onDragEnd={() => setDragId(null)} onClick={() => onOpenRecord(record)}>
                    <strong>{record.targetLabel ?? summaryLine(tabId, record, tables)}</strong>
                    <small>{formatDateTime(record.date)} · {record.responsible}</small>
                    <StatusChip status={record.status} />
                  </article>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {mode === "targets" && (
        <section className="dash-card">
          <table className="ck-target-table">
            <thead><tr><th>{tab.targetLabel}</th><th>Registros</th><th>Último</th><th>Fora</th>{costs && <th className="is-number">Custo acumulado</th>}</tr></thead>
            <tbody>
              {targetList.map((item) => {
                const mine = all.filter((record) => record.targetId === item.id);
                return (
                  <tr key={item.id} onClick={() => { setTarget(item.id); setMode("list"); }}>
                    <td><strong>{item.label}</strong>{item.sub && <small> · {item.sub}</small>}</td>
                    <td>{mine.length}</td>
                    <td>{mine[0] ? formatDateTime(mine.sort((a, b) => b.date.localeCompare(a.date))[0].date) : "—"}</td>
                    <td>{mine.filter((record) => record.status === "nao_conforme").length}</td>
                    {costs && <td className="is-number">{formatKpi(costs.get(item.id) ?? 0, "currency")}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {preview && <Lightbox url={preview.url} type={preview.type} onClose={() => setPreview(null)} />}
      {drawer && (
        <DetailDrawer
          selection={{
            title: `${tab.label} · registros filtrados`,
            columns: [{ key: "date", label: "Data", format: "date" }, { key: "item", label: "Item" }, { key: "who", label: "Responsável" }, { key: "status", label: "Situação" }, { key: "evidence", label: "Evidências", format: "number" }],
            rows: records.map((record) => ({ id: record.id, date: isoDate(new Date(record.date)), item: record.targetLabel ?? summaryLine(tabId, record, tables), who: record.responsible, status: record.status === "conforme" ? "Conforme" : record.status === "pendente" ? "Pendente" : "Fora de conformidade", evidence: record.evidence.length })),
          }}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  );
}
