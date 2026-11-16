import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, HandCoins, Landmark, Link2, Plus, QrCode, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { anticipatedKeys, averagedDiscount, billingWindow, discountTitle, discountable, titleKey } from "../../demo/erp/finance";
import { anticipate, createPayable, createReceivable, payPayable, receiveTitle, reconcile, reconcileAllSuggested } from "../../demo/erp/service";
import type { Anticipation, BankId } from "../../demo/erp/types";
import { openPayables, receivables, titleRef } from "../../demo/kpis/finance";
import { addDays, isoDate, today } from "../../demo/store/ids";
import { PAYABLE_CATEGORIES, type Payable, type PayableCategory } from "../../demo/store/types";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import { Sheet } from "../../components/demo/DetailSheets";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { Dialog } from "../../components/Dialog";
import { CreditDialog, SettlementDialog, SettlementHistory, TitleSearch, initialTitleFilter, matchesTitleFilter } from "./FinanceTitles";
import type { Report } from "../../demo/erp/cashReports";
import { CashWorkspace, ReportViewer } from "./CashWorkspace";
import { CASH_ACCOUNTS } from "../../demo/erp/cash";
import { Chip, Stat, Tabs, dateBr, money } from "./shared";

type Section = "overview" | "payables" | "receivables" | "anticipation" | "reconciliation" | "cash";

export function FinancePage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("overview");
  const pendingLines = tables.erp.statement.filter((line) => !line.matched).length;
  const todayKey = isoDate(today());
  const latePayables = openPayables(tables).filter((item) => item.dueDate < todayKey).length;
  const done = anticipatedKeys(tables);
  const lateReceivables = receivables(tables, today()).filter((item) => !item.paidAt && item.dueDate < todayKey && !done.has(titleKey(item))).length;
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[
        { id: "overview", label: "Visão geral" },
        { id: "payables", label: "Contas a pagar", badge: latePayables },
        { id: "receivables", label: "Contas a receber", badge: lateReceivables },
        { id: "anticipation", label: "Antecipação de títulos" },
        { id: "cash", label: "Caixa e relatórios" },
        { id: "reconciliation", label: "Conciliação Sicoob/Itaú", badge: pendingLines },
      ]} />
      <div className="page-enter" key={section}>
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "anticipation" && <AnticipationView />}
        {section === "cash" && <CashWorkspace />}
        {section === "reconciliation" && <Reconciliation />}
        {section === "payables" && <Payables />}
        {section === "receivables" && <Receivables />}
      </div>
    </div>
  );
}

