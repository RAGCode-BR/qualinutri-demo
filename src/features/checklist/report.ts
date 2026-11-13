import { summaryLine } from "../../demo/checklist/compliance";
import { TAB_BY_ID } from "../../demo/checklist/tabs";
import type { ChecklistRecord, ChecklistTabId } from "../../demo/checklist/types";
import type { DemoTables } from "../../demo/store/types";
import { statusLabels } from "./shared";

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));
}

/** Abre o relatório da aba numa janela própria e chama a impressão (salvar em PDF). */
export function printTabReport(tabId: ChecklistTabId, records: ChecklistRecord[], tables: DemoTables, periodLabel: string) {
  const tab = TAB_BY_ID[tabId];
  const count = (status: string) => records.filter((record) => record.status === status).length;
  const rows = records.map((record) => `<tr><td>${new Date(record.date).toLocaleString("pt-BR")}</td><td>${escape(record.targetLabel ?? summaryLine(tabId, record, tables))}</td><td>${escape(record.responsible)}</td><td>${escape(record.stage ?? "—")}</td><td class="s-${record.status}">${statusLabels[record.status]}</td><td>${record.evidence.length}</td><td>${escape(record.notes || "")}</td></tr>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(tab.label)} – relatório</title>
<style>body{font:13px/1.45 system-ui,sans-serif;color:#0e2116;margin:32px}h1{font-size:22px;margin:0}p{color:#4a5850}.k{display:flex;gap:12px;margin:16px 0}.k div{border:1px solid #d6e2d8;border-radius:10px;padding:10px 14px}.k strong{display:block;font-size:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8e3;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#5f7366}.s-conforme{color:#1a7a3c}.s-pendente{color:#7a5300}.s-nao_conforme{color:#b42318;font-weight:700}footer{margin-top:24px;color:#5f7366;font-size:11px}</style></head><body>
<h1>${escape(tab.label)}</h1><p>Qualinutri · Gestão Integrada — ${escape(periodLabel)} · emitido em ${new Date().toLocaleString("pt-BR")}</p>
<div class="k"><div>Registros<strong>${records.length}</strong></div><div>Conformes<strong>${count("conforme")}</strong></div><div>Pendentes<strong>${count("pendente")}</strong></div><div>Fora de conformidade<strong>${count("nao_conforme")}</strong></div></div>
<p><b>Regra:</b> ${escape(tab.rule)}</p>
<table><thead><tr><th>Data</th><th>Item</th><th>Responsável</th><th>Etapa</th><th>Situação</th><th>Evid.</th><th>Obs.</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Dados de demonstração.</footer><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
