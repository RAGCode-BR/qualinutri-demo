import { Panel } from "../components/Panel";
import { ScrollableTable } from "../components/ScrollableTable";
import { useCommercialData } from "../app/CommercialDataProvider";

export function PaymentTermsPage() {
  const { data: { paymentTerms } } = useCommercialData();
  return (
    <>
      <Panel title="Modalidades de pagamento" description="Todos os prazos podem ser oferecidos conforme a tabela vigente." flush>
        <ScrollableTable>
          <table className="data-table stack-table">
            <thead><tr><th scope="col">Modalidade</th><th scope="col">Prazo ou condição</th><th scope="col">Observações</th></tr></thead>
            <tbody>{paymentTerms.map((term) => (
              <tr key={term.id}><td className="strong cell-primary">{term.label}</td><td data-label="Prazo ou condição">{term.condition}</td><td className="muted-cell cell-note">{term.notes}</td></tr>
            ))}</tbody>
          </table>
        </ScrollableTable>
      </Panel>
      <Panel title="Regras gerais">
        <ul className="note-list">
          <li>Pedido mínimo: <strong>1 tonelada</strong>.</li>
          <li>Compra para retirada: até 6 meses para retirar. Depois disso, <strong>R$ 1,00 por saca ao mês</strong>.</li>
        </ul>
      </Panel>
    </>
  );
}