function Overview({ onGo }: { onGo: (section: Section) => void }) {
  const tables = useDemoTables();
  const now = today();
  const todayKey = isoDate(now);
  const [drawer, setDrawer] = useState<DrawerSelection | null>(null);
  const all = receivables(tables, now);
  const toReceive = all.filter((item) => !item.paidAt && item.dueDate >= todayKey);
  const late = all.filter((item) => !item.paidAt && item.dueDate < todayKey);
  const payables = openPayables(tables);
  const months = billingWindow(tables, now);
  const maxMonth = Math.max(1, ...months.map((month) => month.billed));
  const monthKey = todayKey.slice(0, 7);
  const billedMonth = tables.quotes.filter((quote) => quote.status === "approved" && quote.approved_at && isoDate(new Date(quote.approved_at)).startsWith(monthKey)).reduce((sum, quote) => sum + quote.product_subtotal, 0);
  const goal = tables.erp.monthlyGoal;
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const balance = tables.erp.banks.reduce((sum, bank) => sum + bank.balance, 0);

  const rec = (rows: typeof all, title: string): DrawerSelection => ({ title, columns: [{ key: "customer", label: "Cliente" }, { key: "ref", label: "Título" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }], rows: rows.map((item) => ({ id: titleKey(item), customer: item.customer, ref: titleRef(item), date: item.dueDate, total: item.amount })) });

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        {tables.erp.banks.map((bank, index) => <Stat key={bank.id} index={index} label={`Saldo ${bank.name}`} value={bank.balance} format="currency" caption="Saldo da demonstração" onClick={() => onGo("reconciliation")} />)}
        <Stat index={2} label="A receber" value={toReceive.reduce((sum, item) => sum + item.amount, 0)} format="currency" caption={`${toReceive.length} títulos · abrir contas a receber`} onClick={() => onGo("receivables")} />
        <Stat index={3} label="A pagar" value={payables.filter((item) => item.dueDate >= todayKey).reduce((sum, item) => sum + item.amount, 0)} format="currency" tone="warn" caption={`${payables.length} contas em aberto · abrir contas a pagar`} onClick={() => onGo("payables")} />
        <Stat index={4} label="Recebíveis em atraso" value={late.reduce((sum, item) => sum + item.amount, 0)} format="currency" tone="bad" caption={`${late.length} títulos · clique para ver os clientes`} onClick={() => setDrawer(rec(late, "Clientes com títulos em atraso"))} />
      </section>

      <div className="fin-overview-split">

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Faturado × já antecipado × livre</h2>
          <button type="button" className="link-button" onClick={() => onGo("anticipation")}>Antecipar títulos</button>
        </header>
        <p className="muted">Por mês de vencimento: quanto foi faturado, quanto já foi descontado no banco e quanto ainda pode ser antecipado.</p>
        <div className="billing-bars">
          {months.map((month, index) => (
            <button type="button" key={month.key} className="billing-row" style={{ animationDelay: `${index * 90}ms` }} onClick={() => onGo("anticipation")}>
              <span className="billing-label">{month.label}</span>
              <span className="billing-track" style={{ width: `${(month.billed / maxMonth) * 100}%` }}>
                <span className="is-anticipated" style={{ flex: month.anticipated || 0.0001 }} />
                <span className="is-free" style={{ flex: month.free || 0.0001 }} />
              </span>
              <span className="billing-values"><strong>{money(month.billed)}</strong><small>antecipado {money(month.anticipated)} · livre {money(month.free)}</small></span>
            </button>
          ))}
        </div>
        <div className="cashflow-legend"><span className="legend-ant">Já antecipado</span><span className="legend-in">Livre para antecipar</span></div>
      </section>

      <div className="fin-overview-side">
      <section className="dash-card erp-goal is-side">
        <div className="erp-goal-text">
          <p className="drawer-kicker"><Sparkles size={14} aria-hidden="true" /> Meta de faturamento do mês</p>
          <h2>{money(billedMonth)} <small>de {money(goal)}</small></h2>
          <p className="muted">{billedMonth >= goal ? "Meta batida!" : <>Faltam <strong>{money(goal - billedMonth)}</strong> em {daysLeft} dias: cerca de <strong>{money((goal - billedMonth) / Math.max(1, daysLeft))}</strong> por dia.</>}</p>
        </div>
        <div className="erp-goal-bar" role="progressbar" aria-label="Meta do mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, (billedMonth / goal) * 100))}><span style={{ width: `${Math.min(100, (billedMonth / goal) * 100)}%` }} /></div>
        <b className="erp-goal-pct">{Math.round((billedMonth / goal) * 100)}%</b>
      </section>
      <section className="dash-card">
        <header className="dash-card-head"><h2>Saldo consolidado</h2><span className="kpi-sim">simulado</span></header>
        <div className="bank-cards">
          {tables.erp.banks.map((bank) => (
            <button type="button" key={bank.id} className={`bank-card is-${bank.id}`} onClick={() => onGo("reconciliation")}>
              <Landmark size={20} aria-hidden="true" />
              <span className="bank-card-text"><span>{bank.name}</span><small>Desconto {bank.monthlyRate.toLocaleString("pt-BR")}% a.m. · tarifa {money(bank.feePerTitle)}</small></span>
              <strong>{money(bank.balance)}</strong>
            </button>
          ))}
          <div className="bank-card is-total"><Banknote size={20} aria-hidden="true" /><span className="bank-card-text"><span>Total em conta</span><small>Atualizado pela integração bancária</small></span><strong>{money(balance)}</strong></div>
        </div>
      </section>
      </div>
      </div>
      {drawer && <DetailDrawer selection={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function AnticipationView() {
  const tables = useDemoTables();
  const now = today();
  const date = isoDate(now);
  const [bankId, setBankId] = useState<BankId>("sicoob");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Anticipation | null>(null);
  const bank = tables.erp.banks.find((item) => item.id === bankId)!;
  const list = useMemo(() => discountable(tables, now).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [tables]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = list.filter((item) => selected.has(titleKey(item)));
  const exact = chosen.map((item) => discountTitle(item, bank, date));
  const total = (key: "amount" | "interest" | "iof" | "fee" | "net") => exact.reduce((sum, title) => sum + title[key], 0);
  const averaged = averagedDiscount(chosen, bank, date);

  function toggle(key: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  async function run() {
    setBusy(true);
    try {
      setResult(await anticipate([...selected], bankId));
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-anticipation">
      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Títulos disponíveis</h2>
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Banco">
            {tables.erp.banks.map((item) => <button key={item.id} type="button" role="radio" aria-checked={bankId === item.id} onClick={() => setBankId(item.id)}>{item.name} · {item.monthlyRate.toLocaleString("pt-BR")}%</button>)}
          </div>
        </header>
        <div className="erp-actions-row">
          <button type="button" className="link-button" onClick={() => setSelected(new Set(list.slice(0, 6).map(titleKey)))}>Selecionar os 6 primeiros</button>
          <button type="button" className="link-button" onClick={() => setSelected(new Set())}>Limpar</button>
        </div>
        <ul className="title-list">
          {list.slice(0, 40).map((item) => {
            const key = titleKey(item);
            return (
              <li key={key}>
                <label className={selected.has(key) ? "is-selected" : undefined}>
                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                  <span className="title-main"><strong>{item.customer}</strong><small>#{item.quoteNumber} · parcela {item.number}/{item.of} · vence {dateBr(item.dueDate)}</small></span>
                  <strong>{money(item.amount)}</strong>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="dash-card erp-bordero">
        <header className="dash-card-head"><h2>Borderô · {bank.name}</h2><Chip tone="info">valor exato por título</Chip></header>
        {chosen.length === 0 ? <p className="muted">Marque os títulos ao lado para simular. O cálculo é feito boleto a boleto (juros, IOF e tarifa), igual ao borderô do banco.</p> : (
          <>
            <table className="erp-table">
              <thead><tr><th>Título</th><th className="is-number">Dias</th><th className="is-number">Juros</th><th className="is-number">IOF</th><th className="is-number">Tarifa</th><th className="is-number">Líquido</th></tr></thead>
              <tbody>
                {exact.map((title) => (
                  <tr key={title.key}><td>{title.customer}<small>{dateBr(title.dueDate)} · {money(title.amount)}</small></td><td className="is-number">{title.days}</td><td className="is-number">{money(title.interest)}</td><td className="is-number">{money(title.iof)}</td><td className="is-number">{money(title.fee)}</td><td className="is-number"><strong>{money(title.net)}</strong></td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total ({exact.length})</td><td /><td className="is-number">{money(total("interest"))}</td><td className="is-number">{money(total("iof"))}</td><td className="is-number">{money(total("fee"))}</td><td className="is-number"><strong>{money(total("net"))}</strong></td></tr></tfoot>
            </table>
            <div className="erp-compare">
              <div><span>Cálculo por média (como hoje)</span><strong>{money(averaged)}</strong></div>
              <div><span>Cálculo exato (novo)</span><strong>{money(total("net"))}</strong></div>
              <div className={Math.abs(total("net") - averaged) > 0.009 ? "is-diff" : undefined}><span>Diferença que deixaria o caixa errado</span><strong>{money(total("net") - averaged)}</strong></div>
            </div>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run()}>{busy ? "Registrando simulação…" : `Antecipar ${exact.length} títulos no ${bank.name}`}</button>
          </>
        )}
      </section>

      <section className="dash-card erp-history">
        <header className="dash-card-head"><h2>Antecipações realizadas</h2></header>
        <ul className="erp-list">
          {[...tables.erp.anticipations].reverse().map((item) => (
            <li key={item.id}><span className="erp-list-icon"><ArrowDownLeft size={16} aria-hidden="true" /></span><span><strong>{dateBr(item.date)} · {tables.erp.banks.find((bankRow) => bankRow.id === item.bank)?.name} · {item.titles.length} títulos</strong><small>Bruto {money(item.gross)} · juros {money(item.interest)} · IOF {money(item.iof)} · tarifas {money(item.fees)}</small></span><strong>{money(item.net)}</strong></li>
          ))}
        </ul>
      </section>

      {result && (
        <Sheet variant="center" label="Antecipação realizada" onClose={() => setResult(null)}>
          <div className="kpi-sheet">
            <header className="kpi-sheet-hero"><span className="kpi-sheet-icon"><CheckCircle2 size={26} /></span><div><p>Crédito na conta {tables.erp.banks.find((item) => item.id === result.bank)?.name}</p><strong>{money(result.net)}</strong><small>{result.titles.length} títulos · bruto {money(result.gross)}</small></div></header>
            <p className="muted">O crédito simulado entrou no extrato da demo. Os títulos aparecem como “descontado” em outra cor na lista de boletos.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Reconciliation() {
  const tables = useDemoTables();
  const [bank, setBank] = useState<BankId | "all">("all");
  const [notice, setNotice] = useState("");
  const lines = tables.erp.statement.filter((line) => bank === "all" || line.bank === bank);
  const matched = lines.filter((line) => line.matched).length;
  const suggested = lines.filter((line) => !line.matched && line.suggestion).length;

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Lançamentos no extrato" value={lines.length} format="number" caption="Movimentações da demonstração" />
        <Stat index={1} label="Conciliados" value={matched} format="number" tone="good" caption={`${Math.round((matched / Math.max(1, lines.length)) * 100)}% automático`} />
        <Stat index={2} label="Com sugestão" value={suggested} format="number" tone="warn" caption="Um clique para confirmar" />
        <Stat index={3} label="Sem correspondência" value={lines.length - matched - suggested} format="number" tone="bad" />
      </section>
      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Extrato bancário</h2>
          <div className="erp-actions-row">
            <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Banco">
              {(["all", "sicoob", "itau"] as const).map((item) => <button key={item} type="button" role="radio" aria-checked={bank === item} onClick={() => setBank(item)}>{item === "all" ? "Todos" : item === "sicoob" ? "Sicoob" : "Itaú"}</button>)}
            </div>
            <button type="button" className="secondary-button compact-secondary" onClick={() => void reconcileAllSuggested().then((count) => setNotice(`${count} lançamentos conciliados.`))}><RefreshCw size={15} aria-hidden="true" />&nbsp;Conciliar sugestões</button>
          </div>
        </header>
        {notice && <p className="erp-notice">{notice}</p>}
        <ul className="statement">
          {lines.map((line, index) => (
            <li key={line.id} className={line.matched ? "is-matched" : line.suggestion ? "is-suggested" : "is-open"} style={{ animationDelay: `${Math.min(index, 20) * 20}ms` }}>
              <span className={`bank-dot is-${line.bank}`}>{line.bank === "sicoob" ? "SIC" : "ITA"}</span>
              <span className="statement-main"><strong>{line.description}</strong><small>{dateBr(line.date)}</small></span>
              <strong className={line.amount >= 0 ? "is-in" : "is-out"}>{line.amount >= 0 ? <ArrowDownLeft size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />} {money(Math.abs(line.amount))}</strong>
              {line.matched ? <Chip tone="good"><Link2 size={12} aria-hidden="true" /> Conciliado</Chip>
                : line.suggestion ? <button type="button" className="link-button" onClick={() => void reconcile(line.id, null)}>Confirmar sugestão</button>
                  : <button type="button" className="link-button is-warn" onClick={() => void reconcile(line.id, null)}>Lançar e conciliar</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

/** Escolha da conta bancária usada para pagar ou receber. */
function BankPicker({ value, onChange, label }: { value: BankId; onChange: (bank: BankId) => void; label: string }) {
  const tables = useDemoTables();
  return (
    <div className="segmented-glass ck-seg" role="radiogroup" aria-label={label}>
      {tables.erp.banks.map((bank) => <button key={bank.id} type="button" role="radio" aria-checked={value === bank.id} onClick={() => onChange(bank.id)}>{bank.name} · {money(bank.balance)}</button>)}
    </div>
  );
}

type PayFilter = "day" | "open" | "late" | "week" | "paid" | "all";

function Payables() {
  const tables = useDemoTables();
  const now = today();
  const todayKey = isoDate(now);
  const weekKey = isoDate(addDays(now, 7));
  const monthKey = todayKey.slice(0, 7);
  const [report, setReport] = useState<Report>();
  const [advanced, setAdvanced] = useState(initialTitleFilter);
  const [filter, setFilter] = useState<PayFilter>("day");
  const [bankId, setBankId] = useState<BankId>("sicoob");
  const [date, setDate] = useState(todayKey);
  const [detail, setDetail] = useState<Payable>();
  const [paying, setPaying] = useState<Payable>();
  const [supplierCredits, setSupplierCredits] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);

  const open = tables.payables.filter((item) => !item.paidAt);
  const late = open.filter((item) => item.dueDate < todayKey);
  const week = open.filter((item) => item.dueDate >= todayKey && item.dueDate <= weekKey);
  const paidMonth = tables.payables.filter((item) => item.paidAt?.startsWith(monthKey));
  const sum = (list: { amount: number }[]) => list.reduce((total, item) => total + item.amount, 0);
  const state = (item: (typeof tables.payables)[number]) => item.paidAt ? "paid" : item.dueDate < todayKey ? "late" : "open";
  const list = tables.payables.filter((item) => {
    if (!matchesTitleFilter({ due: item.dueDate, issued: item.issuedOn, created: item.createdAt, paid: item.paidAt, account: item.settlement?.cashAccount ?? item.bank,
      method: item.settlement?.method, document: item.document ?? "", amount: item.amount }, advanced)) return false;
    if (!`${item.supplier} ${item.description} ${item.document ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))) return false;
    if (filter === "day") return !item.paidAt && item.dueDate === date;
    if (filter === "all") return true;
    if (filter === "week") return !item.paidAt && item.dueDate >= todayKey && item.dueDate <= weekKey;
    return state(item) === filter;
  }).sort((a, b) => filter === "paid" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.dueDate.localeCompare(b.dueDate));
  const labels: Record<string, string> = { open: "A vencer", late: "Vencida", paid: "Paga" };

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Vencidas" value={sum(late)} format="currency" tone="bad" caption={`${late.length} contas · pagar hoje`} onClick={() => setFilter("late")} />
        <Stat index={1} label="Vencem em 7 dias" value={sum(week)} format="currency" tone="warn" caption={`${week.length} contas`} onClick={() => setFilter("week")} />
        <Stat index={2} label="Em aberto" value={sum(open)} format="currency" caption={`${open.length} contas`} onClick={() => setFilter("open")} />
        <Stat index={3} label="Pago no mês" value={paidMonth.reduce((total, item) => total + (item.settlement?.net ?? item.amount), 0)} format="currency" tone="good" caption={`${paidMonth.length} pagamentos`} onClick={() => setFilter("paid")} />
      </section>

      {showForm && <PayableForm onClose={() => setShowForm(false)} onCreated={(text) => { setShowForm(false); setNotice(text); setFilter("open"); setQuery(""); }} />}

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Contas a pagar</h2>
          {!showForm && <button type="button" className="primary-button compact-button" onClick={() => { setShowForm(true); setNotice(""); }}><Plus size={15} aria-hidden="true" />&nbsp;Nova conta a pagar</button>}
        </header>
        <div className="fin-toolbar">
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
            {([["day", "Do dia"], ["late", "Vencidas"], ["week", "Próximos 7 dias"], ["open", "A vencer"], ["paid", "Pagas"], ["all", "Todas"]] as const).map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}>{text}</button>)}
          </div>
          <div className="fin-bank"><span className="muted">Pagar pela conta</span><BankPicker value={bankId} onChange={setBankId} label="Conta para pagamento" /></div>
        </div>
        {notice && <p className="erp-notice" role="status">{notice}</p>}
        <div className="fin-toolbar fin-filters">
          <label className="field">Buscar conta<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {filter === "day" && <label className="field">Dia do vencimento<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
          <button type="button" className="secondary-button compact-secondary" onClick={() => setReport({
            title: "Contas a pagar", subtitle: `${list.length} título(s) · Recorte selecionado`,
            tables: [{ columns: ["Fornecedor", "Histórico / documento", "Vencimento", "Situação", "Original", "Baixa", "Líquido"],
              rows: list.map((item) => [item.supplier, [item.description, item.document].filter(Boolean).join(" · "), dateBr(item.dueDate), labels[state(item)], money(item.amount), dateBr(item.paidAt), item.paidAt ? money(item.settlement?.net ?? item.amount) : "–"]),
              total: ["Total", "", "", "", money(sum(list)), "", money(list.reduce((sum, item) => sum + (item.paidAt ? item.settlement?.net ?? item.amount : 0), 0))] }],
          })}>Visualizar relatório</button>
        </div>
        <TitleSearch value={advanced} onChange={(value) => { setAdvanced(value); if (filter === "day" && (value.from || value.to || value.basis !== "due")) setFilter("all"); }} />
        {list.length === 0 ? <p className="muted">Nenhuma conta nesta situação.</p> : (
          <ul className="title-list is-readonly fin-list">
            {list.map((item) => {
              const current = state(item);
              return (
                <li key={item.id} className={`is-${current}`}>
                  <div>
                    <button type="button" className="title-main fin-row-open" onClick={() => setDetail(item)} aria-label={`Abrir ${item.supplier}, ${money(item.amount)}`}><strong>{item.supplier}</strong><small>{item.category} · {item.description} · vence {dateBr(item.dueDate)}{item.paidAt ? ` · paga em ${dateBr(item.paidAt)}${item.bank ? ` (${item.bank === "sicoob" ? "Sicoob" : "Itaú"})` : ""}` : ""}</small></button>
                    <Chip tone={current === "paid" ? "good" : current === "late" ? "bad" : "muted"}>{labels[current]}</Chip>
                    <strong>{money(item.amount)}</strong>
                    <span className="fin-actions">
                      {!item.paidAt && <button type="button" className="secondary-button compact-secondary" onClick={() => setPaying(item)}>Pagar</button>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {report && <ReportViewer report={report} onClose={() => setReport(undefined)} />}
      {detail && <Dialog title={detail.supplier} onClose={() => setDetail(undefined)}>
        <p>{detail.description} · {money(detail.amount)}</p>
        <dl>
          <dt>Documento</dt><dd>{[detail.documentType, detail.document].filter(Boolean).join(" · ") || "Não informado"}</dd>
          <dt>Emissão / cadastro</dt><dd>{detail.issuedOn ? dateBr(detail.issuedOn) : "—"} / {detail.createdAt ? dateBr(detail.createdAt) : "—"} {detail.createdBy}</dd>
          <dt>Vencimento / parcela</dt><dd>{dateBr(detail.dueDate)} / {detail.installment ? `${detail.installment.number} de ${detail.installment.total}` : "—"}</dd>
          <dt>Centro de custo</dt><dd>{detail.costCenter || detail.category}</dd>
          <dt>Observação do lançamento</dt><dd>{detail.note || "—"}</dd>
        </dl>
        <SettlementHistory settlement={detail.settlement} bank={tables.erp.banks.find((bank) => bank.id === detail.bank)?.name} date={detail.paidAt} />
        <div className="dialog-actions"><button className="secondary-button" onClick={() => { setSupplierCredits(detail.supplier); setDetail(undefined); }}>Créditos do fornecedor</button>
          <button className="secondary-button" onClick={() => setDetail(undefined)}>Fechar</button></div>
      </Dialog>}
      {supplierCredits && <CreditDialog supplier={supplierCredits} onClose={() => setSupplierCredits("")} />}
      {paying && <SettlementDialog title={`Baixa · ${paying.supplier}`} amount={paying.amount} defaultBank={bankId} supplier={paying.supplier}
        onClose={() => setPaying(undefined)} onSubmit={async (bank, values) => {
          const paid = await payPayable(paying.id, bank, values);
          setNotice(`Baixa registrada: ${paid.supplier} · ${money(paid.settlement?.net ?? paid.amount)}.`);
          setFilter("paid");
        }} />}
    </div>
  );
}

function PayableForm({ onClose, onCreated }: { onClose: () => void; onCreated: (notice: string) => void }) {
  const tables = useDemoTables();
  const suppliers = [...new Set(tables.payables.map((item) => item.supplier))].sort();
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState<PayableCategory>("Matéria-prima");
  const [description, setDescription] = useState("");
  const [metadata, setMetadata] = useState({ issuedOn: isoDate(today()), document: "", documentType: "", costCenter: "", note: "" });
  const [amount, setAmount] = useState<number | "">("");
  const [dueDate, setDueDate] = useState(() => isoDate(addDays(today(), 15)));
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pickSupplier(name: string) {
    setSupplier(name);
    const known = tables.payables.find((item) => item.supplier === name);
    if (known) setCategory(known.category);
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      const created = await createPayable({ ...metadata, supplier, category, description, dueDate, amount: amount === "" ? 0 : amount, installments });
      onCreated(created.length > 1
        ? `${created.length} parcelas lançadas para ${created[0].supplier}: ${created.map((item) => `${dateBr(item.dueDate)} ${money(item.amount)}`).join(" · ")}.`
        : `Conta lançada: ${created[0].supplier} · ${money(created[0].amount)} vence ${dateBr(created[0].dueDate)}.`);
    } catch (reason) {
      setError(errorText(reason, "Não foi possível lançar a conta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dash-card fin-form-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <header className="dash-card-head"><h2><Receipt size={18} aria-hidden="true" /> Nova conta a pagar</h2></header>
      <div className="fin-form">
        <div className="field fin-wide">
          <label htmlFor="paySupplier">Fornecedor</label>
          <input id="paySupplier" list="paySuppliers" value={supplier} onChange={(event) => pickSupplier(event.target.value)} placeholder="Nome do fornecedor" autoComplete="off" />
          <datalist id="paySuppliers">{suppliers.map((name) => <option key={name} value={name} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="payCategory">Categoria</label>
          <select id="payCategory" value={category} onChange={(event) => setCategory(event.target.value as PayableCategory)}>{PAYABLE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="field fin-wide">
          <label htmlFor="payDescription">Descrição</label>
          <input id="payDescription" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: NF 4521 · farelo de soja 30 t" />
        </div>
        <div className="field">
          <label htmlFor="payAmount">Valor total (R$)</label>
          <input id="payAmount" type="number" min={0.01} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value === "" ? "" : Number(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="payDue">1º vencimento</label>
          <input id="payDue" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="payParts">Parcelas (mensais)</label>
          <input id="payParts" type="number" min={1} max={24} step={1} value={installments} onChange={(event) => setInstallments(Number(event.target.value) || 1)} />
        </div>
        {([["issuedOn", "Data de emissão", "date"], ["document", "Número da nota ou documento", "text"],
          ["documentType", "Tipo de documento (NF, DP, frete…)", "text"], ["costCenter", "Centro de custo (ex.: veículo)", "text"],
          ["note", "Observação (ex.: instruções de pagamento)", "text"]] as const).map(([key, label, type]) =>
          <label className="field" key={key}>{label}<input type={type} value={metadata[key]} onChange={(event) => setMetadata({ ...metadata, [key]: event.target.value })} /></label>)}
      </div>
      {installments > 1 && typeof amount === "number" && amount > 0 && <p className="muted">{installments}× de cerca de {money(amount / installments)}, uma por mês a partir de {dateBr(dueDate)}.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="fin-form-actions">
        <button type="button" className="secondary-button compact-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="primary-button compact-button" disabled={busy}>{busy ? "Lançando…" : "Lançar conta"}</button>
      </div>
    </form>
  );
}

type RecFilter = "open" | "late" | "week" | "discounted" | "paid" | "all";

function Receivables() {
  const tables = useDemoTables();
  const now = today();
  const todayKey = isoDate(now);
  const weekKey = isoDate(addDays(now, 7));
  const monthKey = todayKey.slice(0, 7);
  const done = anticipatedKeys(tables);
  const [pix, setPix] = useState<{ customer: string; amount: number; key: string } | null>(null);
  const [report, setReport] = useState<Report>();
  const [advanced, setAdvanced] = useState(initialTitleFilter);
  const [filter, setFilter] = useState<RecFilter>("all");
  const [bankId, setBankId] = useState<BankId>("sicoob");
  const [client, setClient] = useState("");
  const [detailKey, setDetailKey] = useState("");
  const [receiptKey, setReceiptKey] = useState("");
  const [limit, setLimit] = useState(50);
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);

  const receipts = new Map(tables.erp.receipts?.map((item) => [item.key, item]));
  const anticipation = new Map(tables.erp.anticipations.flatMap((batch) => batch.titles.map((title) => [title.key, batch] as const)));
  const quotes = new Map(tables.quotes.map((item) => [item.id, item]));
  const all = receivables(tables, now).map((item) => ({ ...item, clientKey: quotes.get(item.quoteId)?.customer_id || `avulso:${item.customer}`, key: titleKey(item), state: done.has(titleKey(item)) ? "discounted" : item.paidAt ? "paid" : item.dueDate < todayKey ? "late" : "open" }));
  const sum = (list: { amount: number }[]) => list.reduce((total, item) => total + item.amount, 0);
  const late = all.filter((item) => item.state === "late");
  const open = all.filter((item) => item.state === "open");
  const week = open.filter((item) => item.dueDate <= weekKey);
  const receivedMonth = all.filter((item) => item.state === "paid" && item.paidAt?.startsWith(monthKey));
  const extra = new Map(tables.erp.extraReceivables?.map((item) => [`avulso:${item.id}`, item]));
  const list = all.filter((item) => {
    const quote = quotes.get(item.quoteId);
    const saved = receipts.get(item.key);
    const created = quote?.created_at ?? extra.get(item.quoteId)?.createdAt;
    return matchesTitleFilter({ due: item.dueDate, issued: quote?.approved_at ?? created, created, paid: item.paidAt,
      account: saved?.settlement?.cashAccount ?? saved?.bank ?? anticipation.get(item.key)?.bank, method: saved?.settlement?.method,
      document: titleRef(item), amount: item.amount }, advanced);
  }).filter((item) => (!client || item.clientKey === client) && (filter === "all" || (filter === "week" ? item.state === "open" && item.dueDate <= weekKey : item.state === filter)))
    .sort((a, b) => filter === "paid" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.dueDate.localeCompare(b.dueDate));
  const labels: Record<string, string> = { open: "A vencer", late: "Vencido", discounted: "Antecipado", paid: "Recebido" };

  const clients = [...new Map(all.map((item) => [item.clientKey, item.customer])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const detail = all.find((item) => item.key === detailKey);
  const receiving = all.find((item) => item.key === receiptKey);
  const receipt = detail && receipts.get(detail.key);
  const discounted = detail && anticipation.get(detail.key);
  const quote = detail && quotes.get(detail.quoteId);
  const items = quote ? tables.quote_items.filter((item) => item.quote_id === quote.id) : [];
  const bankName = (id?: BankId | null) => tables.erp.banks.find((bank) => bank.id === id)?.name;

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Em atraso" value={sum(late)} format="currency" tone="bad" caption={`${late.length} títulos · cobrar`} onClick={() => setFilter("late")} />
        <Stat index={1} label="Vencem em 7 dias" value={sum(week)} format="currency" tone="warn" caption={`${week.length} títulos`} onClick={() => setFilter("week")} />
        <Stat index={2} label="A receber" value={sum(open)} format="currency" caption={`${open.length} títulos a vencer`} onClick={() => setFilter("open")} />
        <Stat index={3} label="Recebido no mês" value={receivedMonth.reduce((total, item) => total + (receipts.get(item.key)?.amount ?? item.amount), 0)} format="currency" tone="good" caption={`${receivedMonth.length} baixas`} onClick={() => setFilter("paid")} />
      </section>

      {showForm && <ReceivableForm onClose={() => setShowForm(false)} onCreated={(text) => { setShowForm(false); setNotice(text); setClient(""); setFilter("all"); }} />}

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Contas a receber · extrato por cliente</h2>
          {!showForm && <button type="button" className="primary-button compact-button" onClick={() => { setShowForm(true); setNotice(""); }}><Plus size={15} aria-hidden="true" />&nbsp;Nova conta a receber</button>}
        </header>
        <p className="muted">As parcelas dos orçamentos aprovados entram aqui sozinhas. Use “Nova conta a receber” para o que não passa por orçamento: venda de sucata, aluguel, reembolso. Boletos descontados no banco aparecem em outra cor.</p>
        <div className="fin-toolbar">
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
            {([["late", "Vencidos"], ["week", "Próximos 7 dias"], ["open", "A vencer"], ["discounted", "Antecipados"], ["paid", "Recebidos"], ["all", "Todos"]] as const).map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}>{text}</button>)}
          </div>
          <div className="fin-bank"><span className="muted">Receber na conta</span><BankPicker value={bankId} onChange={setBankId} label="Conta para recebimento" /></div>
        </div>
        {notice && <p className="erp-notice" role="status">{notice}</p>}
        <div className="fin-toolbar fin-filters">
          <label className="field">Cliente do extrato<select value={client} onChange={(event) => { setClient(event.target.value); setLimit(50); }}>
            <option value="">Todos os clientes</option>{clients.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select></label>
          <button type="button" className="secondary-button compact-secondary" onClick={() => setReport({
            title: "Contas a receber", subtitle: `${list.length} título(s) · ${clients.find(([key]) => key === client)?.[1] ?? "Recorte selecionado"}`,
            tables: [{ columns: ["Cliente", "Título", "Vencimento", "Situação", "Original", "Baixa ou antecipação", "Líquido"], rows: list.map((item) => {
              const saved = receipts.get(item.key);
              const batch = anticipation.get(item.key);
              const account = saved?.settlement?.cashAccount ? CASH_ACCOUNTS[saved.settlement.cashAccount] : bankName(batch?.bank ?? saved?.bank);
              const net = saved?.amount ?? batch?.titles.find((row) => row.key === item.key)?.net ?? (item.paidAt ? item.amount : undefined);
              return [item.customer, titleRef(item), dateBr(item.dueDate), labels[item.state], money(item.amount),
                [dateBr(batch?.date ?? item.paidAt), account, saved?.settlement?.method].filter(Boolean).join(" · "), net === undefined ? "–" : money(net)];
            }), total: ["Total nominal", "", "", "", money(sum(list)), "", ""] }],
          })}>Visualizar relatório</button>
        </div>
        <TitleSearch value={advanced} onChange={(value) => { setAdvanced(value); setLimit(50); }} />
        {client && <p>{list.length} títulos no filtro · Total nominal {money(sum(list))}</p>}
        {list.length === 0 ? <p className="muted">Nenhum título nesta situação.</p> : (
          <ul className="title-list is-readonly fin-list">
            {list.slice(0, limit).map((item) => (
              <li key={item.key} className={`is-${item.state}`}>
                <div>
                  <button type="button" className="title-main fin-row-open" onClick={() => setDetailKey(item.key)} aria-label={`Abrir ${item.customer}, ${money(item.amount)}`}><strong>{item.customer}</strong><small>{item.description ? `Avulsa · ${item.description}` : `#${item.quoteNumber} · parcela ${item.number}/${item.of}`} · vence {dateBr(item.dueDate)}{item.state === "paid" && item.paidAt ? ` · recebido em ${dateBr(item.paidAt)}` : ""}</small></button>
                  <Chip tone={item.state === "paid" ? "good" : item.state === "late" ? "bad" : item.state === "discounted" ? "info" : "muted"}>{labels[item.state]}</Chip>
                  <strong>{money(item.amount)}</strong>
                  <span className="fin-actions">
                    {(item.state === "open" || item.state === "late") && <>
                      <button type="button" className="link-button" onClick={() => setPix({ customer: item.customer, amount: item.amount, key: item.key })}><QrCode size={14} aria-hidden="true" /> Pix</button>
                      <button type="button" className="secondary-button compact-secondary" onClick={() => setReceiptKey(item.key)}>Dar baixa</button>
                    </>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > limit && <button type="button" className="secondary-button fin-more" onClick={() => setLimit(limit + 50)}>Mostrar mais títulos</button>}
      </section>
      {report && <ReportViewer report={report} onClose={() => setReport(undefined)} />}
      {detail && <Dialog title={detail.customer} onClose={() => setDetailKey("")}>
        <p>{titleRef(detail)} · Vencimento {dateBr(detail.dueDate)} · {labels[detail.state]} · {money(detail.amount)}</p>
        {quote?.approved_at && <p>Venda aprovada em {dateBr(quote.approved_at)}</p>}
        {items.length > 0 && <table className="data-table"><thead><tr><th>Produto da venda</th><th>Quantidade</th><th>Total</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td>{item.product_name_snapshot}</td><td>{item.quantity}</td><td>{money(item.product_subtotal)}</td></tr>)}</tbody></table>}
        {discounted ? <p>Antecipado em {dateBr(discounted.date)} · {bankName(discounted.bank)} · A baixa comum permanece bloqueada.</p>
          : <SettlementHistory settlement={receipt?.settlement} bank={bankName(receipt?.bank)} date={detail.paidAt} />}
        {!!receipt?.pendingIds?.length && <p>{receipt.pendingIds.filter((id) => tables.erp.cash?.pending.find((row) => row.id === id)?.clearedOn).length} de {receipt.pendingIds.length} parcela(s) compensada(s). Confira em Caixa e relatórios.</p>}
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDetailKey("")}>Fechar</button></div>
      </Dialog>}
      {receiving && <SettlementDialog title={`Baixa · ${receiving.customer}`} amount={receiving.amount} defaultBank={bankId}
        onClose={() => setReceiptKey("")} onSubmit={async (bank, values) => {
          const saved = await receiveTitle(receiving.key, bank, values);
          setNotice(`Recebimento registrado · ${money(saved.amount)}.`); setFilter("paid");
        }} />}
      {pix && (
        <Sheet variant="center" label="Cobrança Pix" onClose={() => setPix(null)}>
          <div className="kpi-sheet pix-sheet">
            <header className="kpi-sheet-hero tone-lime"><span className="kpi-sheet-icon"><QrCode size={26} /></span><div><p>Cobrança Pix · {pix.customer}</p><strong>{money(pix.amount)}</strong><small>Exemplo visual de cobrança</small></div></header>
            <FakeQr seed={pix.key} />
            <p className="muted">A demonstração mostra como a cobrança apareceria. Use “Dar baixa” para testar o registro de recebimento.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ReceivableForm({ onClose, onCreated }: { onClose: () => void; onCreated: (notice: string) => void }) {
  const tables = useDemoTables();
  const names = [...new Set(tables.customers.map((item) => item.trade_name || item.legal_name))].sort();
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [dueDate, setDueDate] = useState(() => isoDate(addDays(today(), 7)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const row = await createReceivable({ customer, description, dueDate, amount: amount === "" ? 0 : amount });
      onCreated(`Conta a receber lançada: ${row.customer} · ${money(row.amount)} vence ${dateBr(row.dueDate)}. Gere o Pix ou dê baixa quando receber.`);
    } catch (reason) {
      setError(errorText(reason, "Não foi possível lançar a conta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dash-card fin-form-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <header className="dash-card-head"><h2><HandCoins size={18} aria-hidden="true" /> Nova conta a receber</h2></header>
      <div className="fin-form">
        <div className="field fin-wide">
          <label htmlFor="recCustomer">Cliente ou pagador</label>
          <input id="recCustomer" list="recCustomers" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Nome de quem vai pagar" autoComplete="off" />
          <datalist id="recCustomers">{names.map((name) => <option key={name} value={name} />)}</datalist>
        </div>
        <div className="field fin-wide">
          <label htmlFor="recDescription">Descrição</label>
          <input id="recDescription" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: venda de sacaria usada" />
        </div>
        <div className="field">
          <label htmlFor="recAmount">Valor (R$)</label>
          <input id="recAmount" type="number" min={0.01} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value === "" ? "" : Number(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="recDue">Vencimento</label>
          <input id="recDue" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="fin-form-actions">
        <button type="button" className="secondary-button compact-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="primary-button compact-button" disabled={busy}>{busy ? "Lançando…" : "Lançar conta"}</button>
      </div>
    </form>
  );
}

/** QR Code ilustrativo (padrão determinístico) para a demonstração. */
function FakeQr({ seed }: { seed: string }) {
  const size = 25;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const cells: boolean[] = [];
  for (let index = 0; index < size * size; index += 1) { hash = (hash * 1103515245 + 12345) >>> 0; cells.push((hash >> 16) % 2 === 0); }
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  const finderOn = (x: number, y: number) => { const fx = x % (size - 7) < 7 ? x % (size - 7) : x - (size - 7); const fy = y % (size - 7) < 7 ? y % (size - 7) : y - (size - 7); const lx = x < 7 ? x : x - (size - 7); const ly = y < 7 ? y : y - (size - 7); void fx; void fy; return lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); };
  return (
    <svg className="fake-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR Code Pix">
      <rect width={size} height={size} fill="#fff" />
      {cells.map((on, index) => {
        const x = index % size, y = Math.floor(index / size);
        const fill = finder(x, y) ? finderOn(x, y) : on;
        return fill ? <rect key={index} x={x} y={y} width="1" height="1" fill="#0a2e17" /> : null;
      })}
    </svg>
  );
}
