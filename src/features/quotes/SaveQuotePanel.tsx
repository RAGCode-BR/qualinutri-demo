import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { createQuoteSnapshot } from "../../domain";
import { createQuote, updateQuote } from "../../services/quoteService";
import type { CalculatorController } from "../calculator/useCalculator";

export function SaveQuotePanel({ controller, onSaved }: { controller: CalculatorController; onSaved: (message: string) => void }) {
  const { source } = useCommercialData();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const { editingQuote } = controller;
  const canSave = profile?.role === "administrador" || profile?.role === "comercial";
  useEffect(() => {
    if (editingQuote) setMessage("");
  }, [editingQuote]);
  if (!canSave) return null;

  // Sem conexão com o servidor os preços podem estar desatualizados: não salva.
  const offline = source !== "supabase";

  // Escolher a forma do prazo resolve o aviso que pedia essa escolha.
  useEffect(() => { setMessage(""); }, [controller.paymentMode, controller.paymentTermIndex]);

  async function save() {
    if (saving || controller.items.length === 0 || offline) return;
    if (controller.paymentTermIndex === "") {
      setMessage("Escolha o prazo de pagamento no bloco Pagamento.");
      document.getElementById("paymentTerm")?.focus();
      return;
    }
    if (controller.needsPaymentMode && !controller.paymentMode) {
      setMessage("Escolha no bloco Pagamento se o prazo é parcelado ou direto.");
      document.getElementById("paymentMode")?.focus();
      return;
    }
    setSaving(true);
    setMessage("");
    const range = controller.freightForm.table === "juara"
      ? controller.data.juaraFreightRates[Number(controller.freightForm.rangeIndex)]?.distance
      : controller.freightForm.table === "regional"
        ? controller.data.regionalFreightRates[Number(controller.freightForm.rangeIndex)]?.location
        : null;
    const snapshot = createQuoteSnapshot({
      items: controller.items,
      calculation: controller.calculation,
      products: controller.data.products,
      paymentTermLabels: controller.data.paymentTermLabels,
      catalog: controller.data,
      anticipatedPayment: controller.anticipatedPayment,
      handlingRatePerTon: Number.parseFloat(controller.handlingRatePerTon) || 0,
      freight: {
        tableName: controller.freightForm.table === "juara" ? "Juara" : controller.freightForm.table === "regional" ? "Regional" : null,
        zone: range ?? null,
        loadType: controller.freightForm.table ? controller.freightForm.loadType : null,
      },
      customer: controller.customer,
      notes: controller.notes,
      paymentMode: controller.paymentMode || null,
    });
    try {
      if (editingQuote) {
        await updateQuote(editingQuote.id, snapshot);
        onSaved(`Orçamento #${editingQuote.number} atualizado. A calculadora foi limpa para um novo pedido.`);
      } else {
        const result = await createQuote(snapshot);
        onSaved(`Orçamento #${result.quote_number} salvo. A calculadora foi limpa para um novo pedido.`);
      }
      controller.resetOrder();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : editingQuote ? "Não foi possível salvar as alterações do orçamento." : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="save-quote-panel" aria-label="Salvar orçamento">
    <p className="save-quote-customer">Cliente: <strong>{controller.customer?.name ?? "sem cliente vinculado"}</strong></p>
    {offline && <p className="warning-message save-offline">Não foi possível confirmar os preços atuais. Aguarde a reconexão para salvar.</p>}
    <button type="button" className="primary-button" disabled={saving || controller.items.length === 0 || offline} onClick={() => void save()}>{saving ? "Salvando…" : editingQuote ? `Salvar alterações no #${editingQuote.number}` : "Salvar orçamento"}</button>
    {message && <p role="alert" className="auth-error">{message}</p>}
  </section>;
}
