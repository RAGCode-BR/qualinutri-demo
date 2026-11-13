import { useMemo, useState } from "react";
import {
  ArrowDownUp, ArrowLeft, BarChart3, Boxes, Braces, Building2, ClipboardCheck, Copy, Factory, FileSpreadsheet, FileText, Filter, Landmark,
  Printer, Receipt, RotateCcw, Search, ShoppingCart, Truck, X,
} from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useNavigate } from "../../app/NavigationContext";
import { canAccessTab } from "../../layouts/AppSidebar";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { today } from "../../demo/store/ids";
import { addDays, isoDate } from "../../demo/store/ids";
import { requestCreditCustomer } from "../../demo/chat/service";
import { AREA_LABEL, FILTER_LABEL, cell, defaultFilters, type Area, type Drill, type FilterKey, type ReportDef, type ReportFilters, type ReportKpi, type Row, type Table } from "../../demo/reports/core";
import { REPORTS, REPORT_BY_ID, filterOptions } from "../../demo/reports/catalog";
import { download, fileSlug, formatValue, toCsv, toJson, toXlsx } from "../../demo/reports/export";
import { Sheet } from "../../components/demo/DetailSheets";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import { QuoteDocument } from "../../components/demo/docs/QuoteDocument";
import { LoadViewer3D } from "../../components/demo/LoadViewer3D";
import { ReportChart } from "./ReportCharts";
import { ReportDocument } from "./ReportDocument";
import { Sparkline } from "../../components/demo/Sparkline";

const AREA_ICON: Record<Area, typeof BarChart3> = { vendas: ShoppingCart, clientes: Building2, financeiro: Landmark, logistica: Truck, producao: Factory, qualidade: ClipboardCheck, fiscal: Receipt };
const RESTRICTED: Area[] = ["financeiro", "fiscal"];

/* Guarda o relatório aberto e os filtros ao sair e voltar para a tela (ex.: abrir o cliente 360° e voltar). */
const memory: { reportId: string | null; filters: Record<string, ReportFilters> } = { reportId: null, filters: {} };

type Preview = { kpi: ReportKpi | undefined; change: number | null; spark: number[]; bars: { label: string; value: number }[]; barFormat: ReportKpi["format"] };

/** Prévia ao vivo de cada relatório para a tela inicial (número principal, variação e minigráfico). */
function preview(report: ReportDef, tables: ReturnType<typeof useDemoTables>, filters: ReportFilters, now: Date): Preview {
  const result = report.run(tables, filters, now);
  const kpi = result.kpis[0];
  const change = kpi?.previous ? ((kpi.value - kpi.previous) / Math.abs(kpi.previous)) * 100 : null;
  const line = result.charts.find((chart) => chart.kind === "line");
  const bar = result.charts.find((chart): chart is Exclude<typeof chart, { kind: "line" }> => chart.kind !== "line");
  return {
    kpi,
    change,
    spark: line && line.kind === "line" ? line.points.map((point) => point.value) : [],
    bars: bar ? [...bar.items].sort((a, b) => b.value - a.value).slice(0, 3).map((item) => ({ label: item.label, value: item.value })) : [],
    barFormat: bar?.format ?? "number",
  };
}

const HIGHLIGHTS = ["vendas-periodo", "vendas-produto", "receber", "carteira"];

