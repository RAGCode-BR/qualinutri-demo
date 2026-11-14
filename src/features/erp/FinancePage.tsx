import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, HandCoins, Landmark, Link2, Plus, QrCode, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { anticipatedKeys, averagedDiscount, billingWindow, discountTitle, discountable, titleKey } from "../../demo/erp/finance";
import { anticipate, createPayable, createReceivable, payPayable, receiveTitle, reconcile, reconcileAllSuggested } from "../../demo/erp/service";
import type { Anticipation, BankId } from "../../demo/erp/types";
import { openPayables, receivables, titleRef } from "../../demo/kpis/finance";
import { addDays, isoDate, today } from "../../demo/store/ids";
import { PAYABLE_CATEGORIES, type PayableCategory } from "../../demo/store/types";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import { Sheet } from "../../components/demo/DetailSheets";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { Chip, Stat, Tabs, dateBr, money } from "./shared";

type Section = "overview" | "payables" | "receivables" | "anticipation" | "reconciliation";

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
        { id: "reconciliation", label: "Conciliação Sicoob/Itaú", badge: pendingLines },
      ]} />
      <div className="page-enter" key={section}>
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "anticipation" && <AnticipationView />}
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
        {tables.erp.banks.map((bank, index) => <Stat key={bank.id} index={index} label={`Saldo ${bank.name}`} value={bank.balance} format="currency" caption="Extrato automático · há 3 min" onClick={() => onGo("reconciliation")} />)}
        <Stat index={2} label="A receber" value={toReceive.reduce((sum, item) => sum + item.amount, 0)} format="currency" caption={`${toReceive.length} títulos · abrir contas a receber`} onClick={() => onGo("receivables")} />
        <Stat index={3} label="A pagar" value={payables.filter((item) => item.dueDate >= todayKey).reduce((sum, item) => sum + item.amount, 0)} format="currency" tone="warn" caption={`${payables.length} contas em aberto · abrir contas a pagar`} onClick={() => onGo("payables")} />
        <Stat index={4} label="Recebíveis em atraso" value={late.reduce((sum, item) => sum + item.amount, 0)} format="currency" tone="bad" caption={`${late.length} títulos · clique para ver os clientes`} onClick={() => setDrawer(rec(late, "Clientes com títulos em atraso"))} />
      </section>

      <section className="dash-card erp-goal">
        <div>
          <p className="drawer-kicker"><Sparkles size={14} aria-hidden="true" /> Meta de faturamento do mês</p>
          <h2>{money(billedMonth)} <small>de {money(goal)}</small></h2>
          <p className="muted">{billedMonth >= goal ? "Meta batida!" : <>Faltam <strong>{money(goal - billedMonth)}</strong> em {daysLeft} dias: cerca de <strong>{money((goal - billedMonth) / Math.max(1, daysLeft))}</strong> por dia.</>}</p>
        </div>
        <div className="erp-goal-bar"><span style={{ width: `${Math.min(100, (billedMonth / goal) * 100)}%` }} /></div>
      </section>

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Faturado × já antecipado × livre</h2>
          <button type="button" className="link-button" onClick={() => onGo("anticipation")}>Antecipar títulos</button>
        </header>
        <p className="muted">Em vez de tirar dois relatórios e fazer a conta à mão: por mês de vencimento, quanto foi faturado, quanto já foi descontado no banco e quanto ainda pode ser antecipado.</p>
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

      <section className="dash-card">
        <header className="dash-card-head"><h2>Saldo consolidado</h2><span className="kpi-sim">simulado</span></header>
        <div className="bank-cards">
          {tables.erp.banks.map((bank) => (
            <button type="button" key={bank.id} className={`bank-card is-${bank.id}`} onClick={() => onGo("reconciliation")}>
              <Landmark size={22} aria-hidden="true" />
              <span>{bank.name}</span>
              <strong>{money(bank.balance)}</strong>
              <small>Desconto {bank.monthlyRate.toLocaleString("pt-BR")}% a.m. · tarifa {money(bank.feePerTitle)}</small>
            </button>
          ))}
          <div className="bank-card is-total"><Banknote size={22} aria-hidden="true" /><span>Total em conta</span><strong>{money(balance)}</strong><small>Atualizado pela integração bancária</small></div>
        </div>
      </section>
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
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run()}>{busy ? "Enviando ao banco…" : `Antecipar ${exact.length} títulos no ${bank.name}`}</button>
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
            <p className="muted">O crédito já entrou no extrato e foi conciliado. Os títulos aparecem como “descontado” em outra cor na lista de boletos.</p>
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
        <Stat label="Lançamentos no extrato" value={lines.length} format="number" caption="Puxados direto do banco, sem PDF" />
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

type PayFilter = "open" | "late" | "week" | "paid" | "all";

