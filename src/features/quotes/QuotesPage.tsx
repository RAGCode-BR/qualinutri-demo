import { useEffect, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { useNavigate } from "../../app/NavigationContext";
import { useAuth } from "../../app/AuthProvider";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { failure, Notice, success, type NoticeState } from "../../components/Notice";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { Select } from "../../components/Select";
import { listCustomers, type CustomerSummary } from "../../services/customerService";
import { advanceQuoteStatus, cancelQuote, duplicateQuote, getQuote, getQuoteSellerName, listQuotes, type SavedQuoteDetail, type SavedQuoteSummary } from "../../services/quoteService";
import { getQuoteShipping, type QuoteShipping } from "../../services/loadService";
import { formatCurrency } from "../../utils/formatters";
import { shippingState } from "../loads/loadModel";
import { canAccessTab } from "../../layouts/AppSidebar";
import { QuotePrint } from "./QuotePrint";
import { quoteStatusLabels } from "./quoteStatus";

/** Próximo passo do andamento a partir da situação atual. */
const nextStep: Partial<Record<string, { status: "issued" | "approved"; action: string; done: string }>> = {
  draft: { status: "issued", action: "Marcar como enviado", done: "marcado como enviado" },
  issued: { status: "approved", action: "Marcar como aprovado", done: "marcado como aprovado" },
};

/** Só rascunhos e enviados podem ser editados; aprovados ficam fechados. */
const EDITABLE = new Set(["draft", "issued"]);

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : null;
}

function statusDate(quote: SavedQuoteSummary) {
  if (quote.status === "approved") return formatDate(quote.approved_at);
  if (quote.status === "issued") return formatDate(quote.issued_at);
  return null;
}

type Confirming = { kind: "approve" | "cancel"; quote: SavedQuoteSummary } | null;

