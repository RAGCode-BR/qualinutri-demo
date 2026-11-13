import { useEffect, useState } from "react";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { loadVisitsReport, type VisitsReport } from "../../services/visitReportService";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import { notDoneReasonLabels, visitTypeLabels, type NotDoneReason, type VisitType } from "../visits/visitModel";
import type { DateRange } from "./reportPeriod";

/** Barras de uma cor só, proporcionais ao maior valor, com o número escrito ao lado. */
function CountBars({ rows, emptyText }: { rows: Array<{ label: string; total: number }>; emptyText: string }) {
  if (rows.length === 0) return <p className="ranking-empty">{emptyText}</p>;
  const max = Math.max(...rows.map((row) => row.total));
  const sum = rows.reduce((total, row) => total + row.total, 0);
  return (
    <ol className="ranking-list">
      {rows.map((row) => (
        <li key={row.label} className="ranking-row">
          <div className="ranking-line">
            <span className="ranking-name">{row.label}</span>
            <span className="ranking-value">{formatNumber(row.total)}</span>
          </div>
          <div className="ranking-bar-track count-bar-track" aria-hidden="true">
            <span className="ranking-bar" style={{ width: `${max > 0 ? Math.max((row.total / max) * 100, 1.5) : 0}%` }} />
          </div>
          <span className="ranking-details count-bar-details">{sum > 0 ? `${Math.round((row.total / sum) * 100)}% do total` : ""}</span>
        </li>
      ))}
    </ol>
  );
}

const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "—");
const formatDate = (value: string | null) => (value ? value.split("-").reverse().join("/") : "Nunca visitado");

export function VisitsReportView({ range, rangeError }: { range: DateRange; rangeError: string | null }) {
  const [report, setReport] = useState<VisitsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (rangeError) return;
    let active = true;
    setLoading(true);
    setError("");
    loadVisitsReport(range)
      .then((result) => { if (active) setReport(result); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o relatório."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to, rangeError]);

  if (error) return <p className="auth-error page-notice" role="alert">{error}</p>;
  if (!report) return <p className="muted">{loading ? "Carregando relatório…" : ""}</p>;

  const { totals, closings } = report;
  const resolved = totals.completed + totals.not_done;
  const hasVisits = resolved + totals.planned > 0;

  return (
    <div className={`report-content${loading ? " is-refreshing" : ""}`} aria-busy={loading}>
      {report.scope === "own" && <p className="report-scope">Mostrando apenas as suas visitas.</p>}
      <dl className="kpi-row kpi-row-4">
        <div className="kpi-tile"><dt>Visitas realizadas</dt><dd>{formatNumber(totals.completed)}</dd></div>
        <div className="kpi-tile"><dt>Taxa de realização</dt><dd>{percent(totals.completed, resolved)}</dd></div>
        <div className="kpi-tile"><dt>Não realizadas</dt><dd>{formatNumber(totals.not_done)}</dd></div>
        <div className="kpi-tile">
          <dt>Agendadas pendentes</dt>
          <dd>{formatNumber(totals.planned)}</dd>
          {totals.overdue > 0 && <span className="kpi-note">{formatNumber(totals.overdue)} {totals.overdue === 1 ? "atrasada" : "atrasadas"}</span>}
        </div>
      </dl>

      {!hasVisits ? (
        <div className="panel">
          <div className="empty-items report-empty">
            <p><strong>Nenhuma visita neste período.</strong></p>
            <p>As visitas são agendadas e registradas na página Visitas.</p>
          </div>
        </div>
      ) : (
        <div className="ranking-grid">
          <Panel title="Fechamentos" className="ranking-panel" description="Visitas de fechamento realizadas no período e o que virou venda.">
            <dl className="closing-funnel">
              <div><dt>Visitas de fechamento</dt><dd>{formatNumber(closings.closing_visits)}</dd></div>
              <div><dt>Com orçamento vinculado</dt><dd>{formatNumber(closings.with_quote)} <small>{percent(closings.with_quote, closings.closing_visits)}</small></dd></div>
              <div><dt>Orçamento aprovado</dt><dd>{formatNumber(closings.approved)} <small>{percent(closings.approved, closings.closing_visits)}</small></dd></div>
              <div className="is-highlight"><dt>Vendido nesses orçamentos</dt><dd>{formatCurrency(closings.approved_value)}</dd></div>
            </dl>
            <p className="field-hint">Valor dos produtos, sem frete e chapa. {formatNumber(totals.customers_visited)} {totals.customers_visited === 1 ? "cliente visitado" : "clientes visitados"} no período.</p>
          </Panel>

          <Panel title="Tipos de visita" className="ranking-panel" description="Uma visita pode ter mais de um tipo.">
            <CountBars rows={report.types.map((row) => ({ label: visitTypeLabels[row.type as VisitType] ?? row.type, total: row.total }))} emptyText="Nenhuma visita realizada no período." />
          </Panel>

          <Panel title="Motivos de não realização" className="ranking-panel">
            <CountBars rows={report.reasons.map((row) => ({ label: notDoneReasonLabels[row.reason as NotDoneReason] ?? row.reason, total: row.total }))} emptyText="Nenhuma visita deixou de ser realizada no período." />
          </Panel>

          {report.sellers && (
            <Panel title="Por vendedor" className="ranking-panel" flush>
              {report.sellers.length === 0 ? <p className="panel-loading">Nenhuma visita no período.</p> : (
                <ScrollableTable>
                  <table className="data-table stack-table">
                    <thead><tr><th scope="col">Vendedor</th><th scope="col" className="numeric">Realizadas</th><th scope="col" className="numeric">Não realizadas</th><th scope="col" className="numeric">Pendentes</th><th scope="col" className="numeric">Realização</th></tr></thead>
                    <tbody>{report.sellers.map((seller) => (
                      <tr key={seller.name}>
                        <td className="strong cell-primary">{seller.name}</td>
                        <td className="numeric" data-label="Realizadas">{formatNumber(seller.completed)}</td>
                        <td className="numeric" data-label="Não realizadas">{formatNumber(seller.not_done)}</td>
                        <td className="numeric" data-label="Pendentes">{formatNumber(seller.planned)}</td>
                        <td className="numeric strong" data-label="Realização">{percent(seller.completed, seller.completed + seller.not_done)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </ScrollableTable>
              )}
            </Panel>
          )}
        </div>
      )}

      <Panel
        title={`Clientes sem visita há mais de ${report.stale_days} dias`}
        description={`${formatNumber(report.stale_total)} ${report.stale_total === 1 ? "cliente ativo" : "clientes ativos"} hoje${report.scope === "own" ? ", considerando as suas visitas" : ""}. Os mais antigos primeiro.`}
        className="stale-panel"
        flush
      >
        {report.stale_customers.length === 0 ? <p className="panel-loading">Todos os clientes ativos foram visitados recentemente.</p> : (
          <ScrollableTable>
            <table className="data-table stack-table">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Última visita</th><th scope="col" className="numeric">Dias sem visita</th></tr></thead>
              <tbody>{report.stale_customers.map((customer) => (
                <tr key={customer.name}>
                  <td className="strong cell-primary">{customer.name}</td>
                  <td data-label="Última visita">{formatDate(customer.last_visit)}</td>
                  <td className="numeric" data-label="Dias sem visita">{customer.days === null ? "—" : formatNumber(customer.days)}</td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollableTable>
        )}
      </Panel>
    </div>
  );
}
