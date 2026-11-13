import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Notice, type NoticeState } from "../../components/Notice";
import { getQuote, type SavedQuoteDetail } from "../../services/quoteService";
import type { QuoteCustomerSnapshot } from "../../types/customer";
import { formatCurrency } from "../../utils/formatters";
import { QuoteCustomerPicker } from "../quotes/QuoteCustomerPicker";
import { quoteStatusLabels } from "../quotes/quoteStatus";
import { SaveQuotePanel } from "../quotes/SaveQuotePanel";
import { CalculatorForm } from "./CalculatorForm";
import { OrderItemsTable } from "./OrderItemsTable";
import { OrderSummary } from "./OrderSummary";
import { useCalculator } from "./useCalculator";
import { hasVisitDraft } from "../visits/visitDraft";

/** Mesmo limite da coluna quotes.notes no banco. */
const QUOTE_NOTES_MAX_LENGTH = 1000;

/** Algo que vai substituir o pedido em montagem e precisa de confirmação. */
type PendingReplace =
  | { kind: "quote"; detail: SavedQuoteDetail }
  | { kind: "customer"; customer: QuoteCustomerSnapshot }
  | { kind: "discard" }
  | null;

export function CalculatorPage() {
  const controller = useCalculator();
  const { profile } = useAuth();
  const { pendingQuoteId, clearPendingQuote, pendingCustomer, clearPendingCustomer } = useQuoteEditing();
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace>(null);
  const { editingQuote, loadQuote, resetOrder, hasWork } = controller;

  function startNewForCustomer(customer: QuoteCustomerSnapshot) {
    resetOrder();
    controller.setCustomer(customer);
  }

  // Abrir orçamento salvo para edição (vindo da página Orçamentos).
  useEffect(() => {
    if (!pendingQuoteId) return;
    let active = true;
    setLoadingQuote(true);
    setNotice(null);
    getQuote(pendingQuoteId)
      .then((detail) => {
        if (!active) return;
        const { quote } = detail;
        if (quote.status !== "draft" && quote.status !== "issued") {
          setNotice({ kind: "error", text: `O orçamento #${quote.quote_number} está ${(quoteStatusLabels[quote.status] ?? quote.status).toLowerCase()} e não pode mais ser editado. Para refazer, use “Duplicar”.` });
          return;
        }
        if (profile?.role !== "administrador" && quote.created_by !== profile?.id) {
          setNotice({ kind: "error", text: "Você só pode editar os seus orçamentos. Para usar este como base, use “Duplicar”." });
          return;
        }
        if (hasWork) setPendingReplace({ kind: "quote", detail });
        else loadQuote(detail);
      })
      .catch(() => { if (active) setNotice({ kind: "error", text: "Não foi possível abrir o orçamento para edição." }); })
      .finally(() => {
        if (!active) return;
        setLoadingQuote(false);
        clearPendingQuote();
      });
    return () => { active = false; };
    // O carregamento depende só do orçamento pedido.
  }, [pendingQuoteId]);

  // Vindo de uma visita: começa um pedido novo já com o cliente escolhido.
  useEffect(() => {
    if (!pendingCustomer) return;
    if (hasWork) setPendingReplace({ kind: "customer", customer: pendingCustomer });
    else startNewForCustomer(pendingCustomer);
    clearPendingCustomer();
    // Depende só do cliente pedido.
  }, [pendingCustomer]);

  // Ao montar um pedido novo, a confirmação do salvamento anterior sai da tela.
  useEffect(() => {
    if (controller.items.length > 0 && notice?.kind === "success") setNotice(null);
  }, [controller.items.length]);

  const itemCount = controller.items.length;
  const workDescription = editingQuote
    ? `As alterações no orçamento #${editingQuote.number} que ainda não foram salvas serão perdidas.`
    : `O pedido em montagem (${itemCount} ${itemCount === 1 ? "item" : "itens"}) será descartado.`;

  return (
    <div className="calculator-layout">
      <div className="calculator-work">
        {loadingQuote && <p className="form-message page-notice" role="status">Abrindo orçamento…</p>}
        <Notice notice={notice} />
        {editingQuote ? (
          <div className="editing-banner" role="status">
            <div>
              <strong>Editando o orçamento #{editingQuote.number}</strong>
              <span>Situação: {quoteStatusLabels[editingQuote.status] ?? editingQuote.status}. Ao salvar, o mesmo número é atualizado com as alterações.</span>
            </div>
            <button type="button" className="secondary-button" onClick={() => setPendingReplace({ kind: "discard" })}>Descartar edição</button>
          </div>
        ) : (
          <p className="page-intro">Monte o pedido produto a produto. Os valores são recalculados na hora, conforme a política comercial vigente.</p>
        )}
        <QuoteCustomerPicker controller={controller} />
        <CalculatorForm controller={controller} afterProduct={<OrderItemsTable controller={controller} />} />
        <section className="panel form-section quote-notes-panel" aria-labelledby="quoteNotesTitle">
          <h2 className="panel-title" id="quoteNotesTitle">Observações <span className="panel-title-note">opcional</span></h2>
          <div className="field">
            <label className="sr-only" htmlFor="quoteNotes">Observações do orçamento</label>
            <textarea
              id="quoteNotes"
              rows={3}
              maxLength={QUOTE_NOTES_MAX_LENGTH}
              placeholder="Ex.: entrega prevista para a semana do dia 20; validade da proposta: 7 dias."
              aria-describedby="quoteNotesHint"
              value={controller.notes}
              onChange={(event) => controller.setNotes(event.target.value)}
            />
            <p className="field-hint" id="quoteNotesHint">Saem no PDF do orçamento, para o cliente. {controller.notes.length}/{QUOTE_NOTES_MAX_LENGTH} caracteres.</p>
          </div>
        </section>
        <p className="muted calculator-note">O desconto incide sobre o preço de tabela, independente da condição de pagamento. Frete e chapa não têm desconto. Pedido mínimo: 1 tonelada.</p>
      </div>
      <aside id="orderTicket" className="calculator-ticket" aria-label="Resumo do pedido">
        <OrderSummary controller={controller} />
        <SaveQuotePanel
          controller={controller}
          onSaved={(text) => {
            setNotice({ kind: "success", text: hasVisitDraft() ? `${text} Volte a Visitas para concluir o registro da visita e vincular este orçamento.` : text });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </aside>
      <div className="ticket-bar">
        <div>
          <span>Total do pedido</span>
          <strong>{formatCurrency(controller.calculation.grandTotal)}</strong>
        </div>
        <a href="#orderTicket">Ver resumo</a>
      </div>

      {pendingReplace?.kind === "quote" && (
        <ConfirmDialog
          title={`Abrir o orçamento #${pendingReplace.detail.quote.quote_number}?`}
          description={workDescription}
          confirmLabel="Abrir orçamento"
          cancelLabel="Continuar no pedido atual"
          onConfirm={() => { loadQuote(pendingReplace.detail); setPendingReplace(null); }}
          onClose={() => setPendingReplace(null)}
        />
      )}
      {pendingReplace?.kind === "customer" && (
        <ConfirmDialog
          title={`Começar um orçamento para ${pendingReplace.customer.name}?`}
          description={workDescription}
          confirmLabel="Começar novo orçamento"
          cancelLabel="Continuar no pedido atual"
          onConfirm={() => { startNewForCustomer(pendingReplace.customer); setPendingReplace(null); }}
          onClose={() => setPendingReplace(null)}
        />
      )}
      {pendingReplace?.kind === "discard" && (
        <ConfirmDialog
          title="Descartar a edição?"
          description={workDescription}
          confirmLabel="Descartar edição"
          cancelLabel="Continuar editando"
          danger
          onConfirm={() => { resetOrder(); setPendingReplace(null); }}
          onClose={() => setPendingReplace(null)}
        />
      )}
    </div>
  );
}
