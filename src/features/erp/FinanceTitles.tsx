import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { PAYMENT_METHODS, type BankId, type Settlement, type SettlementInput, type SupplierCredit } from "../../demo/erp/types";
import { CASH_ACCOUNTS, cashState } from "../../demo/erp/cash";
import { getDemoViewer } from "../../demo/app/session";
import { registerSupplierCredit } from "../../demo/erp/service";
import { isoDate, today } from "../../demo/store/ids";
import { dateBr, money } from "./shared";

export type TitleFilter = { basis: "due" | "issued" | "paid" | "created"; from: string; to: string; account: string; method: string; document: string; min: string; max: string };
export const initialTitleFilter: TitleFilter = { basis: "due", from: "", to: "", account: "", method: "", document: "", min: "", max: "" };
type TitleFields = { due: string; issued?: string | null; paid?: string | null; created?: string | null; account?: string | null; method?: string; document: string; amount: number };
export function matchesTitleFilter(row: TitleFields, filter: TitleFilter) {
  const date = row[filter.basis]?.slice(0, 10);
  return (!filter.from || !!date && date >= filter.from) && (!filter.to || !!date && date <= filter.to) &&
    (!filter.account || filter.account === row.account) && (!filter.method || filter.method === row.method) &&
    row.document.toLocaleLowerCase("pt-BR").includes(filter.document.trim().toLocaleLowerCase("pt-BR")) &&
    (filter.min === "" || row.amount >= Number(filter.min)) && (filter.max === "" || row.amount <= Number(filter.max));
}
export function TitleSearch({ value, onChange }: { value: TitleFilter; onChange: (value: TitleFilter) => void }) {
  const set = <K extends keyof TitleFilter>(key: K, next: TitleFilter[K]) => onChange({ ...value, [key]: next });
  return <details><summary>Filtros de lançamentos</summary><div className="cash-fields">
    <label className="field">Data de referência<select value={value.basis} onChange={(e) => set("basis", e.target.value as TitleFilter["basis"])}><option value="due">Vencimento</option><option value="issued">Emissão</option><option value="paid">Baixa</option><option value="created">Cadastro</option></select></label>
    <label className="field">De<input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} /></label>
    <label className="field">Até<input type="date" min={value.from || undefined} value={value.to} onChange={(e) => set("to", e.target.value)} /></label>
    <label className="field">Documento<input type="search" value={value.document} onChange={(e) => set("document", e.target.value)} /></label>
    <label className="field">Conta da baixa<select value={value.account} onChange={(e) => set("account", e.target.value)}><option value="">Todas</option>{(["daily", "safe", "sicoob", "itau"] as const).map((item) => <option value={item} key={item}>{CASH_ACCOUNTS[item]}</option>)}</select></label>
    <label className="field">Forma de pagamento<select value={value.method} onChange={(e) => set("method", e.target.value)}><option value="">Todas</option>{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="field">Valor original mínimo<input type="number" min="0" step="0.01" value={value.min} onChange={(e) => set("min", e.target.value)} /></label>
    <label className="field">Valor original máximo<input type="number" min="0" step="0.01" value={value.max} onChange={(e) => set("max", e.target.value)} /></label>
    <button type="button" className="link-button" onClick={() => onChange(initialTitleFilter)}>Limpar filtros</button>
  </div></details>;
}

export function SettlementHistory({ settlement, bank, date }: { settlement?: Settlement; bank?: string; date?: string | null }) {
  return <div>
    <h3>Histórico da baixa</h3>
    <p>{date ? dateBr(date) : "Sem baixa registrada"}{settlement?.cashAccount ? ` · ${CASH_ACCOUNTS[settlement.cashAccount]}` : bank && ` · ${bank}`}{settlement && ` · ${settlement.method} · ${settlement.by}`}</p>
    {settlement && <>
      <p>Juros {money(settlement.interest)} · Multa {money(settlement.fine)} · Desconto {money(settlement.discount)}
        {settlement.creditKind && ` · ${settlement.creditKind} ${money(settlement.creditAmount ?? 0)}`}</p>
      <p><strong>Valor líquido {money(settlement.net)}</strong></p>
      {settlement.note && <p>{settlement.note}</p>}
    </>}
  </div>;
}

