import { ScrollableTable } from "../../components/ScrollableTable";
import { formatCurrency, formatPercentage, formatNumber } from "../../utils/formatters";
import type { CalculatorController } from "./useCalculator";

type OrderItemsTableProps = { controller: CalculatorController };

export function OrderItemsTable({ controller }: OrderItemsTableProps) {
  const count = controller.items.length;
  return (
    <section className="panel order-items" aria-labelledby="orderItemsTitle">
      <div className="order-items-header">
        <h2 className="panel-title" id="orderItemsTitle">Itens do pedido</h2>
        <span className="count-badge">{count} {count === 1 ? "produto" : "produtos"}</span>
      </div>
      {controller.lastRemoved && (
        <p className="undo-bar" role="status">
          <span>“{controller.lastRemoved.item.name}” foi removido do pedido.</span>
          <button type="button" className="link-button" onClick={controller.undoRemove}>Desfazer</button>
        </p>
      )}
      {controller.calculation.items.length === 0 ? (
        <div className="empty-items">
          <p><strong>Nenhum produto no pedido.</strong></p>
          <p>Preencha os dados do produto e clique em “Adicionar ao pedido”.</p>
        </div>
      ) : (
        <ScrollableTable>
          <table className="data-table stack-table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col" className="numeric">Preço tabela</th>
                <th scope="col" className="numeric">Desconto</th>
                <th scope="col" className="numeric">Sacas</th>
                <th scope="col" className="numeric">Subtotal</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>{controller.calculation.items.map((calculatedItem, index) => {
              const sourceItem = controller.items[index];
              const isEditing = controller.editingIndex === index;
              return (
                <tr key={sourceItem.id} className={isEditing ? "is-editing" : undefined}>
                  <td className="product-cell cell-primary">
                    <span className="strong">{sourceItem.name}</span>
                    <span className="cell-sub">Saca de {formatNumber(sourceItem.weightKg)} kg · {formatNumber(sourceItem.weightKg * sourceItem.quantity)} kg</span>
                  </td>
                  <td className="numeric" data-label="Preço tabela">{formatCurrency(sourceItem.tableUnitPrice)}</td>
                  <td className="numeric discount-cell" data-label="Desconto">{formatPercentage(calculatedItem.totalDiscountPercentage)}</td>
                  <td className="numeric" data-label="Sacas">{sourceItem.quantity}</td>
                  <td className="numeric strong" data-label="Subtotal">{formatCurrency(calculatedItem.productSubtotal)}</td>
                  <td className="action-cell">
                    <button type="button" className="row-button" onClick={() => controller.editItem(index)}>Editar<span className="sr-only"> {sourceItem.name}</span></button>
                    <button type="button" className="row-button is-danger" onClick={() => controller.removeItem(index)}>Remover<span className="sr-only"> {sourceItem.name}</span></button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </ScrollableTable>
      )}
    </section>
  );
}
