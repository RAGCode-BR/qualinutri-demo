import type { ReactNode } from "react";
import type { CalculatorController } from "./useCalculator";
import { FreightForm } from "./FreightForm";
import { Select } from "../../components/Select";
import { BAG_WEIGHTS_KG } from "../../domain/order/orderWeight";
import { describePaymentTerm, paymentModeLabels, type PaymentMode } from "../../domain/payment/paymentTerm";

type CalculatorFormProps = {
  controller: CalculatorController;
  /** Conteúdo exibido entre o bloco Produto e o bloco Pagamento (a lista de itens). */
  afterProduct?: ReactNode;
};

export function CalculatorForm({ controller, afterProduct }: CalculatorFormProps) {
  const { itemForm } = controller;
  const { discountLines, paymentTermLabels, products } = controller.data;
  // A linha personalizada é a que não tem percentual fixo.
  const selectedLine = itemForm.discountLineIndex === "" ? undefined : discountLines[Number(itemForm.discountLineIndex)];
  const customDiscount = selectedLine !== undefined && selectedLine.percentage === null;
  const editing = controller.editingIndex !== null;
  const termLabel = controller.paymentTermIndex === "" ? "" : paymentTermLabels[Number(controller.paymentTermIndex)] ?? "";

  return (
    <form className="calculator-form" onSubmit={(event) => { event.preventDefault(); controller.submitItem(); }}>
      <fieldset className={`panel form-section${editing ? " is-editing" : ""}`}>
        <legend className="panel-title">{editing ? "Editando produto" : "Produto"}</legend>

        <div className="field">
          <label htmlFor="product">Produto</label>
          <Select
            id="product"
            aria-describedby="productHint"
            value={itemForm.productIndex}
            onChange={controller.changeProduct}
            options={[
              { value: "", label: "Informar preço manualmente" },
              ...products.map((product, index) => ({ value: String(index), label: `${product.name} (${product.group})` })),
            ]}
          />
          <p className="field-hint" id="productHint">Opcional. Ao escolher um produto, o preço e o peso são preenchidos. O preço segue o prazo escolhido em Pagamento (à vista, enquanto o prazo não é escolhido).</p>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="tablePrice">Preço de tabela</label>
            <div className="input-affix">
              <span aria-hidden="true">R$</span>
              <input id="tablePrice" name="tablePrice" aria-invalid={controller.itemError?.field === "tablePrice" || undefined} aria-describedby={controller.itemError?.field === "tablePrice" ? "itemError" : undefined} type="number" min="0" step="0.01" placeholder="0,00" value={itemForm.tableUnitPrice} onChange={(event) => controller.changeItemField("tableUnitPrice", event.target.value)} />
              <span aria-hidden="true">/saca</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="discountLine">Linha de desconto</label>
            <Select
              id="discountLine"
              value={itemForm.discountLineIndex}
              onChange={(value) => controller.changeItemField("discountLineIndex", value)}
              options={[
                { value: "", label: "Selecione a linha" },
                ...discountLines.map((line, index) => ({ value: String(index), label: `${line.name}${line.percentage !== null ? ` (${line.percentage}%)` : ""}` })),
              ]}
            />
          </div>
          {customDiscount && (
            <div className="field">
              <label htmlFor="customDiscount">Desconto personalizado</label>
              <div className="input-affix">
                <input id="customDiscount" name="customDiscount" type="number" min="0" max="100" step="0.01" placeholder="0" value={itemForm.customDiscountPercentage} onChange={(event) => controller.changeItemField("customDiscountPercentage", event.target.value)} />
                <span aria-hidden="true">%</span>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="quantity">Quantidade</label>
            <div className="input-affix">
              <input id="quantity" name="quantity" aria-invalid={controller.itemError?.field === "quantity" || undefined} aria-describedby={controller.itemError?.field === "quantity" ? "itemError" : undefined} type="number" min="1" step="1" value={itemForm.quantity} onChange={(event) => controller.changeItemField("quantity", event.target.value)} />
              <span aria-hidden="true">sacas</span>
            </div>
          </div>
          {controller.showManualWeight && (
            <div className="field">
              <label htmlFor="bagWeight">Peso da saca</label>
              <Select
                id="bagWeight"
                value={itemForm.bagWeightKg}
                onChange={(value) => controller.changeItemField("bagWeightKg", value)}
                placeholder="Escolha o peso"
                aria-describedby={controller.itemError?.field === "bagWeight" ? "itemError" : undefined}
                options={[
                  { value: "", label: "Escolha o peso" },
                  // Peso diferente vindo de um orçamento antigo continua disponível ao editar.
                  ...(itemForm.bagWeightKg && !BAG_WEIGHTS_KG.some((weight) => String(weight) === itemForm.bagWeightKg)
                    ? [{ value: itemForm.bagWeightKg, label: `${itemForm.bagWeightKg.replace(".", ",")} kg` }] : []),
                  ...BAG_WEIGHTS_KG.map((weight) => ({ value: String(weight), label: `${weight} kg` })),
                ]}
              />
            </div>
          )}
        </div>

        {controller.itemError && <p className="field-error item-error" id="itemError" role="alert">{controller.itemError.message}</p>}
        <div className="form-actions">
          <button id="addItemButton" type="submit" className="primary-button">
            {editing ? "Salvar alterações do produto" : "Adicionar ao pedido"}
          </button>
          {editing && (
            <button type="button" className="secondary-button" onClick={controller.cancelEditing}>Cancelar edição</button>
          )}
        </div>
      </fieldset>

      {afterProduct}

      <fieldset className="panel form-section">
        <legend className="panel-title">Pagamento</legend>
        <div className="field payment-term-field">
          <label htmlFor="paymentTerm">Prazo de pagamento</label>
          <Select
            id="paymentTerm"
            value={controller.paymentTermIndex}
            onChange={controller.changePaymentTerm}
            placeholder="Selecione o prazo"
            aria-describedby="paymentTermHint"
            options={[
              { value: "", label: "Selecione o prazo" },
              ...paymentTermLabels.map((term, index) => ({ value: String(index), label: term })),
            ]}
          />
          <p className="field-hint" id="paymentTermHint">
            {controller.paymentTermIndex === "" && controller.items.length > 0
              ? "Os preços estão à vista. Escolha o prazo combinado com o cliente: os preços da tabela se ajustam e o orçamento só salva com o prazo escolhido."
              : "Vale para todos os produtos do orçamento. Ao trocar, os preços da tabela se ajustam; preços digitados à mão não mudam."}
          </p>
        </div>
        {controller.needsPaymentMode && (
          <div className="field payment-mode-field">
            <span className="field-label" id="paymentModeLabel">Forma do prazo</span>
            <div className="segmented" role="group" aria-labelledby="paymentModeLabel" aria-describedby="paymentModeHint">
              {(["installments", "single"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  id={mode === "installments" ? "paymentMode" : undefined}
                  type="button"
                  aria-pressed={controller.paymentMode === mode}
                  className={controller.paymentMode === mode ? "is-selected" : undefined}
                  onClick={() => controller.setPaymentMode(mode)}
                >
                  {paymentModeLabels[mode]}
                </button>
              ))}
            </div>
            <p className="field-hint" id="paymentModeHint">
              {describePaymentTerm(termLabel, "installments")} · {describePaymentTerm(termLabel, "single")}. Mesmo preço nas duas formas; sai no PDF do orçamento.
            </p>
          </div>
        )}
        <label className="check-field" htmlFor="anticipatedPayment">
          <input id="anticipatedPayment" name="anticipatedPayment" type="checkbox" checked={controller.anticipatedPayment} onChange={(event) => controller.setAnticipatedPayment(event.target.checked)} />
          <span>Pagamento antecipado <small>Desconto adicional de 1,5% sobre o pedido</small></span>
        </label>

        {controller.calculation.showAccumulationWarning && (
          <div className="warning-message" role="status">Somar o 1,5% do pagamento antecipado ao desconto de linha depende de aprovação do <strong>Gestor Comercial e da Diretoria</strong>, caso a caso.</div>
        )}
      </fieldset>

      <FreightForm
        controller={controller}
      />
    </form>
  );
}
