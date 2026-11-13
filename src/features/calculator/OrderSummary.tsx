import { formatCurrency, formatNumber } from "../../utils/formatters";
import type { CalculatorController } from "./useCalculator";

type OrderSummaryProps = { controller: CalculatorController };

export function OrderSummary({ controller }: OrderSummaryProps) {
  const { calculation } = controller;
  const loadItems = [
    ["Produtos", String(calculation.productCount)],
    ["Sacas", formatNumber(calculation.totalQuantity)],
    ["Peso", `${formatNumber(calculation.totalWeightKg)} kg`],
  ];
  const totalItems = [
    ["Subtotal dos produtos", formatCurrency(calculation.productSubtotal)],
    ["Frete", formatCurrency(calculation.freightTotal)],
    ["Chapa", formatCurrency(calculation.handlingTotal)],
  ];
  return (
    <section className="order-summary" aria-labelledby="orderTotalTitle">
      <div className="summary-head">
        <h2 className="summary-label" id="orderTotalTitle">Total do pedido</h2>
        <p className="summary-total">{formatCurrency(calculation.grandTotal)}</p>
        <p className="summary-caption">Produto, frete e chapa</p>
      </div>

      <dl className="summary-load">
        {loadItems.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <div className="summary-tear" aria-hidden="true" />

      <dl className="summary-lines">
        {totalItems.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
        <div className="summary-saving"><dt>Desconto concedido</dt><dd>{formatCurrency(calculation.economyTotal)}</dd></div>
        <div><dt>Chapa por saca (média)</dt><dd>{formatCurrency(calculation.averageHandlingPerBag)}</dd></div>
      </dl>
    </section>
  );
}
