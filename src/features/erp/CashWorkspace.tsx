import { useState, type FormEvent, type ReactNode } from "react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { getDemoViewer } from "../../demo/app/session";
import { addDays, isoDate, today } from "../../demo/store/ids";
import { CASH_ACCOUNTS, CASH_KINDS, CASH_METHODS, addCashEntry, addPendingCash, cashLines, cashRound, cashState, cashToday, clearPendingCash, closeCashSession, ledgerSummary, openCashSession, reopenCashSession, sessionTotals, transferCash, type CashAccount, type CashEntry, type CashKind, type CashMethod, type CashPending, type CashSession } from "../../demo/erp/cash";
import { cashDay, cashMoney as money, cashTime, filterLedger, filterPending, ledgerReport, pendingReport, position, sessionReport, type LedgerFilter, type PendingFilter, type Report } from "../../demo/erp/cashReports";
import type { BankId } from "../../demo/erp/types";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import { Dialog } from "../../components/Dialog";
import { Chip, Tabs } from "./shared";
import "./cash.css";

const accounts = Object.keys(CASH_ACCOUNTS) as CashAccount[];
const liquidAccounts = accounts.filter((item) => item !== "cards" && item !== "cheques");
const pastWeek = () => isoDate(addDays(today(), -7));
type CashTab = "ledger" | "balance" | "sessions" | "register" | "cards" | "cheques";
type Operation = { type: "entry" | "transfer" | "open" } | { type: "desk" | "close"; session: CashSession } | { type: "clear"; item: CashPending };
const options = (list: readonly string[]) => list.map((item) => <option key={item}>{item}</option>);
const accountOptions = (list: CashAccount[]) => list.map((item) => <option key={item} value={item}>{CASH_ACCOUNTS[item]}</option>);
const labelStatus = (status: boolean) => <Chip tone={status ? "good" : "warn"}>{status ? "Compensado" : "Pendente"}</Chip>;
const initialLedger = (): LedgerFilter => ({ start: pastWeek(), end: cashToday(), basis: "emission", account: "daily", status: "all", query: "", method: "", kind: "", origin: "", min: "", max: "" });
const initialPending = (): PendingFilter => ({ start: pastWeek(), end: cashToday(), basis: "date", status: "no", query: "", method: "", grouping: "none", totalsOnly: false });

