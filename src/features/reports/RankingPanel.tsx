import { Panel } from "../../components/Panel";
import type { RankingRow } from "../../services/reportService";
import { formatCurrency, formatNumber } from "../../utils/formatters";

type RankingPanelProps = {
  title: string;
  rows: RankingRow[];
  /** Valor total do período, para a participação de cada linha. */
  total: number;
  emptyText: string;
};

function formatShare(value: number, total: number) {
  if (total <= 0) return "0%";
  const share = (value / total) * 100;
  return `${share < 1 && share > 0 ? "<1" : Math.round(share)}%`;
}

/**
 * Ranking por valor em barras horizontais de uma só cor: a barra é proporcional
 * ao primeiro colocado e o valor fica escrito na linha, sem depender da cor.
 */
export function RankingPanel({ title, rows, total, emptyText }: RankingPanelProps) {
  const max = rows[0]?.revenue ?? 0;
  return (
    <Panel title={title} className="ranking-panel">
      {rows.length === 0 ? (
        <p className="ranking-empty">{emptyText}</p>
      ) : (
        <ol className="ranking-list">
          {rows.map((row, index) => {
            const details = [
              `${formatShare(row.revenue, total)} do total`,
              `${formatNumber(row.orders)} ${row.orders === 1 ? "pedido" : "pedidos"}`,
              row.bags !== undefined ? `${formatNumber(row.bags)} sacas` : null,
            ].filter(Boolean).join(", ");
            return (
              <li key={`${row.name}-${index}`} className="ranking-row">
                <div className="ranking-line">
                  <span className="ranking-position" aria-hidden="true">{index + 1}</span>
                  <span className="ranking-name" title={row.name}>{row.name}</span>
                  <span className="ranking-value">{formatCurrency(row.revenue)}</span>
                </div>
                <div className="ranking-bar-track" aria-hidden="true">
                  <span className="ranking-bar" style={{ width: `${max > 0 ? Math.max((row.revenue / max) * 100, 1.5) : 0}%` }} />
                </div>
                <span className="ranking-details">{details}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