export function QuotesPage() {
  const { profile } = useAuth();
  const { openQuoteForEditing } = useQuoteEditing();
  const navigate = useNavigate();
  const canCreate = canAccessTab("calculator", profile);
  const isAdmin = profile?.role === "administrador";
  // O andamento da expedição só aparece para quem vê a página Cargas.
  const showShipping = canAccessTab("loads", profile);
  const [quotes, setQuotes] = useState<SavedQuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [printing, setPrinting] = useState<{ detail: SavedQuoteDetail; sellerName: string | null; nonce: number } | null>(null);
  const [preparingPdfId, setPreparingPdfId] = useState<string | null>(null);
  const [numberSearch, setNumberSearch] = useState("");
  const [searchedNumber, setSearchedNumber] = useState<number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [shipping, setShipping] = useState<Map<string, QuoteShipping>>(new Map());
  const request = useRef(0);
  const hasFilters = searchedNumber !== null || customerFilter !== "all";

  /** O dono do orçamento ou o administrador mudam situação, editam e cancelam. */
  const canManage = (quote: SavedQuoteSummary) => isAdmin || quote.created_by === profile?.id;

  useEffect(() => {
    listCustomers(true).then(setCustomers).catch(() => setNotice(failure("Não foi possível carregar a lista de clientes do filtro.")));
  }, []);

  // Espera o usuário parar de digitar antes de buscar o número.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const digits = numberSearch.replace(/\D/g, "");
      setSearchedNumber(digits ? Number(digits) : null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [numberSearch]);

  async function reload() {
    // Só a resposta da busca mais recente é usada.
    const current = ++request.current;
    setLoading(true);
    try {
      const rows = await listQuotes({ number: searchedNumber, customer: customerFilter });
      if (current !== request.current) return;
      setQuotes(rows);
      setLoadError("");
      // Andamento do envio dos aprovados; é só informativo, sem bloquear a lista.
      if (showShipping) void getQuoteShipping(rows.filter((row) => row.status === "approved").map((row) => row.id)).then((map) => {
        if (current === request.current) setShipping(map);
      });
    } catch {
      if (current === request.current) setLoadError("Não foi possível carregar os orçamentos.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, [searchedNumber, customerFilter]);

  function clearFilters() {
    setNumberSearch("");
    setSearchedNumber(null);
    setCustomerFilter("all");
  }

  async function exportPdf(quote: SavedQuoteSummary) {
    if (preparingPdfId) return;
    setPreparingPdfId(quote.id);
    setNotice(null);
    try {
      const [detail, sellerName] = await Promise.all([getQuote(quote.id), getQuoteSellerName(quote.id)]);
      setPrinting({ detail, sellerName, nonce: Date.now() });
    } catch {
      setNotice(failure(`Não foi possível gerar o PDF do orçamento #${quote.quote_number}.`));
    } finally {
      setPreparingPdfId(null);
    }
  }

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      setNotice(success(await action()));
      await reload();
    } catch (error) {
      setNotice(failure(error instanceof Error ? error.message : "Não foi possível concluir a operação."));
    } finally {
      setBusy(false);
    }
  }

  function advance(quote: SavedQuoteSummary) {
    if (quote.status === "issued") {
      setConfirming({ kind: "approve", quote });
      return;
    }
    const step = nextStep[quote.status];
    if (!step) return;
    void run(async () => {
      await advanceQuoteStatus(quote.id, step.status);
      return `Orçamento #${quote.quote_number} ${step.done}.`;
    });
  }

  function duplicate(quote: SavedQuoteSummary) {
    void run(async () => {
      const saved = await duplicateQuote(quote.id);
      return `Orçamento #${saved.quote_number} criado como rascunho, a partir do #${quote.quote_number}.`;
    });
  }

  async function confirmAction() {
    if (!confirming) return;
    const { kind, quote } = confirming;
    if (kind === "approve") await advanceQuoteStatus(quote.id, "approved");
    else await cancelQuote(quote.id);
    setConfirming(null);
    setNotice(success(kind === "approve" ? `Orçamento #${quote.quote_number} marcado como aprovado.` : `Orçamento #${quote.quote_number} cancelado.`));
    await reload();
  }

  return <>
    <Notice notice={notice} />
    <div className="quote-filters" role="search" aria-label="Buscar orçamentos">
      <div className="field">
        <label htmlFor="quoteNumberSearch">Número do orçamento</label>
        <input
          id="quoteNumberSearch"
          type="search"
          inputMode="numeric"
          placeholder="Ex.: 1042"
          maxLength={12}
          value={numberSearch}
          onChange={(event) => setNumberSearch(event.target.value.replace(/[^\d#]/g, ""))}
        />
      </div>
      <div className="field">
        <label htmlFor="quoteCustomerFilter">Cliente</label>
        <Select
          id="quoteCustomerFilter"
          value={customerFilter}
          onChange={setCustomerFilter}
          searchable
          options={[
            { value: "all", label: "Todos os clientes" },
            { value: "none", label: "Sem cliente vinculado" },
            ...customers.map((customer) => ({ value: customer.id, label: `${customer.legal_name}${customer.legacy_code ? ` · ${customer.legacy_code}` : ""}${customer.active ? "" : " (inativo)"}` })),
          ]}
        />
      </div>
      {hasFilters && <button type="button" className="secondary-button" onClick={clearFilters}>Limpar filtros</button>}
    </div>

    <Panel
      title={hasFilters ? "Orçamentos encontrados" : "Orçamentos salvos"}
      description={hasFilters ? "Até 50 orçamentos mais recentes que atendem à busca." : "Os 50 mais recentes. Use “Novo orçamento” para montar outro."}
      actions={<>
        {!loading && !loadError && <span className="count-badge">{quotes.length} {quotes.length === 1 ? "orçamento" : "orçamentos"}</span>}
        {canCreate && <button type="button" className="primary-button compact-button" onClick={() => navigate("calculator")}><FilePlus2 size={15} aria-hidden="true" />&nbsp;Novo orçamento</button>}
      </>}
      flush
    >
      {loadError ? (
        <div className="empty-items">
          <p><strong>{loadError}</strong></p>
          <p><button type="button" className="link-button" onClick={() => void reload()}>Tentar novamente</button></p>
        </div>
      ) : loading && quotes.length === 0 ? <p className="panel-loading">Carregando orçamentos…</p> : quotes.length === 0 ? (
        hasFilters
          ? <EmptyState title="Nenhum orçamento encontrado.">Confira o número digitado ou escolha outro cliente.</EmptyState>
          : <EmptyState title="Nenhum orçamento salvo.">Monte um pedido na Calculadora e clique em “Salvar orçamento”.</EmptyState>
      ) : <ScrollableTable><table className={`data-table stack-table${loading ? " is-refreshing" : ""}`}>
        <thead><tr><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Situação</th><th scope="col" className="numeric">Total</th><th scope="col" className="numeric">Criado em</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{quotes.map((quote) => {
          const manageable = canManage(quote);
          const step = manageable ? nextStep[quote.status] : undefined;
          const date = statusDate(quote);
          const sent = quote.status === "approved" ? shippingState(shipping.get(quote.id)) : null;
          return <tr key={quote.id}>
            <td className="strong cell-primary">#{quote.quote_number}</td>
            <td data-label="Cliente">{quote.customer_name_snapshot || <span className="muted-cell">Sem cliente</span>}</td>
            <td className="nowrap-cell" data-label="Situação">
              <span className="cell-value">
                <span className={`status-badge is-${quote.status}`}>{quoteStatusLabels[quote.status] ?? quote.status}</span>
                {date && <span className="cell-sub">em {date}</span>}
                {sent && <span className={`status-badge ${sent.badge} shipping-badge`}>{sent.label}</span>}
              </span>
            </td>
            <td className="numeric strong" data-label="Total">{formatCurrency(Number(quote.grand_total))}</td>
            <td className="numeric" data-label="Criado em">{formatDate(quote.created_at)}</td>
            <td className="action-cell">
              {step && <button type="button" className="row-button is-primary" disabled={busy} onClick={() => advance(quote)}>{step.action}<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              {manageable && EDITABLE.has(quote.status) && <button type="button" className="row-button" disabled={busy} onClick={() => openQuoteForEditing(quote.id)}>Editar<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              <button type="button" className="row-button" disabled={busy} onClick={() => duplicate(quote)}>Duplicar<span className="sr-only"> orçamento {quote.quote_number}</span></button>
              {quote.status !== "cancelled" && <button type="button" className="row-button" disabled={preparingPdfId !== null} onClick={() => void exportPdf(quote)}>{preparingPdfId === quote.id ? "Gerando…" : "Exportar"}<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
              {manageable && quote.status !== "cancelled" && <button type="button" className="row-button is-danger" disabled={busy} onClick={() => setConfirming({ kind: "cancel", quote })}>Cancelar<span className="sr-only"> orçamento {quote.quote_number}</span></button>}
            </td>
          </tr>;
        })}</tbody>
      </table></ScrollableTable>}
    </Panel>

    {printing && <QuotePrint key={printing.nonce} detail={printing.detail} sellerName={printing.sellerName} onDone={() => setPrinting(null)} />}

    {confirming?.kind === "approve" && (
      <ConfirmDialog
        title={`Marcar o orçamento #${confirming.quote.quote_number} como aprovado?`}
        description="Aprovado conta como venda nos relatórios e não pode mais ser editado. Para refazer depois, será preciso duplicar."
        confirmLabel="Marcar como aprovado"
        cancelLabel="Voltar"
        onConfirm={confirmAction}
        onClose={() => setConfirming(null)}
      />
    )}
    {confirming?.kind === "cancel" && (
      <ConfirmDialog
        title={`Cancelar o orçamento #${confirming.quote.quote_number}?`}
        description="O cancelamento é definitivo. O orçamento continua na lista como Cancelado, e você pode duplicá-lo se precisar refazer."
        confirmLabel="Cancelar orçamento"
        cancelLabel="Voltar"
        danger
        onConfirm={confirmAction}
        onClose={() => setConfirming(null)}
      />
    )}
  </>;
}
