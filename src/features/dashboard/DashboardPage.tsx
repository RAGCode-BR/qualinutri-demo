import { useMemo, useState, type DragEvent } from "react";
import { ArrowUpRight, CalendarClock, Sparkles } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useNavigate } from "../../app/NavigationContext";
import { canAccessTab, tabLabels } from "../../layouts/AppSidebar";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { cashflow, dashboardKpis, funnelSelection, periodFor, statusFunnel, type DrawerSelection, type Kpi, type KpiId, type PeriodKey } from "../../demo/kpis/dashboard";
import { attentionList, tabSummary } from "../../demo/checklist/compliance";
import { CHECKLIST_TABS } from "../../demo/checklist/tabs";
import { Ring, toneFor } from "../checklist/shared";
import { addDays, isoDate, today as demoToday } from "../../demo/store/ids";
import { AreaChart, BarList, CashflowBars } from "../../components/demo/Charts";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import { KpiCard } from "../../components/demo/KpiCard";
import { DaySheet, ProductSheet, QuoteSheet, WeekSheet } from "../../components/demo/DetailSheets";
import { KpiSheet } from "../../components/demo/KpiSheets";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { formatKpi } from "../../components/demo/format";
import { useCountUp } from "../../components/demo/useCountUp";
import type { TabId } from "../../layouts/AppSidebar";
import { REAL_KPI_IDS, realDaySelection, realMonthNet, realProductRanking, realRecentDocs, withRealKpis } from "../../demo/history/dashboard";
import { customerName, sellerName } from "../../demo/history/sales";
import { HistoryDetail, type HistorySelection } from "../reports-center/HistoryDetail";

const ORDER_KEY = "qualinutri-demo:dashboard-order";
const periodLabels: Record<PeriodKey, string> = { today: "Hoje", "7d": "7 dias", month: "Mês" };

