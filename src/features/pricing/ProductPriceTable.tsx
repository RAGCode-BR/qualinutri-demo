import { ScrollableTable } from "../../components/ScrollableTable";
import { useCommercialData } from "../../app/CommercialDataProvider";
import type { Product } from "../../types/commercial";

type ProductPriceTableProps = {
  products: Product[];
  label: string;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
};

function formatPrice(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function ProductPriceTable({ products, label, onEdit, onDelete }: ProductPriceTableProps) {
  const { data: { paymentTermLabels } } = useCommercialData();
  const editable = Boolean(onEdit || onDelete);
  const columnCount = paymentTermLabels.length + 2 + (editable ? 1 : 0);
  let currentGroup = "";

  return (
    <ScrollableTable>
      <table className="data-table price-table stack-table stack-grid" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Produto</th>
            <th scope="col" className="numeric">Peso (kg)</th>
            {paymentTermLabels.map((term) => <th scope="col" className="numeric" key={term}>{term}</th>)}
            {editable && <th scope="col"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const showGroup = product.group !== currentGroup;
            currentGroup = product.group;
            return [
              showGroup ? <tr className="table-group" key={`${product.group}-group`}><th scope="rowgroup" colSpan={columnCount}>{product.group}</th></tr> : null,
              <tr key={product.id ?? product.name}>
                <td className="cell-primary">{product.name}</td>
                <td className="numeric" data-label="Peso (kg)">{product.weightKg}</td>
                {product.prices.map((price, index) => <td className="numeric" data-label={paymentTermLabels[index]} key={`${product.name}-${index}`}>{formatPrice(price)}</td>)}
                {editable && (
                  <td className="action-cell">
                    {onEdit && <button type="button" className="row-button" onClick={() => onEdit(product)}>Editar<span className="sr-only"> {product.name}</span></button>}
                    {onDelete && <button type="button" className="row-button is-danger" onClick={() => onDelete(product)}>Excluir<span className="sr-only"> {product.name}</span></button>}
                  </td>
                )}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