function Field({ name, children }: { name: string; children: ReactNode }) { return <label className="field">{name}{children}</label>; }
function Button({ children, onClick, disabled, primary }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return <button type="button" className={primary ? "primary-button compact-button" : "secondary-button compact-secondary"} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Collection({ columns, numeric = [], children }: { columns: string[]; numeric?: number[]; children: ReactNode }) {
  return <div className="cash-grid-scroll"><table className="erp-table cash-table"><thead><tr>{columns.map((item, index) => <th scope="col" key={item} className={numeric.includes(index) ? "is-number" : undefined}>{item}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function Empty({ span }: { span: number }) { return <tr><td colSpan={span} className="muted">Nenhum registro com esses filtros.</td></tr>; }
const statusOptions = <><option value="all">Todos</option><option value="yes">Compensados</option><option value="no">Não compensados</option></>;

export function CashWorkspace() {
  const tables = useDemoTables();
  const viewer = getDemoViewer();
  const writable = viewer.role !== "consulta";
  const state = cashState(tables);
  const lines = cashLines(tables);
  const [tab, setTab] = useState<CashTab>("ledger");
  const [ledger, setLedger] = useState(initialLedger);
  const [balance, setBalance] = useState<LedgerFilter>(() => ({ ...initialLedger(), account: "all", basis: "clearing", status: "yes" }));
  const [cards, setCards] = useState(initialPending);
  const [cheques, setCheques] = useState(initialPending);
  const [groupPayment, setGroupPayment] = useState(true);
  const [sessionFilter, setSessionFilter] = useState({ start: pastWeek(), end: cashToday(), state: "all", query: "" });
  const [report, setReport] = useState<Report>();
  const [operation, setOperation] = useState<Operation>();
  const [notice, setNotice] = useState("");
  const active = state.sessions.find((item) => !item.closedAt && item.operatorId === viewer.id);
  const rows = filterLedger(lines, ledger);
  const shownAccounts = ledger.account === "all" ? accounts : [ledger.account];
  const balanceAccounts = balance.account === "all" ? accounts : [balance.account];
  const positions = position(tables, lines, balance, balanceAccounts);
  const isCheque = tab === "cheques";
  const pendingFilter = isCheque ? cheques : cards;
  const setPending = isCheque ? setCheques : setCards;
  const pendings = filterPending(state.pending, pendingFilter, isCheque);
  const badPeriod = (start: string, end: string) => !!start && !!end && start > end;
  const sessionRows = [...state.sessions].reverse().filter((item) => {
    const date = isoDate(new Date(item.openedAt));
    return (!sessionFilter.start || date >= sessionFilter.start) && (!sessionFilter.end || date <= sessionFilter.end) &&
      (sessionFilter.state === "all" || (sessionFilter.state === "closed" ? !!item.closedAt : !item.closedAt)) &&
      (!sessionFilter.query || `${item.number} ${item.operator} ${CASH_ACCOUNTS[item.account]}`.toLocaleLowerCase().includes(sessionFilter.query.trim().toLocaleLowerCase()));
  });

  return <div className="cash-workspace erp-grid">
    <Tabs value={tab} onChange={(value) => { setTab(value); setNotice(""); }} options={[
      { id: "ledger", label: "Extrato de caixa" }, { id: "balance", label: "Saldo das contas" }, { id: "sessions", label: "Sessões e fechamento" },
      { id: "register", label: "Registradora" }, { id: "cards", label: "Cartões" }, { id: "cheques", label: "Cheques" },
    ]} />
    {notice && <p className="erp-notice" role="status">{notice}</p>}
    {tab === "ledger" && <section className="dash-card cash-card">
      <header className="dash-card-head"><div><h2>Extrato de caixa</h2><p className="muted">Pesquise as movimentações por conta, período, documento e compensação.</p></div>
        {writable && <div className="cash-actions"><Button onClick={() => setOperation({ type: "transfer" })}>Transferir entre contas</Button><Button primary onClick={() => setOperation({ type: "entry" })}>Novo lançamento avulso</Button></div>}</header>
      <LedgerFields value={ledger} onChange={setLedger} detailed />
      <div className="cash-actions cash-report-actions">
        <label className="cash-check"><input type="checkbox" checked={groupPayment} onChange={(event) => setGroupPayment(event.target.checked)} /> Subgrupo por forma de pagamento</label>
        {(["daily", "extract", "summary"] as const).map((mode, index) => <Button key={mode} primary={index === 0} disabled={badPeriod(ledger.start, ledger.end)} onClick={() => setReport(ledgerReport(tables, lines, ledger, shownAccounts, mode, groupPayment))}>{["Visualizar Movimento Diário", "Visualizar Extrato", "Visualizar Resumo"][index]}</Button>)}
      </div>
      {badPeriod(ledger.start, ledger.end) ? <p role="alert">A data inicial deve ser anterior ou igual à data final.</p> : <>
        <CashTotals rows={rows} />
        <MovementTable rows={rows} />
      </>}
    </section>}
    {tab === "balance" && <section className="dash-card cash-card">
      <header className="dash-card-head"><div><h2>Saldo das contas</h2><p className="muted">O saldo final inclui o saldo anterior. Consulte por emissão ou compensação.</p></div>
        <Button primary disabled={badPeriod(balance.start, balance.end)} onClick={() => setReport(ledgerReport(tables, lines, balance, balanceAccounts, "position"))}>Visualizar saldo em relatório</Button></header>
      <LedgerFields value={balance} onChange={setBalance} />
      <p className="muted">Os saldos iniciais dos bancos são referências do extrato simulado.</p>
      {badPeriod(balance.start, balance.end) ? <p role="alert">A data inicial deve ser anterior ou igual à data final.</p> :
        <Collection columns={["Conta", "Saldo anterior", "Entradas", "Saídas", "Saldo final"]} numeric={[1, 2, 3, 4]}>
          {positions.map((row) => <tr key={row.account}><td>{CASH_ACCOUNTS[row.account]}</td><td className="is-number">{money(row.opening)}</td><td className="is-number">{money(row.entries)}</td><td className="is-number">{money(row.exits)}</td><td className="is-number"><strong>{money(row.closing)}</strong></td></tr>)}
          <tr><td><strong>Total geral</strong></td>{(["opening", "entries", "exits", "closing"] as const).map((key) => <td key={key} className="is-number"><strong>{money(positions.reduce((sum, item) => sum + item[key], 0))}</strong></td>)}</tr>
        </Collection>}
    </section>}
    {tab === "sessions" && <section className="dash-card cash-card">
      <header className="dash-card-head"><div><h2>Sessões de caixa</h2><p className="muted">Consulte a abertura, o operador, o dinheiro contado e o fechamento de cada sessão.</p></div>
        {writable && <Button primary disabled={!!active} onClick={() => setOperation({ type: "open" })}>Abrir sessão</Button>}</header>
      <div className="cash-fields">
        <Field name="Aberta de"><input type="date" value={sessionFilter.start} onChange={(e) => setSessionFilter({ ...sessionFilter, start: e.target.value })} /></Field>
        <Field name="Até"><input type="date" value={sessionFilter.end} onChange={(e) => setSessionFilter({ ...sessionFilter, end: e.target.value })} /></Field>
        <Field name="Situação"><select value={sessionFilter.state} onChange={(e) => setSessionFilter({ ...sessionFilter, state: e.target.value })}><option value="all">Todas</option><option value="open">Abertas</option><option value="closed">Fechadas</option></select></Field>
        <Field name="Sessão, operador ou conta"><input type="search" value={sessionFilter.query} onChange={(e) => setSessionFilter({ ...sessionFilter, query: e.target.value })} /></Field>
      </div>
      <Collection columns={["Sessão", "Caixa / operador", "Abertura", "Fechamento", "Inicial", "Esperado", "Contado", "Ações"]} numeric={[4, 5, 6]}>
        {!sessionRows.length && <Empty span={8} />}
        {sessionRows.map((row) => <tr key={row.id}><td>#{row.number}</td><td>{CASH_ACCOUNTS[row.account]}<small>{row.operator}</small></td><td>{cashTime(row.openedAt)}</td>
          <td>{row.closedAt ? cashTime(row.closedAt) : "Aberta"}{row.closedBy && <small>{row.closedBy}</small>}</td><td className="is-number">{money(row.opening)}</td><td className="is-number">{money(sessionTotals(lines, row).closing)}</td><td className="is-number">{row.counted === undefined ? "–" : money(row.counted)}</td>
          <td><div className="cash-actions">
            <Button onClick={() => setReport(sessionReport(lines, state.pending, row, true))}>Fechamento</Button>
            <Button onClick={() => setReport(sessionReport(lines, state.pending, row, false))}>Resumo</Button>
            {writable && row.operatorId === viewer.id && (!row.closedAt ? <Button onClick={() => setOperation({ type: "close", session: row })}>Fechar sessão</Button>
              : !active && !state.sessions.some((item) => item.account === row.account && item.number > row.number) && <Button onClick={() => { try { reopenCashSession(row.id); setNotice("Sessão reaberta."); } catch (error) { setNotice(String(error)); } }}>Reabrir</Button>)}
          </div></td></tr>)}
      </Collection>
    </section>}
    {tab === "register" && <section className="dash-card cash-card">
      <header className="dash-card-head"><div><h2>Registradora</h2><p className="muted">{active ? `Sessão nº ${active.number} · ${CASH_ACCOUNTS[active.account]} · ${active.operator}` : "Abra uma sessão para registrar vendas e movimentações de balcão."}</p></div>
        {writable && (active ? <div className="cash-actions"><Button primary onClick={() => setOperation({ type: "desk", session: active })}>Registrar no balcão</Button><Button onClick={() => setOperation({ type: "close", session: active })}>Fechar sessão</Button></div> :
          <Button primary onClick={() => setOperation({ type: "open" })}>Abrir sessão</Button>)}</header>
      {active && <><p><strong>Dinheiro esperado: {money(sessionTotals(lines, active).closing)}</strong></p><MovementTable rows={lines.filter((row) => row.sessionId === active.id)} /></>}
    </section>}
    {(tab === "cards" || tab === "cheques") && <section className="dash-card cash-card">
      <header className="dash-card-head"><div><h2>{isCheque ? "Cheques recebidos" : "Cartões a compensar"}</h2><p className="muted">Confira o que ainda vai entrar no banco. A compensação transfere o líquido para a conta escolhida.</p></div>
        <Button primary disabled={badPeriod(pendingFilter.start, pendingFilter.end)} onClick={() => setReport(pendingReport(pendings, pendingFilter, isCheque))}>Visualizar relatório</Button></header>
      <div className="cash-fields">
        <Field name="Data de referência"><select value={pendingFilter.basis} onChange={(e) => setPending({ ...pendingFilter, basis: e.target.value as PendingFilter["basis"], status: e.target.value === "clearedOn" && pendingFilter.status === "no" ? "yes" : pendingFilter.status })}><option value="date">Emissão</option><option value="due">Vencimento</option><option value="clearedOn">Compensação</option></select></Field>
        <Field name="De"><input type="date" value={pendingFilter.start} onChange={(e) => setPending({ ...pendingFilter, start: e.target.value })} /></Field>
        <Field name="Até"><input type="date" value={pendingFilter.end} onChange={(e) => setPending({ ...pendingFilter, end: e.target.value })} /></Field>
        <Field name="Situação"><select value={pendingFilter.status} onChange={(e) => setPending({ ...pendingFilter, status: e.target.value as PendingFilter["status"], basis: e.target.value === "no" && pendingFilter.basis === "clearedOn" ? "date" : pendingFilter.basis })}>{statusOptions}</select></Field>
        <Field name={isCheque ? "Nº do cheque ou documento" : "Autorização ou documento"}><input type="search" value={pendingFilter.query} onChange={(e) => setPending({ ...pendingFilter, query: e.target.value })} /></Field>
        {!isCheque && <Field name="Forma"><select value={pendingFilter.method} onChange={(e) => setPending({ ...pendingFilter, method: e.target.value })}><option value="">Todas</option>{options(["Cartão débito", "Cartão crédito"])}</select></Field>}
        <Field name="Agrupar relatório por"><select value={pendingFilter.grouping} onChange={(e) => setPending({ ...pendingFilter, grouping: e.target.value as PendingFilter["grouping"] })}><option value="none">Sem agrupamento</option><option value="due">Vencimento</option>{!isCheque && <><option value="brand">Bandeira</option><option value="method">Forma de pagamento</option></>}</select></Field>
        <label className="cash-check"><input type="checkbox" checked={pendingFilter.totalsOnly} onChange={(e) => setPending({ ...pendingFilter, totalsOnly: e.target.checked })} /> Somente totais no relatório</label>
      </div>
      <Collection columns={["Emissão / vencimento", isCheque ? "Nº do cheque" : "Autorização", "Documento / parcela", "Forma", "Bruto", "Taxa", "Líquido", "Situação", "Ação"]} numeric={[4, 5, 6]}>
        {!pendings.length && <Empty span={9} />}
        {pendings.map((row) => <tr key={row.id}><td>{cashDay(row.date)}<small>Vence {cashDay(row.due)}</small></td><td>{row.reference}</td><td>{row.document}<small>{row.installment}/{row.installments}</small></td>
          <td>{row.method}<small>{row.brand}</small></td><td className="is-number">{money(row.gross)}</td><td className="is-number">{money(row.fee)}</td><td className="is-number"><strong>{money(cashRound(row.gross - row.fee))}</strong></td>
          <td>{labelStatus(!!row.clearedOn)}{row.clearedOn && <small>{cashDay(row.clearedOn)} · {row.bank && CASH_ACCOUNTS[row.bank]}</small>}</td>
          <td>{writable && !row.clearedOn && <Button onClick={() => setOperation({ type: "clear", item: row })}>Compensar</Button>}</td></tr>)}
      </Collection>
    </section>}
    {operation && <OperationForm operation={operation} banks={tables.erp.banks.map((item) => item.id)} expected={operation.type === "close" ? sessionTotals(lines, operation.session).closing : 0}
      onClose={() => setOperation(undefined)} onSaved={(message) => { setOperation(undefined); setNotice(message); }} />}
    {report && <ReportViewer report={report} onClose={() => setReport(undefined)} />}
  </div>;
}

function LedgerFields({ value, onChange, detailed }: { value: LedgerFilter; onChange: (next: LedgerFilter) => void; detailed?: boolean }) {
  const set = <K extends keyof LedgerFilter>(key: K, next: LedgerFilter[K]) => onChange({ ...value, [key]: next });
  return <div className="cash-fields">
    <Field name="Conta / caixa"><select value={value.account} onChange={(e) => set("account", e.target.value as LedgerFilter["account"])}><option value="all">Todas</option>{accountOptions(accounts)}</select></Field>
    <Field name="Data de referência"><select value={value.basis} onChange={(e) => {
      const basis = e.target.value as LedgerFilter["basis"];
      onChange({ ...value, basis, status: basis === "clearing" && value.status === "no" ? "yes" : value.status });
    }}><option value="emission">Emissão</option><option value="clearing">Compensação</option></select></Field>
    <Field name="De"><input type="date" value={value.start} onChange={(e) => set("start", e.target.value)} /></Field>
    <Field name="Até"><input type="date" value={value.end} onChange={(e) => set("end", e.target.value)} /></Field>
    <Field name="Situação"><select value={value.status} onChange={(e) => {
      const status = e.target.value as LedgerFilter["status"];
      onChange({ ...value, status, basis: status === "no" ? "emission" : value.basis });
    }}>{statusOptions}</select></Field>
    {detailed && <>
      <Field name="Documento ou histórico"><input type="search" value={value.query} onChange={(e) => set("query", e.target.value)} placeholder="Ex.: VEN-001" /></Field>
      <Field name="Forma de pagamento"><select value={value.method} onChange={(e) => set("method", e.target.value)}><option value="">Todas</option>{options(CASH_METHODS)}</select></Field>
      <Field name="Tipo de movimento"><select value={value.kind} onChange={(e) => set("kind", e.target.value)}><option value="">Todos</option>{options(CASH_KINDS)}</select></Field>
      <Field name="Origem"><select value={value.origin} onChange={(e) => set("origin", e.target.value)}><option value="">Todas</option>{options(["Balcão", "Manual", "Baixa", "Conciliação", "Transferência", "Exemplo"])}</select></Field>
      <Field name="Valor mínimo"><input type="number" min="0" step="0.01" value={value.min} onChange={(e) => set("min", e.target.value)} /></Field>
      <Field name="Valor máximo"><input type="number" min="0" step="0.01" value={value.max} onChange={(e) => set("max", e.target.value)} /></Field>
    </>}
  </div>;
}

function CashTotals({ rows }: { rows: ReturnType<typeof cashLines> }) {
  const total = ledgerSummary(rows);
  return <div className="cash-totals" aria-label="Totais do extrato">
    <div><span>Lançamentos</span><strong>{rows.length}</strong></div>
    <div><span>Entradas</span><strong>{money(total.entries)}</strong></div>
    <div><span>Saídas</span><strong>{money(total.exits)}</strong></div>
    <div><span>Movimento líquido</span><strong>{money(total.movement)}</strong></div>
  </div>;
}

function MovementTable({ rows }: { rows: ReturnType<typeof cashLines> }) {
  return <Collection columns={["Emissão / documento", "Histórico", "Conta", "Forma", "Entrada", "Saída", "Compensação"]} numeric={[4, 5]}>
    {!rows.length && <Empty span={7} />}
    {rows.map((row) => <tr key={row.id}><td>{cashDay(row.date)}<small>{row.document || "–"}</small></td><td>{row.description}<small>{row.kind} · {row.origin}</small></td><td>{CASH_ACCOUNTS[row.account]}</td>
      <td>{row.method ?? "–"}</td><td className="is-number">{row.amount >= 0 ? money(row.amount) : "–"}</td><td className="is-number">{row.amount < 0 ? money(-row.amount) : "–"}</td>
      <td>{labelStatus(!!row.clearedOn)}{row.clearedOn && <small>{cashDay(row.clearedOn)}</small>}</td></tr>)}
  </Collection>;
}

export function ReportViewer({ report, onClose }: { report: Report; onClose: () => void }) {
  async function pdf() {
    const { createCashPdf } = await import("./cashPdf");
    return createCashPdf(report).output("blob");
  }
  return <DocViewer title={report.title} subtitle="Prévia do relatório" onClose={onClose} pdf={pdf} actions={<div className="doc-viewer-actions">
    <Button onClick={() => window.print()}>Imprimir</Button>
  </div>}>
    <article className={`cash-paper${report.tables.some((table) => table.columns.length > 8) ? " cash-paper-wide" : ""}`}>
      <header><p>QUALINUTRI · DADOS DE DEMONSTRAÇÃO</p><h1>{report.title}</h1><p>{report.subtitle}</p></header>
      {report.tables.map((table, index) => <section key={index}>
        {table.label && <h2>{table.label}</h2>}
        <table><thead><tr>{table.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{table.rows.length ? table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) :
            <tr><td colSpan={table.columns.length}>Nenhum lançamento neste recorte.</td></tr>}</tbody>
          {table.total && <tfoot><tr>{table.total.map((cell, index) => <td key={index}>{cell}</td>)}</tr></tfoot>}
        </table>
      </section>)}
    </article>
  </DocViewer>;
}

function OperationForm({ operation, banks, expected, onClose, onSaved }: { operation: Operation; banks: BankId[]; expected: number; onClose: () => void; onSaved: (message: string) => void }) {
  const [method, setMethod] = useState<CashMethod>("Dinheiro");
  const [error, setError] = useState("");
  const desk = operation.type === "desk";
  const pending = desk && (method.startsWith("Cartão") || method === "Cheque");
  const titles = { entry: "Lançamento avulso", open: "Abrir sessão de caixa", close: "Fechar sessão de caixa", desk: "Registrar no balcão", clear: "Compensar recebimento", transfer: "Transferir entre contas" };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "");
    const value = (key: string) => Number(data.get(key));
    const date = text("date") || cashToday();
    try {
      switch (operation.type) {
        case "open": openCashSession(text("account") as "daily" | "safe", value("amount")); break;
        case "close": closeCashSession(operation.session.id, value("amount")); break;
        case "clear": clearPendingCash(operation.item.id, text("account") as BankId, value("amount"), date); break;
        case "transfer": transferCash(text("account") as CashAccount, text("destination") as CashAccount, value("amount"), date, text("description")); break;
        case "entry":
        case "desk":
          if (pending) {
            if (operation.type !== "desk") return;
            addPendingCash({ method: method as CashPending["method"], gross: value("amount"), fee: value("fee"), due: text("due"), reference: text("reference"), document: text("document"), brand: text("brand") }, operation.session.id, value("installments") || 1);
          } else {
            const entry: CashEntry = { account: text("account") as CashAccount, date, document: text("document"), description: text("description"), amount: value("amount"), kind: text("kind") as CashKind, method };
            addCashEntry(entry, operation.type === "desk" ? operation.session.id : undefined);
          }
      }
      onSaved(({ open: "Sessão aberta. A registradora está disponível.", close: "Sessão fechada. O relatório está disponível em Sessões e fechamento.", clear: "Recebimento compensado no banco da demo.", entry: "Lançamento registrado no extrato.", desk: "Movimento registrado na sessão.", transfer: "Transferência registrada nas duas contas." })[operation.type]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar."); }
  };
  return <Dialog title={titles[operation.type]} onClose={onClose}>
    <form onSubmit={submit}>
      {operation.type === "close" && <p>Saldo esperado em dinheiro: <strong>{money(expected)}</strong>. Informe a contagem física para registrar a diferença.</p>}
      {operation.type === "clear" && <p><strong>{operation.item.reference}</strong> · parcela {operation.item.installment}/{operation.item.installments} · bruto {money(operation.item.gross)} · taxa prevista {money(operation.item.fee)}</p>}
      <div className="cash-fields cash-form">
        {(operation.type === "entry" || desk) && <Field name="Forma de pagamento"><select value={method} onChange={(e) => setMethod(e.target.value as CashMethod)}>{options(desk ? ["Dinheiro", "Pix", "Cartão débito", "Cartão crédito", "Cheque"] : ["Dinheiro", "Pix", "Transferência", "Boleto", "Depósito"])}</select></Field>}
        {(operation.type === "entry" || operation.type === "open" || operation.type === "transfer" || operation.type === "clear" || (desk && method === "Pix")) && <Field name={operation.type === "clear" || desk ? "Conta bancária" : operation.type === "transfer" ? "Conta de origem" : "Conta / caixa"}><select name="account">{accountOptions(operation.type === "open" ? ["daily", "safe"] : operation.type === "clear" || desk ? banks : liquidAccounts)}</select></Field>}
        {operation.type === "transfer" && <Field name="Conta de destino"><select name="destination" defaultValue="safe">{accountOptions(liquidAccounts)}</select></Field>}
        {(operation.type === "clear" || operation.type === "entry" || operation.type === "transfer") && <Field name={operation.type === "clear" ? "Data da compensação" : "Data do movimento"}><input name="date" type="date" required defaultValue={cashToday()} max={cashToday()} min={operation.type === "clear" ? operation.item.date : undefined} /></Field>}
        {(operation.type === "entry" || (desk && !pending)) && <Field name="Tipo de movimento"><select name="kind" defaultValue={desk ? "Recebimento à vista" : "Saída avulsa"}>{options(CASH_KINDS.filter((kind) => kind !== "Transferência"))}</select></Field>}
        {(operation.type === "entry" || desk) && <Field name="Documento"><input name="document" maxLength={40} required={pending} placeholder="Ex.: VEN-005" /></Field>}
        {(operation.type === "entry" || operation.type === "transfer" || (desk && !pending)) && <Field name="Histórico"><input name="description" required maxLength={160} /></Field>}
        {pending && <>
          <Field name={method === "Cheque" ? "Número do cheque" : "Número de autorização"}><input name="reference" maxLength={40} required /></Field>
          {method !== "Cheque" && <Field name="Bandeira"><input name="brand" maxLength={35} required placeholder="Ex.: Visa" /></Field>}
          <Field name="Primeiro vencimento"><input name="due" type="date" required min={cashToday()} defaultValue={cashToday()} /></Field>
          {method === "Cartão crédito" && <Field name="Parcelas"><input name="installments" type="number" min="1" max="12" defaultValue="1" required /></Field>}
          {method !== "Cheque" && <Field name="Taxa total (R$)"><input name="fee" type="number" min="0" step="0.01" max="1000000000" defaultValue="0" required /></Field>}
        </>}
        <Field name={operation.type === "open" ? "Saldo inicial (R$)" : operation.type === "close" ? "Valor contado (R$)" : operation.type === "clear" ? "Valor líquido recebido (R$)" : "Valor (R$)"}>
          <input name="amount" type="number" step="0.01" min={operation.type === "close" || operation.type === "open" ? 0 : 0.01} required
            max={operation.type === "clear" ? operation.item.gross : 1000000000} defaultValue={operation.type === "clear" ? cashRound(operation.item.gross - operation.item.fee) : undefined} />
        </Field>
      </div>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="dialog-actions"><Button onClick={onClose}>Cancelar</Button><button type="submit" className="primary-button">{operation.type === "close" ? "Confirmar fechamento" : operation.type === "clear" ? "Confirmar compensação" : "Registrar na demo"}</button></div>
    </form>
  </Dialog>;
}