function readOrder(): KpiId[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function greeting(date: Date) {
  const hour = date.getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

type OpenDrawer = { selection: DrawerSelection; target?: TabId };
type OpenSheet = { kind: "kpi"; kpi: Kpi } | { kind: "quote"; id: string } | { kind: "product"; name: string } | { kind: "day"; day: string } | { kind: "week"; index: number };

export function DashboardPage() {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { openCalculatorForCustomer } = useQuoteEditing();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [order, setOrder] = useState<KpiId[] | null>(readOrder);
  const [dragId, setDragId] = useState<KpiId | null>(null);
  const [drawer, setDrawer] = useState<OpenDrawer | null>(null);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [detail, setDetail] = useState<HistorySelection | null>(null);
  const now = demoToday();
  const period = periodFor(periodKey, now);

  const kpis = useMemo(() => withRealKpis(dashboardKpis(tables, period, now), period, now), [tables, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const sales = kpis.find((kpi) => kpi.id === "sales")!;
  const cards = useMemo(() => {
    const rest = kpis.filter((kpi) => kpi.id !== "sales");
    if (!order) return rest;
    return [...rest].sort((a, b) => {
      const left = order.indexOf(a.id);
      const right = order.indexOf(b.id);
      return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    });
  }, [kpis, order]);

  const trend = sales.trend; // eslint-disable-line react-hooks/exhaustive-deps
  const trendLabels = trend.map((_, index) => isoDate(addDays(now, index - trend.length + 1)).split("-").reverse().slice(0, 2).join("/"));
  const ranking = useMemo(() => realProductRanking().slice(0, 5), []);
  const funnel = statusFunnel(tables, period);
  const weeks = useMemo(() => cashflow(tables, now, 28), [tables]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = realRecentDocs(6);
  const animatedSales = useCountUp(sales.value, 1100);
  const name = (profile?.displayName || profile?.login || "").split(" ")[0];
  const compliance = useMemo(() => {
    const items = CHECKLIST_TABS.map((tab) => ({ tab, summary: tabSummary(tab.id, tables, now) }));
    const totals = items.reduce((sum, item) => ({ done: sum.done + item.summary.done, other: sum.other + item.summary.pending + item.summary.nonConforming }), { done: 0, other: 0 });
    const attention = attentionList(tables, now);
    return {
      pct: Math.round((totals.done / Math.max(1, totals.done + totals.other)) * 100),
      worst: items.sort((a, b) => a.summary.pct - b.summary.pct).slice(0, 4).map(({ tab, summary }) => ({
        id: tab.id, label: tab.label, pct: summary.pct,
        selection: {
          title: `${tab.label} · registros fora ou pendentes`,
          columns: [{ key: "date", label: "Data", format: "date" as const }, { key: "item", label: "Item" }, { key: "who", label: "Responsável" }, { key: "status", label: "Situação" }],
          rows: tables.checklist.records.filter((record) => record.tab === tab.id && record.status !== "conforme").slice(0, 80)
            .map((record) => ({ id: record.id, date: isoDate(new Date(record.date)), item: record.targetLabel ?? record.stage ?? "Registro", who: record.responsible, status: record.status === "pendente" ? "Pendente" : "Fora de conformidade" })),
        },
      })),
      attention: { title: "Checklist · precisa de atenção", columns: [{ key: "title", label: "O quê" }, { key: "detail", label: "Detalhe" }], rows: attention.map((item) => ({ id: item.id, title: item.title, detail: item.detail })) },
    };
  }, [tables]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveOrder(next: KpiId[]) {
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ }
  }

  function move(id: KpiId, toIndex: number) {
    const ids = cards.map((card) => card.id).filter((item) => item !== id);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
    saveOrder(ids);
  }

  function open(kpi: Kpi) {
    if (kpi.id === "topProduct" && ranking[0]) { setDetail({ kind: "product", code: ranking[0].code, unit: ranking[0].unit }); return; }
    if (REAL_KPI_IDS.has(kpi.id)) { setDrawer({ selection: kpi.selection, target: kpi.target }); return; }
    setSheet({ kind: "kpi", kpi });
  }

  function openList(kpi: Kpi) {
    setSheet(null);
    setDrawer({ selection: kpi.selection, target: kpi.target });
  }


  return (
    <div className="dashboard">
      <section className="dash-hero glass-dark">
        <div className="dash-hero-top">
          <div>
            <p className="dash-greet"><Sparkles size={16} aria-hidden="true" /> {greeting(now)}{name ? `, ${name}` : ""}</p>
            <p className="dash-date">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div className="segmented-glass" role="radiogroup" aria-label="Período">
            {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={periodKey === key} onClick={() => setPeriodKey(key)}>{periodLabels[key]}</button>
            ))}
          </div>
        </div>
        <button type="button" className="dash-hero-main" onClick={() => open(sales)}>
          <span className="dash-hero-label">Vendas líquidas · {periodLabels[periodKey].toLowerCase()} · TGA</span>
          <strong className="dash-hero-value">{formatKpi(animatedSales, "currency")}</strong>
          <span className="dash-hero-caption">{sales.caption} · clique para ver a lista <ArrowUpRight size={15} aria-hidden="true" /></span>
        </button>
        <AreaChart values={trend} labels={trendLabels} onSelect={(index) => setDrawer({ selection: realDaySelection(isoDate(addDays(now, index - trend.length + 1))), target: "sellers" })} />
      </section>

      {(() => {
        const monthKey = isoDate(now).slice(0, 7);
        const billed = realMonthNet(monthKey);
        const goal = tables.erp.monthlyGoal;
        const missing = Math.max(0, goal - billed);
        const days = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());
        return (
          <button type="button" className="dash-goal" onClick={() => canAccessTab("finance", profile) && navigate("finance")}>
            <span className="dash-goal-text"><strong>Meta do mês: {formatKpi(billed, "currency", true)} de {formatKpi(goal, "currency", true)}</strong><small>{missing ? `Faltam ${formatKpi(missing, "currency", true)} · ${formatKpi(missing / days, "currency", true)} por dia nos próximos ${days} dias` : "Meta batida!"}</small></span>
            <span className="erp-goal-bar"><span style={{ width: `${Math.min(100, (billed / goal) * 100)}%` }} /></span>
            <b>{Math.round((billed / goal) * 100)}%</b>
          </button>
        );
      })()}

      <section className="kpi-grid" aria-label="Indicadores (arraste para reorganizar)">
        {cards.map((kpi, index) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            index={index}
            dragging={dragId === kpi.id}
            onOpen={() => open(kpi)}
            onDragStart={(event: DragEvent) => { setDragId(kpi.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", kpi.id); }}
            onDragOver={(event: DragEvent) => { event.preventDefault(); if (dragId && dragId !== kpi.id) move(dragId, index); }}
            onDrop={(event: DragEvent) => event.preventDefault()}
            onDragEnd={() => setDragId(null)}
            onMove={(delta) => move(kpi.id, index + delta)}
          />
        ))}
      </section>

      <div className="dash-columns">
        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Produtos mais vendidos · 01–13/11</h2>
            <button type="button" className="link-button" onClick={() => open(kpis.find((kpi) => kpi.id === "topProduct")!)}>Ver ranking</button>
          </header>
          <BarList
            format="currency"
            items={ranking.map((item) => ({ label: item.name, value: item.value, sub: `${item.quantity.toLocaleString("pt-BR")} ${item.unit}` }))}
            onSelect={(index) => setDetail({ kind: "product", code: ranking[index].code, unit: ranking[index].unit })}
          />
        </section>

        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Fluxo de caixa · 4 semanas</h2>
            <span className="kpi-sim">simulado</span>
          </header>
          <CashflowBars weeks={weeks} onSelect={(index) => setSheet({ kind: "week", index })} />
          <div className="cashflow-legend"><span className="legend-in">Entradas</span><span className="legend-out">Saídas</span></div>
        </section>

        {canAccessTab("checklist", profile) && (
          <section className="dash-card dash-compliance">
            <header className="dash-card-head">
              <h2>Conformidade operacional · 30 dias</h2>
              <button type="button" className="link-button" onClick={() => navigate("checklist")}>Abrir módulo</button>
            </header>
            <div className="dash-compliance-body">
              <button type="button" className="dash-compliance-ring" onClick={() => navigate("checklist")}><Ring value={compliance.pct} size={110} stroke={10} tone={toneFor(compliance.pct)} /></button>
              <ul className="dash-compliance-list">
                {compliance.worst.map((item) => (
                  <li key={item.id}><button type="button" onClick={() => setDrawer({ selection: item.selection })}><span>{item.label}</span><strong className={`is-${toneFor(item.pct)}`}>{item.pct}%</strong></button></li>
                ))}
              </ul>
            </div>
            <button type="button" className="dash-compliance-alert" onClick={() => setDrawer({ selection: compliance.attention })}>{compliance.attention.rows.length} itens precisam de atenção →</button>
          </section>
        )}

        <section className="dash-card">
          <header className="dash-card-head"><h2>Funil de orçamentos</h2></header>
          <ol className="funnel">
            {([
              { key: "created", label: "Criados", value: funnel.created },
              { key: "issued", label: "Enviados", value: funnel.issued },
              { key: "approved", label: "Aprovados", value: funnel.approved },
            ] as const).map((step, index) => (
              <li key={step.label} style={{ width: `${funnel.created ? Math.max(28, (step.value / funnel.created) * 100) : 28}%`, animationDelay: `${index * 90}ms` }}>
                <button type="button" onClick={() => setDrawer({ selection: funnelSelection(tables, period, step.key), target: "quotes" })}><span>{step.label}</span><strong>{step.value}</strong></button>
              </li>
            ))}
          </ol>
          <button type="button" className="link-button" onClick={() => setDrawer({ selection: funnelSelection(tables, period, "cancelled"), target: "quotes" })}>{funnel.cancelled} cancelados no período</button>
        </section>

        <section className="dash-card">
          <header className="dash-card-head">
            <h2>Vendas recentes</h2>
            {canAccessTab("sellers", profile) && <button type="button" className="link-button" onClick={() => navigate("sellers")}>Abrir {tabLabels.sellers}</button>}
          </header>
          <ul className="activity">
            {recent.map((doc, index) => (
              <li key={`${doc.document}-${doc.customerCode}`} style={{ animationDelay: `${index * 60}ms` }}>
                <button type="button" onClick={() => setDetail({ kind: "document", document: doc.document, customerCode: doc.customerCode })}>
                  <span className={`activity-dot is-${doc.net < 0 ? "cancelled" : "approved"}`} aria-hidden="true" />
                  <span className="activity-text">
                    <strong>{doc.document} · {customerName(doc)}</strong>
                    <small><CalendarClock size={12} aria-hidden="true" /> {doc.date.split("-").reverse().slice(0, 2).join("/")} · {sellerName(doc.seller)} · {doc.status || "sem status"}</small>
                  </span>
                  <span className="activity-value">{formatKpi(doc.net, "currency", true)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {sheet?.kind === "kpi" && (
        <KpiSheet
          kpi={kpis.find((item) => item.id === sheet.kpi.id) ?? sheet.kpi}
          tables={tables}
          period={period}
          today={now}
          onList={() => openList(sheet.kpi)}
          onOpenQuote={(id) => setSheet({ kind: "quote", id })}
          onNewQuote={canAccessTab("calculator", profile) ? (customer) => { setSheet(null); openCalculatorForCustomer(customer); } : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "quote" && <QuoteSheet tables={tables} quoteId={sheet.id} onOpen={canAccessTab("quotes", profile) ? () => { setSheet(null); navigate("quotes"); } : undefined} onClose={() => setSheet(null)} />}
      {sheet?.kind === "product" && <ProductSheet tables={tables} productName={sheet.name} from={period.from} to={period.to} onOpen={() => { setSheet(null); navigate("prices"); }} onClose={() => setSheet(null)} />}
      {sheet?.kind === "day" && <DaySheet tables={tables} day={sheet.day} onOpenQuote={(id) => setSheet({ kind: "quote", id })} onClose={() => setSheet(null)} />}
      {sheet?.kind === "week" && <WeekSheet tables={tables} today={now} weekIndex={sheet.index} onClose={() => setSheet(null)} />}
      {detail && <HistoryDetail selection={detail} onSelect={setDetail} onSeller={() => { setDetail(null); navigate("sellers"); }} onClose={() => setDetail(null)} />}
      {drawer && (
        <DetailDrawer
          selection={drawer.selection}
          targetLabel={drawer.target && canAccessTab(drawer.target, profile) ? tabLabels[drawer.target] : undefined}
          onOpenTarget={drawer.target ? () => { const target = drawer.target!; setDrawer(null); navigate(target); } : undefined}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
