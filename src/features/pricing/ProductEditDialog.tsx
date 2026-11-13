import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { updateProduct } from "../../services/productService";
import type { Product } from "../../types/commercial";

type ProductEditDialogProps = {
  product: Product & { id: string };
  paymentTermIds: readonly string[];
  paymentTermLabels: readonly string[];
  onClose: () => void;
  onSaved: (name: string) => void;
};

export function ProductEditDialog({ product, paymentTermIds, paymentTermLabels, onClose, onSaved }: ProductEditDialogProps) {
  const [name, setName] = useState(product.name);
  const [weight, setWeight] = useState(String(product.weightKg));
  const [prices, setPrices] = useState(product.prices.map((price) => price.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changePrice(index: number, value: string) {
    setPrices((current) => current.map((price, priceIndex) => priceIndex === index ? value : price));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const weightKg = Number.parseFloat(weight);
    const unitPrices = prices.map((price) => Number.parseFloat(price));
    if (!name.trim()) return setError("Informe o nome do produto.");
    if (!(weightKg > 0)) return setError("O peso da saca deve ser maior que zero.");
    if (unitPrices.some((price) => Number.isNaN(price) || price < 0)) return setError("Preencha todos os preços com valores iguais ou maiores que zero.");

    setSaving(true);
    setError("");
    try {
      await updateProduct(product.id, {
        name: name.trim(),
        weightKg,
        prices: unitPrices.map((unitPrice, index) => ({ paymentTermId: paymentTermIds[index], unitPrice })),
      });
      onSaved(name.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o produto.");
      setSaving(false);
    }
  }

  return (
    <Dialog title="Editar produto" description={product.group} onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="form-grid product-form-main">
          <div className="field">
            <label htmlFor="productName">Nome do produto</label>
            <input id="productName" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="productWeight">Peso da saca</label>
            <div className="input-affix">
              <input id="productWeight" type="number" min="0.001" step="0.001" required value={weight} onChange={(event) => setWeight(event.target.value)} />
              <span aria-hidden="true">kg</span>
            </div>
          </div>
        </div>

        <fieldset className="price-fieldset">
          <legend>Preço por saca, por prazo de pagamento</legend>
          <div className="form-grid compact">
            {paymentTermLabels.map((term, index) => (
              <div className="field" key={term}>
                <label htmlFor={`productPrice${index}`}>{term}</label>
                <div className="input-affix">
                  <span aria-hidden="true">R$</span>
                  <input id={`productPrice${index}`} type="number" min="0" step="0.01" required value={prices[index] ?? ""} onChange={(event) => changePrice(index, event.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <p className="field-hint">A alteração vale para a tabela de preços vigente e fica registrada no histórico. Orçamentos já salvos não mudam.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar produto"}</button>
        </div>
      </form>
    </Dialog>
  );
}
