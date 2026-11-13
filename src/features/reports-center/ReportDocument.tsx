import logoUrl from "../../assets/qualinutri-logo.png";
import { cell, type ReportResult } from "../../demo/reports/core";
import { formatValue } from "../../demo/reports/export";
import { ReportChart } from "./ReportCharts";

const MAX_ROWS = 400;

/** Página A4 do relatório: cabeçalho, filtros, indicadores, gráficos e tabela. */
export function ReportDocument({ title, area, filterLines, result }: { title: string; area: string; filterLines: string[]; result: ReportResult }) {
  const numeric = (format?: string) => !!format && format !== "text" && format !== "date";
  const rows = result.table.rows.slice(0, MAX_ROWS);
  return (
    <article className="rc-doc">
      <header className="rc-doc-head">
        <img src={logoUrl} alt="Qualinutri" />
        <div>
          <span>{area}</span>
          <strong>{title}</strong>
          <small>Gerado em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
        </div>
      </header>
      <p className="rc-doc-filters">{filterLines.join(" · ")}</p>
      <section className="rc-doc-kpis">
        {result.kpis.map((kpi) => (
          <div key={kpi.id}>
            <span>{kpi.label}</span>
            <strong>{kpi.text ?? formatValue(kpi.value, kpi.format)}</strong>
            {kpi.text && <small>{formatValue(kpi.value, kpi.format)}</small>}
            {kpi.previous !== undefined && !kpi.text && <small>Anterior: {formatValue(kpi.previous, kpi.format)}</small>}
          </div>
        ))}
      </section>
      <section className="rc-doc-charts">
        {result.charts.map((chart) => <ReportChart key={chart.id} chart={chart} still />)}
      </section>
      <section className="rc-doc-table">
        <h3>{result.table.title} <small>({result.table.rows.length} linhas{result.table.rows.length > MAX_ROWS ? `; as primeiras ${MAX_ROWS} no PDF, todas no Excel` : ""})</small></h3>
        <table>
          <thead><tr>{result.table.columns.map((column) => <th key={column.key} className={numeric(column.format) ? "is-number" : undefined}>{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{result.table.columns.map((column) => <td key={column.key} className={numeric(column.format) ? "is-number" : undefined}>{formatValue(cell(row, column.key), column.format)}</td>)}</tr>)}</tbody>
          {result.table.total && <tfoot><tr>{result.table.columns.map((column) => <td key={column.key} className={numeric(column.format) ? "is-number" : undefined}>{cell(result.table.total!, column.key) === null ? "" : formatValue(cell(result.table.total!, column.key), column.format)}</td>)}</tr></tfoot>}
        </table>
      </section>
      <footer className="rc-doc-foot">Qualinutri Ind. Com. de Nutrição Animal Ltda · Juara/MT · Relatório gerado pelo sistema de gestão (dados de demonstração).</footer>
    </article>
  );
}
