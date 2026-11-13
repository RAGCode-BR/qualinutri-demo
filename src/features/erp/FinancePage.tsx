import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Landmark, Link2, QrCode, RefreshCw, Sparkles } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { anticipatedKeys, averagedDiscount, billingWindow, discountTitle, discountable, titleKey } from "../../demo/erp/finance";
import { anticipate, reconcile, reconcileAllSuggested } from "../../demo/erp/service";
import type { Anticipation, BankId } from "../../demo/erp/types";
import { openPayables, receivables } from "../../demo/kpis/finance";
import { isoDate, today } from "../../demo/store/ids";
import { DetailDrawer } from "../../components/demo/DetailDrawer";
import { Sheet } from "../../components/demo/DetailSheets";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { Chip, Stat, Tabs, dateBr, money } from "./shared";

type Section = "overview" | "anticipation" | "reconciliation" | "titles";

export function FinancePage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("overview");
  const pendingLines = tables.erp.statement.filter((line) => !line.matched).length;
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[
        { id: "overview", label: "Visão geral" },
        { id: "anticipation", label: "Antecipação de títulos" },
        { id: "reconciliation", label: "Conciliação Sicoob/Itaú", badge: pendingLines },
        { id: "titles", label: "Boletos e Pix" },
      ]} />
      <div className="page-enter" key={section}>
        {section === "overview" && <Overview onGo={setSection} />}
        {section === "anticipation" && <AnticipationView />}
        {section === "reconciliation" && <Reconciliation />}
        {section === "titles" && <Titles />}
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

  const rec = (rows: typeof all, title: string): DrawerSelection => ({ title, columns: [{ key: "customer", label: "Cliente" }, { key: "ref", label: "Título" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }], rows: rows.map((item) => ({ id: titleKey(item), customer: item.customer, ref: `#${item.quoteNumber} · ${item.number}/${item.of}`, date: item.dueDate, total: item.amount })) });

  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        {tables.erp.banks.map((bank, index) => <Stat key={bank.id} index={index} label={`Saldo ${bank.name}`} value={bank.balance} format="currency" caption="Extrato automático · há 3 min" onClick={() => onGo("reconciliation")} />)}
        <Stat index={2} label="A receber" value={toReceive.reduce((sum, item) => sum + item.amount, 0)} format="currency" caption={`${toReceive.length} títulos`} onClick={() => setDrawer(rec(toReceive, "Títulos a receber"))} />
        <Stat index={3} label="A pagar" value={payables.filter((item) => item.dueDate >= todayKey).reduce((sum, item) => sum + item.amount, 0)} format="currency" tone="warn" onClick={() => setDrawer({ title: "Contas a pagar", columns: [{ key: "supplier", label: "Fornecedor" }, { key: "description", label: "Descrição" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }], rows: payables.map((item) => ({ id: item.id, supplier: item.supplier, description: item.description, date: item.dueDate, total: item.amount })) })} />
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

function Titles() {
  const tables = useDemoTables();
  const now = today();
  const todayKey = isoDate(now);
  const done = anticipatedKeys(tables);
  const [pix, setPix] = useState<{ customer: string; amount: number; key: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "late" | "discounted" | "paid">("open");
  const list = receivables(tables, now).map((item) => ({ ...item, state: done.has(titleKey(item)) ? "discounted" : item.paidAt ? "paid" : item.dueDate < todayKey ? "late" : "open" }))
    .filter((item) => filter === "all" || item.state === filter).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 80);
  const labels: Record<string, string> = { open: "A vencer", late: "Vencido", discounted: "Descontado", paid: "Pago" };
  return (
    <div className="erp-grid">
      <section className="dash-card">
        <header className="dash-card-head">
          <h2>Boletos</h2>
          <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Situação">
            {(["open", "late", "discounted", "paid", "all"] as const).map((item) => <button key={item} type="button" role="radio" aria-checked={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "Todos" : labels[item]}</button>)}
          </div>
        </header>
        <p className="muted">Boletos descontados aparecem em outra cor, como já acontece hoje e a equipe aprovou.</p>
        <ul className="title-list is-readonly">
          {list.map((item) => (
            <li key={titleKey(item)} className={`is-${item.state}`}>
              <div>
                <span className="title-main"><strong>{item.customer}</strong><small>#{item.quoteNumber} · parcela {item.number}/{item.of} · vence {dateBr(item.dueDate)}</small></span>
                <Chip tone={item.state === "paid" ? "good" : item.state === "late" ? "bad" : item.state === "discounted" ? "info" : "muted"}>{labels[item.state]}</Chip>
                <strong>{money(item.amount)}</strong>
                {(item.state === "open" || item.state === "late") && <button type="button" className="link-button" onClick={() => setPix({ customer: item.customer, amount: item.amount, key: titleKey(item) })}><QrCode size={14} aria-hidden="true" /> Pix</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {pix && (
        <Sheet variant="center" label="Cobrança Pix" onClose={() => setPix(null)}>
          <div className="kpi-sheet pix-sheet">
            <header className="kpi-sheet-hero tone-lime"><span className="kpi-sheet-icon"><QrCode size={26} /></span><div><p>Cobrança Pix · {pix.customer}</p><strong>{money(pix.amount)}</strong><small>QR Code dinâmico enviado direto ao cliente</small></div></header>
            <FakeQr seed={pix.key} />
            <p className="muted">Pix copia-e-cola e QR Code gerados pela integração bancária. Quando o cliente paga, o extrato concilia sozinho.</p>
          </div>
        </Sheet>
      )}
    </div>
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
