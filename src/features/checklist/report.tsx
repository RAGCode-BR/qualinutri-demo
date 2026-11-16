import { Printer } from "lucide-react";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import { summaryLine } from "../../demo/checklist/compliance";
import { TAB_BY_ID } from "../../demo/checklist/tabs";
import type { ChecklistRecord, ChecklistTabId } from "../../demo/checklist/types";
import type { DemoTables } from "../../demo/store/types";
import { statusLabels } from "./shared";

export type TabReportRequest = { tabId: ChecklistTabId; records: ChecklistRecord[]; periodLabel: string };

/** Relatório da aba como documento A4 no visualizador: ver na tela, ver/baixar o PDF ou imprimir. */
export function TabReportViewer({ request, tables, onClose }: { request: TabReportRequest; tables: DemoTables; onClose: () => void }) {
  const { tabId, records, periodLabel } = request;
  const tab = TAB_BY_ID[tabId];
  const count = (status: string) => records.filter((record) => record.status === status).length;
  return (
    <DocViewer title={`${tab.label} · relatório`} subtitle={periodLabel} onClose={onClose}
      actions={<div className="doc-viewer-actions"><button type="button" className="primary-button compact-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir</button></div>}>
      <article className="simple-doc">
        <header><h1>{tab.label}</h1><p>Qualinutri · Gestão Integrada — {periodLabel} · emitido em {new Date().toLocaleString("pt-BR")}</p></header>
        <dl className="simple-doc-kpis">
          <div><dt>Registros</dt><dd>{records.length}</dd></div>
          <div><dt>Conformes</dt><dd>{count("conforme")}</dd></div>
          <div><dt>Pendentes</dt><dd>{count("pendente")}</dd></div>
          <div><dt>Fora de conformidade</dt><dd>{count("nao_conforme")}</dd></div>
        </dl>
        <p><b>Regra:</b> {tab.rule}</p>
        <table>
          <thead><tr><th>Data</th><th>Item</th><th>Responsável</th><th>Etapa</th><th>Situação</th><th>Evid.</th><th>Obs.</th></tr></thead>
          <tbody>{records.length ? records.map((record) => <tr key={record.id}>
            <td>{new Date(record.date).toLocaleString("pt-BR")}</td><td>{record.targetLabel ?? summaryLine(tabId, record, tables)}</td><td>{record.responsible}</td>
            <td>{record.stage ?? "—"}</td><td className={`s-${record.status}`}>{statusLabels[record.status]}</td><td>{record.evidence.length}</td><td>{record.notes || ""}</td>
          </tr>) : <tr><td colSpan={7}>Nenhum registro no período.</td></tr>}</tbody>
        </table>
        <footer>Dados de demonstração.</footer>
      </article>
    </DocViewer>
  );
}