export function ReportsCenter() {
  const { profile } = useAuth();
  const tables = useDemoTables();
  const now = today();
  const [reportId, setReportId] = useState<string | null>(() => memory.reportId);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<Area | "all">("all");
  const isAdmin = profile?.role === "administrador";
  const allowed = REPORTS.filter((report) => isAdmin || !RESTRICTED.includes(report.area));
  const open = (id: string | null) => { memory.reportId = id; setReportId(id); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const previews = useMemo(() => {
    const filters = defaultFilters(now);
    return Object.fromEntries(allowed.map((report) => [report.id, preview(report, tables, filters, now)])) as Record<string, Preview>;
  }, [tables, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const report = reportId ? REPORT_BY_ID[reportId] : undefined;
  if (report && allowed.includes(report)) return <ReportView key={report.id} report={report} onBack={() => open(null)} onOpen={open} />;

  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const list = allowed.filter((item) => (area === "all" || item.area === area) && (!query || normalize(`${item.title} ${item.description} ${AREA_LABEL[item.area]}`).includes(normalize(query))));
  const areas = (Object.keys(AREA_LABEL) as Area[]).filter((key) => allowed.some((item) => item.area === key));
  const highlights = HIGHLIGHTS.map((id) => allowed.find((item) => item.id === id)).filter((item): item is ReportDef => !!item).slice(0, 3);
  const hero = ["vendas-periodo", "cargas", isAdmin ? "receber" : "funil", "conformidade"].map((id) => allowed.find((item) => item.id === id)).filter((item): item is ReportDef => !!item);
  const browsing = !query && area === "all";

  return (
    <div className="rc-home">
      <section className="rc-hero glass-dark">
        <div className="rc-hero-text">
          <p className="dash-greet"><BarChart3 size={14} aria-hidden="true" /> {allowed.length} relatórios · últimos 90 dias</p>
          <h2>Tudo da Qualinutri em um só lugar</h2>
          <p>Escolha um relatório, filtre como quiser, clique nos gráficos para detalhar e exporte em PDF ou Excel.</p>
          <label className="rc-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar relatório (ex.: produto, atraso, frota)" aria-label="Buscar relatório" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={14} aria-hidden="true" /></button>}</label>
        </div>
        <div className="rc-hero-tiles">
          {hero.map((item) => {
            const data = previews[item.id];
            return (
              <button key={item.id} type="button" className="rc-hero-tile" onClick={() => open(item.id)}>
                <span>{data.kpi?.label ?? item.title}</span>
                <strong>{data.kpi ? (data.kpi.text ?? formatValue(data.kpi.value, data.kpi.format)) : "—"}</strong>
                {data.spark.length > 1 && <Sparkline values={data.spark} width={150} height={30} tone="dark" />}
                <small>{item.title} →</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="rc-area-tabs" role="radiogroup" aria-label="Área">
        <button type="button" role="radio" aria-checked={area === "all"} onClick={() => setArea("all")}><BarChart3 size={16} aria-hidden="true" /><span>Todos</span><b>{allowed.length}</b></button>
        {areas.map((key) => {
          const Icon = AREA_ICON[key];
          return <button key={key} type="button" role="radio" aria-checked={area === key} className={`is-${key}`} onClick={() => setArea(key)}><Icon size={16} aria-hidden="true" /><span>{AREA_LABEL[key]}</span><b>{allowed.filter((item) => item.area === key).length}</b></button>;
        })}
      </div>

      {browsing && highlights.length > 0 && (
        <section className="rc-highlights">
          <h3>Mais usados</h3>
          <div>
            {highlights.map((item) => {
              const data = previews[item.id];
              const Icon = AREA_ICON[item.area];
              return (
                <button key={item.id} type="button" className="rc-highlight" onClick={() => open(item.id)}>
                  <header><span className={`rc-card-icon is-${item.area}`}><Icon size={18} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{AREA_LABEL[item.area]}</small></span></header>
                  <div className="rc-highlight-value">
                    <span>{data.kpi?.label}</span>
                    <strong>{data.kpi ? (data.kpi.text ?? formatValue(data.kpi.value, data.kpi.format)) : "—"}</strong>
                    {data.change !== null && <ChangeChip change={data.change} />}
                  </div>
                  {data.spark.length > 1 ? <Sparkline values={data.spark} width={320} height={56} /> : <MiniBars bars={data.bars} format={data.barFormat} />}
                  <span className="rc-card-go">Abrir relatório →</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {areas.filter((key) => list.some((item) => item.area === key)).map((key) => {
        const Icon = AREA_ICON[key];
        const items = list.filter((item) => item.area === key);
        return (
          <section key={key} className={`rc-area is-${key}`}>
            <h3><span className={`rc-card-icon is-${key}`}><Icon size={16} aria-hidden="true" /></span>{AREA_LABEL[key]}<small>{items.length} {items.length === 1 ? "relatório" : "relatórios"}</small></h3>
            <div className="rc-cards">
              {items.map((item, index) => {
                const data = previews[item.id];
                return (
                  <button key={item.id} type="button" className="rc-card" style={{ animationDelay: `${index * 40}ms` }} onClick={() => open(item.id)}>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                    <div className="rc-card-preview">
                      <div>
                        <span>{data.kpi?.label}</span>
                        <b>{data.kpi ? (data.kpi.text ?? formatValue(data.kpi.value, data.kpi.format)) : "—"}</b>
                      </div>
                      {data.change !== null && <ChangeChip change={data.change} />}
                      {data.spark.length > 1 && <Sparkline values={data.spark} width={220} height={30} />}
                    </div>
                    <span className="rc-card-go">Abrir →</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {list.length === 0 && <p className="rc-empty">Nenhum relatório encontrado para "{query}".</p>}
    </div>
  );
}

function ChangeChip({ change }: { change: number }) {
  return <small className={`rc-change ${change >= 0 ? "is-up" : "is-down"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</small>;
}

function MiniBars({ bars, format }: { bars: { label: string; value: number }[]; format: ReportKpi["format"] }) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <ul className="rc-minibars">
      {bars.map((bar) => <li key={bar.label}><span>{bar.label}</span><i style={{ width: `${Math.max(4, (bar.value / max) * 100)}%` }} /><b>{formatValue(bar.value, format === "text" ? "number" : format)}</b></li>)}
    </ul>
  );
}

/* ---------------------------------------------------------------- */

type Preset = { id: string; label: string; range: (now: Date) => [string, string] };
const PRESETS: Preset[] = [
  { id: "today", label: "Hoje", range: (now) => [isoDate(now), isoDate(now)] },
  { id: "7d", label: "7 dias", range: (now) => [isoDate(addDays(now, -6)), isoDate(now)] },
  { id: "30d", label: "30 dias", range: (now) => [isoDate(addDays(now, -29)), isoDate(now)] },
  { id: "month", label: "Este mês", range: (now) => [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(now)] },
  { id: "lastMonth", label: "Mês passado", range: (now) => [isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoDate(new Date(now.getFullYear(), now.getMonth(), 0))] },
  { id: "90d", label: "90 dias", range: (now) => [isoDate(addDays(now, -89)), isoDate(now)] },
  { id: "year", label: "Este ano", range: (now) => [isoDate(new Date(now.getFullYear(), 0, 1)), isoDate(now)] },
  { id: "next30", label: "Próximos 30 dias", range: (now) => [isoDate(now), isoDate(addDays(now, 30))] },
];

function ReportView({ report, onBack, onOpen }: { report: ReportDef; onBack: () => void; onOpen: (id: string) => void }) {
  const tables = useDemoTables();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const now = today();
  const [filters, setFiltersState] = useState<ReportFilters>(() => memory.filters[report.id] ?? defaultFilters(now));
  const setFilters = (next: ReportFilters) => { memory.filters[report.id] = next; setFiltersState(next); };
  const result = useMemo(() => report.run(tables, filters, now), [report, tables, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const [detail, setDetail] = useState<{ title: string; table: Table } | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);

  const optionLabel = (key: FilterKey, value: string) => filterOptions(tables, key, report).find((option) => option.value === value)?.label ?? value;
  const activePreset = PRESETS.find((preset) => { const [from, to] = preset.range(now); return from === filters.from && to === filters.to; })?.id;
  const filterLines = [`Período: ${formatValue(filters.from, "date")} a ${formatValue(filters.to, "date")}`, ...report.filters.filter((key) => filters[key]).map((key) => `${FILTER_LABEL[key]}: ${optionLabel(key, filters[key])}`)];
  const related = REPORTS.filter((item) => item.area === report.area && item.id !== report.id && (profile?.role === "administrador" || !RESTRICTED.includes(item.area))).slice(0, 4);

  function drill(target: Drill) {
    if (target.kind === "filter") {
      if (report.filters.includes(target.key)) setFilters({ ...filters, [target.key]: filters[target.key] === target.value ? "" : target.value });
      return;
    }
    if (target.kind === "period") { setFilters({ ...filters, from: target.from, to: target.to }); return; }
    if (target.kind === "quote") { setQuoteId(target.id); return; }
    if (target.kind === "load") { setLoadId(target.id); return; }
    if (target.kind === "customer" && canAccessTab("credit", profile)) { requestCreditCustomer(target.id); navigate("credit"); }
  }

  const base = `${fileSlug(report.title)}-${filters.from}-a-${filters.to}`;
  async function copyTable() {
    const text = toCsv(result.table).replace(/^﻿/, "").replace(/;/g, "\t");
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* sem permissão */ }
  }

  return (
    <div className="rc-view">
      <header className="rc-view-head">
        <button type="button" className="secondary-button compact-secondary" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />&nbsp;Todos os relatórios</button>
        <div className="rc-view-title">
          <p className="drawer-kicker">{AREA_LABEL[report.area]}</p>
          <h2>{report.title}</h2>
          <p className="muted">{report.description}</p>
        </div>
        <div className="rc-export" role="group" aria-label="Exportar">
          <button type="button" className="primary-button compact-button" onClick={() => setPrinting(true)}><Printer size={15} aria-hidden="true" />&nbsp;PDF</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => download(`${base}.xlsx`, toXlsx(report.title, filterLines, result.kpis, result.table), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}><FileSpreadsheet size={15} aria-hidden="true" />&nbsp;Excel</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => download(`${base}.csv`, toCsv(result.table), "text/csv;charset=utf-8")}><FileText size={15} aria-hidden="true" />&nbsp;CSV</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => download(`${base}.json`, toJson(report.title, Object.fromEntries(filterLines.map((line) => line.split(": "))), result.kpis, result.table), "application/json")}><Braces size={15} aria-hidden="true" />&nbsp;JSON</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => void copyTable()}><Copy size={15} aria-hidden="true" />&nbsp;{copied ? "Copiado!" : "Copiar"}</button>
        </div>
      </header>

      <section className="rc-filters" aria-label="Filtros">
        <div className="rc-presets" role="radiogroup" aria-label="Período">
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" role="radio" aria-checked={activePreset === preset.id} onClick={() => { const [from, to] = preset.range(now); setFilters({ ...filters, from, to }); }}>{preset.label}</button>
          ))}
        </div>
        <div className="rc-filter-row">
          <label className="rc-field"><span>De</span><input type="date" value={filters.from} max={filters.to} onChange={(event) => event.target.value && setFilters({ ...filters, from: event.target.value })} /></label>
          <label className="rc-field"><span>Até</span><input type="date" value={filters.to} min={filters.from} onChange={(event) => event.target.value && setFilters({ ...filters, to: event.target.value })} /></label>
          {report.filters.map((key) => (
            <label key={key} className="rc-field">
              <span>{FILTER_LABEL[key]}</span>
              <select value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}>
                <option value="">Todos</option>
                {filterOptions(tables, key, report).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <button type="button" className="secondary-button compact-secondary rc-clear" onClick={() => setFilters(defaultFilters(now))}><RotateCcw size={14} aria-hidden="true" />&nbsp;Limpar</button>
        </div>
        {report.filters.some((key) => filters[key]) && (
          <div className="rc-chips">
            <Filter size={14} aria-hidden="true" />
            {report.filters.filter((key) => filters[key]).map((key) => (
              <button key={key} type="button" onClick={() => setFilters({ ...filters, [key]: "" })}>{FILTER_LABEL[key]}: <strong>{optionLabel(key, filters[key])}</strong><X size={12} aria-hidden="true" /></button>
            ))}
          </div>
        )}
      </section>

      <section className="rc-kpis">
        {result.kpis.map((kpi, index) => <KpiTile key={kpi.id} kpi={kpi} index={index} onOpen={kpi.detail ? () => setDetail({ title: kpi.label, table: kpi.detail! }) : () => document.getElementById("rc-table")?.scrollIntoView({ behavior: "smooth" })} />)}
      </section>

      <section className={`rc-charts is-${result.charts.length}`}>
        {result.charts.map((chart) => <ReportChart key={chart.id} chart={chart} onDrill={drill} />)}
      </section>
      <p className="rc-hint">Dica: clique nas barras, fatias e pontos para filtrar; clique numa linha da tabela para abrir o pedido, a carga ou o cliente.</p>

      <DataTable id="rc-table" table={result.table} onRow={(row) => { if (row._drill) drill(row._drill); }} />

      {related.length > 0 && (
        <section className="rc-related">
          <h3>Relatórios relacionados</h3>
          <div>{related.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item.id)}>{item.title} →</button>)}</div>
        </section>
      )}

      {detail && (
        <Sheet variant="center" label={detail.title} onClose={() => setDetail(null)}>
          <div className="rc-detail">
            <p className="drawer-kicker">{report.title}</p>
            <h2>{detail.title}</h2>
            <DataTable table={detail.table} compact onRow={(row) => { if (row._drill) { setDetail(null); drill(row._drill); } }} />
          </div>
        </Sheet>
      )}
      {quoteId && <DocViewer title={`Orçamento nº ${tables.quotes.find((quote) => quote.id === quoteId)?.quote_number ?? ""}`} onClose={() => setQuoteId(null)}><QuoteDocument tables={tables} quoteId={quoteId} /></DocViewer>}
      {loadId && <LoadViewer3D loadId={loadId} onClose={() => setLoadId(null)} />}
      {printing && (
        <DocViewer
          title={`${report.title} · PDF`}
          subtitle={filterLines.join(" · ")}
          onClose={() => setPrinting(false)}
          actions={<div className="doc-viewer-actions"><button type="button" className="primary-button compact-button" onClick={() => { const previous = document.title; document.title = base; window.addEventListener("afterprint", () => { document.title = previous; }, { once: true }); window.print(); }}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir / salvar PDF</button></div>}
        >
          <ReportDocument title={report.title} area={AREA_LABEL[report.area]} filterLines={filterLines} result={result} />
        </DocViewer>
      )}
    </div>
  );
}

function KpiTile({ kpi, index, onOpen }: { kpi: ReportKpi; index: number; onOpen: () => void }) {
  const change = kpi.previous !== undefined && kpi.previous !== 0 ? ((kpi.value - kpi.previous) / Math.abs(kpi.previous)) * 100 : null;
  return (
    <button type="button" className={`rc-kpi${kpi.tone ? ` is-${kpi.tone}` : ""}`} style={{ animationDelay: `${index * 50}ms` }} onClick={onOpen} title={kpi.detail ? "Clique para ver a lista" : "Clique para ver a tabela"}>
      <span className="rc-kpi-label">{kpi.label}</span>
      {kpi.text ? <><strong className="rc-kpi-text">{kpi.text}</strong><small>{formatValue(kpi.value, kpi.format)}</small></> : <strong>{formatValue(kpi.value, kpi.format)}</strong>}
      {change !== null && <small className={`rc-kpi-change ${change >= 0 ? "is-up" : "is-down"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs período anterior</small>}
      {kpi.hint && <small>{kpi.hint}</small>}
      {kpi.detail && <small className="rc-kpi-more">ver lista →</small>}
    </button>
  );
}

const PAGE = 50;

export function DataTable({ id, table, onRow, compact = false }: { id?: string; table: Table; onRow?: (row: Row) => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rows = useMemo(() => {
    let list = table.rows;
    if (query) list = list.filter((row) => normalize(table.columns.map((column) => formatValue(cell(row, column.key), column.format)).join(" ")).includes(normalize(query)));
    if (sort) list = [...list].sort((a, b) => {
      const x = cell(a, sort.key), y = cell(b, sort.key);
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true }) * sort.dir;
    });
    return list;
  }, [table, query, sort]);
  const numeric = (format?: string) => !!format && format !== "text" && format !== "date";
  return (
    <section id={id} className={`rc-table${compact ? " is-compact" : ""}`}>
      <header>
        <h3>{table.title} <small>{rows.length} {rows.length === 1 ? "linha" : "linhas"}</small></h3>
        <label className="chat-search"><Search size={14} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} placeholder="Buscar na tabela" aria-label="Buscar na tabela" /></label>
      </header>
      <div className="rc-table-scroll">
        <table>
          <thead>
            <tr>{table.columns.map((column) => (
              <th key={column.key} className={numeric(column.format) ? "is-number" : undefined} aria-sort={sort?.key === column.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                <button type="button" onClick={() => setSort((current) => current?.key === column.key ? { key: column.key, dir: current.dir === 1 ? -1 : 1 } : { key: column.key, dir: numeric(column.format) ? -1 : 1 })}>{column.label}<ArrowDownUp size={11} aria-hidden="true" /></button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((row, index) => (
              <tr key={index} className={row._drill && onRow ? "is-clickable" : undefined} onClick={() => onRow?.(row)}>
                {table.columns.map((column) => <td key={column.key} className={numeric(column.format) ? "is-number" : undefined}>{formatValue(cell(row, column.key), column.format)}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={table.columns.length} className="rc-empty">Nada encontrado.</td></tr>}
          </tbody>
          {table.total && !query && <tfoot><tr>{table.columns.map((column) => <td key={column.key} className={numeric(column.format) ? "is-number" : undefined}>{cell(table.total!, column.key) === null ? "" : formatValue(cell(table.total!, column.key), column.format)}</td>)}</tr></tfoot>}
        </table>
      </div>
      {rows.length > limit && <button type="button" className="secondary-button compact-secondary rc-more" onClick={() => setLimit((value) => value + PAGE * 2)}>Mostrar mais ({rows.length - limit} restantes)</button>}
      {onRow && table.rows.some((row) => row._drill) && !compact && <p className="rc-hint"><Boxes size={13} aria-hidden="true" /> Linhas clicáveis abrem o detalhe.</p>}
    </section>
  );
}
