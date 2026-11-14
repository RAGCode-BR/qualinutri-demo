import { useMemo, useState } from "react";
import { Calculator, Printer } from "lucide-react";
import { Panel } from "../components/Panel";
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

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));
}

/** Compara o mesmo pedido em todos os prazos: preço da saca, total e vencimentos de cada parcela. */
function TermSimulator() {
  const { data: { products, paymentTermLabels } } = useCommercialData();
  const [productName, setProductName] = useState("");
  const [bags, setBags] = useState(100);
  const [baseDate, setBaseDate] = useState(() => isoDate(today()));
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

  function print() {
    if (!product) return;
    const body = rows.map((row) => `<tr><td>${escape(row.label)}</td><td>${formatCurrency(row.price)}</td><td><b>${formatCurrency(row.total)}</b></td><td>${row.parcels.map((part) => `${dateBr(part.dueDate)}: ${formatCurrency(part.amount)}`).join("<br>")}${row.single ? `<br><i>ou direto em ${dateBr(row.single.dueDate)}</i>` : ""}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Simulação de prazos</title><style>body{font:13px/1.45 system-ui,sans-serif;color:#0e2116;margin:32px}h1{font-size:20px;margin:0 0 4px}p{color:#4a5850}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8e3;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#5f7366}footer{margin-top:20px;color:#5f7366;font-size:11px}</style></head><body><h1>Simulação de prazos de pagamento</h1><p>${bags} sacas de ${escape(product.name)} (${product.weightKg} kg · ${tons.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t) · data base ${dateBr(baseDate)}</p><table><thead><tr><th>Prazo</th><th>Preço da saca</th><th>Total</th><th>Vencimentos</th></tr></thead><tbody>${body}</tbody></table><footer>Valores de tabela, sem desconto de linha, frete ou chapa. Qualinutri · emitido em ${new Date().toLocaleString("pt-BR")}.</footer><script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  return (
    <Panel
      title="Simular prazos"
      description="Escolha um produto e a quantidade: veja o preço e os vencimentos em cada prazo, lado a lado."
      actions={<button type="button" className="secondary-button compact-secondary" onClick={print} disabled={!rows.length}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir / PDF</button>}
    >
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