function Payables() {
  const tables = useDemoTables();
  const now = today();
  const todayKey = isoDate(now);
  const weekKey = isoDate(addDays(now, 7));
  const monthKey = todayKey.slice(0, 7);
  const [filter, setFilter] = useState<PayFilter>("late");
  const [bankId, setBankId] = useState<BankId>("sicoob");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const open = tables.payables.filter((item) => !item.paidAt);
  const late = open.filter((item) => item.dueDate < todayKey);
  const week = open.filter((item) => item.dueDate >= todayKey && item.dueDate <= weekKey);
  const paidMonth = tables.payables.filter((item) => item.paidAt?.startsWith(monthKey));
  const sum = (list: { amount: number }[]) => list.reduce((total, item) => total + item.amount, 0);
  const state = (item: (typeof tables.payables)[number]) => item.paidAt ? "paid" : item.dueDate < todayKey ? "late" : "open";
  const list = tables.payables.filter((item) => {
    if (filter === "all") return true;
    if (filter === "week") return !item.paidAt && item.dueDate >= todayKey && item.dueDate <= weekKey;
    return state(item) === filter;
  }).sort((a, b) => filter === "paid" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.dueDate.localeCompare(b.dueDate));
  const labels: Record<string, string> = { open: "A vencer", late: "Vencida", paid: "Paga" };

  async function pay(id: string) {
    setBusy(id); setError(""); setNotice("");
    try {
      const paid = await payPayable(id, bankId);
      setNotice(`Pago: ${paid.supplier} · ${money(paid.amount)} pelo ${tables.erp.banks.find((bank) => bank.id === bankId)?.name}. Já está no extrato, conciliado.`);
    } catch (reason) {
      setError(errorText(reason, "Não foi possível pagar."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Vencidas" value={sum(late)} format="currency" tone="bad" caption={`${late.length} contas · pagar hoje`} onClick={() => setFilter("late")} />
        <Stat index={1} label="Vencem em 7 dias" value={sum(week)} format="currency" tone="warn" caption={`${week.length} contas`} onClick={() => setFilter("week")} />
        <Stat index={2} label="Em aberto" value={sum(open)} format="currency" caption={`${open.length} contas`} onClick={() => setFilter("open")} />
        <Stat index={3} label="Pago no mês" value={sum(paidMonth)} format="currency" tone="good" caption={`${paidMonth.length} pagamentos`} onClick={() => setFilter("paid")} />
      </section>

      {showForm && <PayableForm onClose={() => setShowForm(false)} onCreated={(text) => { setShowForm(false); setNotice(text); setFilter("open"); }} />}

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Contas a pagar</h2>
          {!showForm && <button type="button" className="primary-button compact-button" onClick={() => { setShowForm(true); setNotice(""); }}><Plus size={15} aria-hidden="true" />&nbsp;Nova conta a pagar</button>}
        </header>
        <div className="fin-toolbar">
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
            {([["late", "Vencidas"], ["week", "Próximos 7 dias"], ["open", "A vencer"], ["paid", "Pagas"], ["all", "Todas"]] as const).map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}>{text}</button>)}
          </div>
          <div className="fin-bank"><span className="muted">Pagar pela conta</span><BankPicker value={bankId} onChange={setBankId} label="Conta para pagamento" /></div>
        </div>
        {notice && <p className="erp-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {list.length === 0 ? <p className="muted">Nenhuma conta nesta situação.</p> : (
          <ul className="title-list is-readonly fin-list">
            {list.map((item) => {
              const current = state(item);
              return (
                <li key={item.id} className={`is-${current}`}>
                  <div>
                    <span className="title-main"><strong>{item.supplier}</strong><small>{item.category} · {item.description} · vence {dateBr(item.dueDate)}{item.paidAt ? ` · paga em ${dateBr(item.paidAt)}${item.bank ? ` (${item.bank === "sicoob" ? "Sicoob" : "Itaú"})` : ""}` : ""}</small></span>
                    <Chip tone={current === "paid" ? "good" : current === "late" ? "bad" : "muted"}>{labels[current]}</Chip>
                    <strong>{money(item.amount)}</strong>
                    {item.paidAt ? <span className="fin-done"><CheckCircle2 size={15} aria-hidden="true" /></span>
                      : <button type="button" className="secondary-button compact-secondary" disabled={busy !== null} onClick={() => void pay(item.id)}>{busy === item.id ? "Pagando…" : "Pagar"}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PayableForm({ onClose, onCreated }: { onClose: () => void; onCreated: (notice: string) => void }) {
  const tables = useDemoTables();
  const suppliers = [...new Set(tables.payables.map((item) => item.supplier))].sort();
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState<PayableCategory>("Matéria-prima");
  const [description, setDescription] = useState("");
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
      const created = await createPayable({ supplier, category, description, dueDate, amount: amount === "" ? 0 : amount, installments });
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
  const [filter, setFilter] = useState<RecFilter>("late");
  const [bankId, setBankId] = useState<BankId>("sicoob");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const all = receivables(tables, now).map((item) => ({ ...item, key: titleKey(item), state: done.has(titleKey(item)) ? "discounted" : item.paidAt ? "paid" : item.dueDate < todayKey ? "late" : "open" }));
  const sum = (list: { amount: number }[]) => list.reduce((total, item) => total + item.amount, 0);
  const late = all.filter((item) => item.state === "late");
  const open = all.filter((item) => item.state === "open");
  const week = open.filter((item) => item.dueDate <= weekKey);
  const receivedMonth = all.filter((item) => item.state === "paid" && item.paidAt?.startsWith(monthKey));
  const list = all.filter((item) => filter === "all" || (filter === "week" ? item.state === "open" && item.dueDate <= weekKey : item.state === filter))
    .sort((a, b) => filter === "paid" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.dueDate.localeCompare(b.dueDate)).slice(0, 120);
  const labels: Record<string, string> = { open: "A vencer", late: "Vencido", discounted: "Descontado", paid: "Recebido" };

  async function receive(key: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const receipt = await receiveTitle(key, bankId);
      const title = all.find((item) => item.key === key);
      setNotice(`Recebido: ${title?.customer ?? "título"} · ${money(receipt.amount)} no ${tables.erp.banks.find((bank) => bank.id === bankId)?.name}. Baixa feita e extrato conciliado.`);
    } catch (reason) {
      setError(errorText(reason, "Não foi possível dar baixa."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Em atraso" value={sum(late)} format="currency" tone="bad" caption={`${late.length} títulos · cobrar`} onClick={() => setFilter("late")} />
        <Stat index={1} label="Vencem em 7 dias" value={sum(week)} format="currency" tone="warn" caption={`${week.length} títulos`} onClick={() => setFilter("week")} />
        <Stat index={2} label="A receber" value={sum(open)} format="currency" caption={`${open.length} títulos a vencer`} onClick={() => setFilter("open")} />
        <Stat index={3} label="Recebido no mês" value={sum(receivedMonth)} format="currency" tone="good" caption={`${receivedMonth.length} baixas`} onClick={() => setFilter("paid")} />
      </section>

      {showForm && <ReceivableForm onClose={() => setShowForm(false)} onCreated={(text) => { setShowForm(false); setNotice(text); setFilter("open"); }} />}

      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Contas a receber</h2>
          {!showForm && <button type="button" className="primary-button compact-button" onClick={() => { setShowForm(true); setNotice(""); }}><Plus size={15} aria-hidden="true" />&nbsp;Nova conta a receber</button>}
        </header>
        <p className="muted">As parcelas dos orçamentos aprovados entram aqui sozinhas. Use “Nova conta a receber” para o que não passa por orçamento: venda de sucata, aluguel, reembolso. Boletos descontados no banco aparecem em outra cor.</p>
        <div className="fin-toolbar">
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
            {([["late", "Vencidos"], ["week", "Próximos 7 dias"], ["open", "A vencer"], ["discounted", "Descontados"], ["paid", "Recebidos"], ["all", "Todos"]] as const).map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}>{text}</button>)}
          </div>
          <div className="fin-bank"><span className="muted">Receber na conta</span><BankPicker value={bankId} onChange={setBankId} label="Conta para recebimento" /></div>
        </div>
        {notice && <p className="erp-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {list.length === 0 ? <p className="muted">Nenhum título nesta situação.</p> : (
          <ul className="title-list is-readonly fin-list">
            {list.map((item) => (
              <li key={item.key} className={`is-${item.state}`}>
                <div>
                  <span className="title-main"><strong>{item.customer}</strong><small>{item.description ? `Avulsa · ${item.description}` : `#${item.quoteNumber} · parcela ${item.number}/${item.of}`} · vence {dateBr(item.dueDate)}{item.state === "paid" && item.paidAt ? ` · recebido em ${dateBr(item.paidAt)}` : ""}</small></span>
                  <Chip tone={item.state === "paid" ? "good" : item.state === "late" ? "bad" : item.state === "discounted" ? "info" : "muted"}>{labels[item.state]}</Chip>
                  <strong>{money(item.amount)}</strong>
                  {(item.state === "open" || item.state === "late") ? (
                    <span className="fin-actions">
                      <button type="button" className="link-button" onClick={() => setPix({ customer: item.customer, amount: item.amount, key: item.key })}><QrCode size={14} aria-hidden="true" /> Pix</button>
                      <button type="button" className="secondary-button compact-secondary" disabled={busy !== null} onClick={() => void receive(item.key)}>{busy === item.key ? "Baixando…" : "Dar baixa"}</button>
                    </span>
                  ) : <span className="fin-done">{item.state === "paid" ? <CheckCircle2 size={15} aria-hidden="true" /> : null}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pix && (
        <Sheet variant="center" label="Cobrança Pix" onClose={() => setPix(null)}>
          <div className="kpi-sheet pix-sheet">
            <header className="kpi-sheet-hero tone-lime"><span className="kpi-sheet-icon"><QrCode size={26} /></span><div><p>Cobrança Pix · {pix.customer}</p><strong>{money(pix.amount)}</strong><small>QR Code dinâmico enviado direto ao cliente</small></div></header>
            <FakeQr seed={pix.key} />
            <p className="muted">Pix copia-e-cola e QR Code gerados pela integração bancária. Quando o cliente paga, o extrato concilia sozinho, ou use “Dar baixa” para registrar na hora.</p>
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
