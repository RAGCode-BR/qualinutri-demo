import { useMemo, useState } from "react";
import { Calculator, Printer } from "lucide-react";
import { Panel } from "../components/Panel";
import { DocViewer } from "../components/demo/docs/DocViewer";
import { ScrollableTable } from "../components/ScrollableTable";
import { Select } from "../components/Select";
import { useCommercialData } from "../app/CommercialDataProvider";
import { splitPaymentTerm } from "../domain/payment/paymentTerm";
import { installmentsFor } from "../demo/kpis/finance";
import { isoDate, today } from "../demo/store/ids";
import { formatCurrency } from "../utils/formatters";

export function PaymentTermsPage() {
  const { data: { paymentTerms } } = useCommercialData();
  return (
    <>
      <TermSimulator />
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

type Part = { dueDate: string; amount: number };
type Row = { label: string; price: number; total: number; parcels: Part[]; single: Part | null };

function dateBr(key: string) {
  return key.split("-").reverse().join("/");
}

/** Compara o mesmo pedido em todos os prazos: preço da saca, total e vencimentos de cada parcela. */
function TermSimulator() {
  const { data: { products, paymentTermLabels } } = useCommercialData();
  const [productName, setProductName] = useState("");
  const [bags, setBags] = useState(100);
  const [baseDate, setBaseDate] = useState(() => isoDate(today()));
  const [viewing, setViewing] = useState(false);
  const product = products.find((item) => item.name === productName) ?? products[0];

  const rows = useMemo<Row[]>(() => {
    if (!product || !(bags > 0)) return [];
    return paymentTermLabels.map((label, index) => {
      const price = product.prices[index] ?? product.prices[0];
      const total = Math.round(price * bags * 100) / 100;
      const split = splitPaymentTerm(label);
      // Meio-dia local: uma data pura (AAAA-MM-DD) seria lida em UTC e voltaria um dia no Brasil.
      const base = `${baseDate}T12:00:00`;
      return {
        label,
        price,
        total,
        parcels: installmentsFor(label, split ? "installments" : null, total, base),
        single: split ? installmentsFor(label, "single", total, base)[0] : null,
      };
    });
  }, [product, bags, baseDate, paymentTermLabels]);

  const cash = rows[0]?.total ?? 0;
  const tons = product ? (bags * product.weightKg) / 1000 : 0;

  return (
    <Panel
      title="Simular prazos"
      description="Escolha um produto e a quantidade: veja o preço e os vencimentos em cada prazo, lado a lado."
      actions={<button type="button" className="secondary-button compact-secondary" onClick={() => setViewing(true)} disabled={!rows.length}><Printer size={15} aria-hidden="true" />&nbsp;Ver / imprimir PDF</button>}
    >
      {viewing && product && (
        <DocViewer title="Simulação de prazos" subtitle={`${bags} sacas de ${product.name}`} onClose={() => setViewing(false)}
          actions={<div className="doc-viewer-actions"><button type="button" className="primary-button compact-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir</button></div>}>
          <article className="simple-doc">
            <header><h1>Simulação de prazos de pagamento</h1><p>{bags} sacas de {product.name} ({product.weightKg} kg · {tons.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t) · data base {dateBr(baseDate)}</p></header>
            <table><thead><tr><th>Prazo</th><th>Preço da saca</th><th>Total</th><th>Vencimentos</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{formatCurrency(row.price)}</td><td><b>{formatCurrency(row.total)}</b></td>
                <td>{row.parcels.map((part) => <div key={part.dueDate}>{dateBr(part.dueDate)}: {formatCurrency(part.amount)}</div>)}{row.single && <i>ou direto em {dateBr(row.single.dueDate)}</i>}</td></tr>)}</tbody></table>
            <footer>Valores de tabela, sem desconto de linha, frete ou chapa. Qualinutri · emitido em {new Date().toLocaleString("pt-BR")}.</footer>
          </article>
        </DocViewer>
      )}
      <div className="term-sim-form">
        <div className="field">
          <label htmlFor="termSimProduct">Produto</label>
          <Select id="termSimProduct" value={product?.name ?? ""} onChange={setProductName} options={products.map((item) => ({ value: item.name, label: `${item.name} (${item.weightKg} kg)` }))} />
        </div>
        <div className="field">
          <label htmlFor="termSimBags">Sacas</label>
          <input id="termSimBags" type="number" min={1} step={10} value={bags || ""} onChange={(event) => setBags(Number(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="termSimDate">Data base (aprovação)</label>
          <input id="termSimDate" type="date" value={baseDate} onChange={(event) => setBaseDate(event.target.value || isoDate(today()))} />
        </div>
      </div>
      {tons > 0 && tons < 1 && <p className="form-message">Abaixo do pedido mínimo de 1 tonelada ({tons.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t).</p>}
      {rows.length > 0 ? (
        <ScrollableTable>
          <table className="data-table stack-table">
            <thead><tr><th scope="col">Prazo</th><th scope="col">Preço da saca</th><th scope="col">Total</th><th scope="col">Diferença do à vista</th><th scope="col">Vencimentos</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.label}>
                <td className="strong cell-primary">{row.label}</td>
                <td data-label="Preço da saca">{formatCurrency(row.price)}</td>
                <td data-label="Total"><strong>{formatCurrency(row.total)}</strong></td>
                <td data-label="Diferença do à vista">{row.total === cash ? "—" : `+ ${formatCurrency(row.total - cash)}`}</td>
                <td data-label="Vencimentos" className="cell-note">
                  {row.parcels.map((part, index) => <span key={index} className="term-sim-parcel">{row.parcels.length > 1 ? `${index + 1}ª ` : ""}{dateBr(part.dueDate)} · {formatCurrency(part.amount)}</span>)}
                  {row.single && <span className="term-sim-parcel muted">ou direto: {dateBr(row.single.dueDate)} · {formatCurrency(row.single.amount)}</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollableTable>
      ) : <p className="muted"><Calculator size={14} aria-hidden="true" /> Informe a quantidade de sacas.</p>}
    </Panel>
  );
}