export function SettlementDialog({ title, amount, defaultBank, supplier, onClose, onSubmit }: {
  title: string; amount: number; defaultBank: BankId; supplier?: string; onClose: () => void;
  onSubmit: (bank: BankId, values: SettlementInput) => Promise<void>;
}) {
  const tables = useDemoTables();
  const { erp } = tables;
  const openDesk = cashState(tables).sessions.find((row) => !row.closedAt && row.operatorId === getDemoViewer().id);
  const [bank, setBank] = useState(defaultBank);
  const [value, setValue] = useState<SettlementInput>({ date: isoDate(today()), method: "Pix", interest: 0, fine: 0, discount: 0, note: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const credits = supplier ? (erp.supplierCredits ?? []).filter((item) => item.supplier === supplier && item.remaining > 0 && item.date <= value.date) : [];
  const credit = credits.find((item) => item.id === value.creditId);
  const instrument = value.instrument;
  const net = amount + value.interest + value.fine - value.discount - (value.creditAmount ?? 0);
  return <Dialog title={title} onClose={() => { if (!busy) onClose(); }}>
    <p className="field-hint">{instrument ? "A baixa do título registra o recebimento no balcão. O valor só entra no banco depois da compensação." : "Registre um pagamento ou recebimento já efetivado na conta selecionada."}</p>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError("");
      try { await onSubmit(bank, value); onClose(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar a baixa."); }
      finally { setBusy(false); }
    }}>
      <div className="form-grid">
        <label className="field">Conta da baixa<select value={value.cashAccount ?? bank} onChange={(event) => {
          if (openDesk?.account === event.target.value) setValue({ ...value, cashAccount: openDesk.account, method: "Dinheiro", instrument: undefined, date: isoDate(today()) });
          else { setBank(event.target.value as BankId); setValue({ ...value, cashAccount: undefined, instrument: undefined, method: value.cashAccount ? "Pix" : value.method }); }
        }}>
          {erp.banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          {openDesk && <option value={openDesk.account}>{CASH_ACCOUNTS[openDesk.account]} · sessão {openDesk.number}</option>}
        </select></label>
        <label className="field">Forma de pagamento<select value={value.method} onChange={(event) => {
          const method = event.target.value as SettlementInput["method"];
          setValue({ ...value, method, instrument: value.cashAccount && method !== "Dinheiro" ? { reference: "", brand: "", due: isoDate(today()), fee: 0, installments: 1 } : undefined });
        }}>
          {PAYMENT_METHODS.filter((method) => value.cashAccount ? method === "Dinheiro" || (!supplier && ["Cartão débito", "Cartão crédito", "Cheque"].includes(method)) : !["Dinheiro", "Cartão débito", "Cartão crédito"].includes(method)).map((method) => <option key={method}>{method}</option>)}
        </select></label>
        {instrument && <>
          <label className="field">{value.method === "Cheque" ? "Número do cheque" : "Número de autorização"}<input required value={instrument.reference} onChange={(event) => setValue({ ...value, instrument: { ...instrument, reference: event.target.value } })} /></label>
          {value.method !== "Cheque" && <>
            <label className="field">Bandeira<input required value={instrument.brand} onChange={(event) => setValue({ ...value, instrument: { ...instrument, brand: event.target.value } })} /></label>
            <label className="field">Taxa total (R$)<input required type="number" min="0" step="0.01" value={instrument.fee} onChange={(event) => setValue({ ...value, instrument: { ...instrument, fee: Number(event.target.value) } })} /></label>
          </>}
          <label className="field">Primeiro vencimento<input required type="date" min={isoDate(today())} value={instrument.due} onChange={(event) => setValue({ ...value, instrument: { ...instrument, due: event.target.value } })} /></label>
          {value.method === "Cartão crédito" && <label className="field">Parcelas<input required type="number" min="1" max="12" value={instrument.installments} onChange={(event) => setValue({ ...value, instrument: { ...instrument, installments: Number(event.target.value) } })} /></label>}
        </>}
        <label className="field">Data da baixa<input required type="date" max={isoDate(today())} value={value.date} onChange={(event) => setValue({ ...value, date: event.target.value, creditId: undefined, creditAmount: undefined })} /></label>
        {([["interest", "Juros"], ["fine", "Multa"], ["discount", "Desconto"]] as const).map(([key, label]) =>
          <label className="field" key={key}>{label} (R$)<input type="number" min="0" step="0.01" value={value[key]} onChange={(event) => setValue({ ...value, [key]: Number(event.target.value) })} /></label>)}
        {!!credits.length && <label className="field">Crédito do fornecedor<select value={value.creditId ?? ""} onChange={(event) => setValue({ ...value, creditId: event.target.value || undefined, creditAmount: undefined })}>
          <option value="">Sem abatimento</option>{credits.map((credit) => <option key={credit.id} value={credit.id}>{credit.kind} · {credit.reference} · {money(credit.remaining)}</option>)}
        </select></label>}
        {credit && <label className="field">Valor a abater (R$)<input type="number" min="0" max={credit.remaining} step="0.01" value={value.creditAmount ?? ""} onChange={(event) => setValue({ ...value, creditAmount: Number(event.target.value) })} /></label>}
      </div>
      <label className="field">Observação da baixa<textarea value={value.note} onChange={(event) => setValue({ ...value, note: event.target.value })} /></label>
      <p>Valor original {money(amount)} · <strong>Valor líquido {money(net)}</strong></p>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Voltar</button>
        <button type="submit" className="primary-button" disabled={busy || net < 0}>{busy ? "Registrando…" : "Confirmar baixa"}</button></div>
    </form>
  </Dialog>;
}

export function CreditDialog({ supplier, onClose }: { supplier: string; onClose: () => void }) {
  const { erp } = useDemoTables();
  const [kind, setKind] = useState<SupplierCredit["kind"]>("Devolução");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoDate(today()));
  const [error, setError] = useState("");
  const credits = erp.supplierCredits?.filter((item) => item.supplier === supplier) ?? [];
  return <Dialog title={`Créditos · ${supplier}`} onClose={onClose}>
    {credits.map((credit) => <p key={credit.id}>{credit.kind} · {credit.reference} · {dateBr(credit.date)} · saldo {money(credit.remaining)} de {money(credit.amount)}</p>)}
    <form onSubmit={(event) => {
      event.preventDefault();
      try { registerSupplierCredit({ supplier, kind, date, reference, amount: Number(amount) }); setReference(""); setAmount(""); setError(""); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao registrar crédito."); }
    }}>
      <p className="field-hint">Registre uma devolução confirmada ou um adiantamento já pago ao fornecedor.</p>
      <div className="form-grid">
        <label className="field">Origem<select value={kind} onChange={(event) => setKind(event.target.value as SupplierCredit["kind"])}><option>Devolução</option><option>Adiantamento</option></select></label>
        <label className="field">Referência<input required value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label className="field">Data do crédito<input type="date" required max={isoDate(today())} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="field">Valor do crédito (R$)<input type="number" required min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      </div>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" type="submit">Registrar crédito</button></div>
    </form>
  </Dialog>;
}
