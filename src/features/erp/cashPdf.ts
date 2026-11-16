import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Report } from "../../demo/erp/cashReports";

export function createCashPdf(report: Report) {
  const pdf = new jsPDF({ orientation: report.tables.some((table) => table.columns.length > 8) ? "landscape" : "portrait", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setProperties({ title: report.title, subject: "Qualinutri Demo · Financeiro" });
  pdf.setFont("helvetica", "bold").setFontSize(17).setTextColor(20, 70, 44).text(report.title, 12, 24);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(30);
  const subtitle: string[] = pdf.splitTextToSize(report.subtitle, width - 24);
  pdf.text(subtitle, 12, 31);
  let y = 33 + subtitle.length * 4;
  for (const table of report.tables) {
    if (y + 25 > height - 15) { pdf.addPage(); y = 21; }
    if (table.label) {
      pdf.setFont("helvetica", "bold").setTextColor(20, 70, 44).setFontSize(10).text(table.label, 12, y);
      y += 3;
    }
    autoTable(pdf, { startY: y, margin: { top: 20, bottom: 14, left: 12, right: 12 }, head: [table.columns],
      body: table.rows.length ? table.rows : [[{ content: "Nenhum lançamento neste recorte.", colSpan: table.columns.length }]], foot: table.total ? [table.total] : [],
      showHead: "everyPage", showFoot: "lastPage", rowPageBreak: "avoid", styles: { fontSize: 8, cellPadding: 1.7, overflow: "linebreak" },
      headStyles: { fillColor: [24, 86, 52] }, footStyles: { fillColor: [232, 240, 231], textColor: [20, 70, 44] },
      didDrawPage: (data) => { y = (data.cursor?.y ?? y) + 8; },
    });
  }
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page).setFont("helvetica", "normal").setFontSize(8).setTextColor(90);
    pdf.text("QUALINUTRI · Dados de demonstração", 12, 12);
    pdf.text(`Página ${page} de ${count}`, width - 12, height - 7, { align: "right" });
  }
  return pdf;
}
