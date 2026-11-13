import { cell, type Column, type Fmt, type ReportKpi, type Table } from "./core";

/* ---------- formatação para tela, PDF e CSV ---------- */

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function formatValue(value: string | number | null | undefined, format: Fmt = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && format !== "date") return value;
  const n = Number(value);
  switch (format) {
    case "currency": return currency.format(n);
    case "number": return number.format(n);
    case "percent": return `${decimal.format(n)}%`;
    case "tons": return `${decimal.format(n)} t`;
    case "kg": return `${number.format(n)} kg`;
    case "days": return `${number.format(n)} ${n === 1 ? "dia" : "dias"}`;
    case "date": {
      const text = String(value);
      return /^\d{4}-\d{2}-\d{2}/.test(text) ? `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}` : text;
    }
    default: return String(value);
  }
}

/* ---------- CSV (Excel em português: ponto e vírgula, BOM UTF-8) ---------- */

export function toCsv(table: Table): string {
  const escape = (text: string) => /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  const raw = (column: Column, value: string | number | null) => {
    if (value === null) return "";
    if (typeof value === "number") return String(value).replace(".", ",");
    return column.format === "date" ? formatValue(value, "date") : value;
  };
  const lines = [table.columns.map((column) => escape(column.label)).join(";")];
  for (const row of [...table.rows, ...(table.total ? [table.total] : [])]) lines.push(table.columns.map((column) => escape(raw(column, cell(row, column.key)))).join(";"));
  return `﻿${lines.join("\r\n")}`;
}

export function toJson(title: string, filters: Record<string, string>, kpis: ReportKpi[], table: Table): string {
  return JSON.stringify({
    relatorio: title,
    geradoEm: new Date().toISOString(),
    filtros: filters,
    indicadores: kpis.map((kpi) => ({ indicador: kpi.label, valor: kpi.text ?? kpi.value, formato: kpi.format })),
    colunas: table.columns.map((column) => column.label),
    linhas: table.rows.map((row) => Object.fromEntries(table.columns.map((column) => [column.label, cell(row, column.key)]))),
  }, null, 2);
}

/* ---------- XLSX (Office Open XML) gerado no navegador ---------- */

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

// Estilos: 0 normal · 1 cabeçalho · 2 moeda · 3 inteiro · 4 percentual · 5 data · 6 decimal · 7 título · 8 total
const STYLE: Partial<Record<Fmt, number>> = { currency: 2, number: 3, percent: 4, date: 5, tons: 6, kg: 3, days: 3 };

function colName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function excelDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function cellXml(ref: string, value: string | number | null, format: Fmt | undefined, style?: number) {
  if (value === null || value === "") return `<c r="${ref}"${style ? ` s="${style}"` : ""}/>`;
  if (format === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return `<c r="${ref}" s="${style ?? 5}"><v>${excelDate(value)}</v></c>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    const v = format === "percent" ? value / 100 : value;
    return `<c r="${ref}" s="${style ?? STYLE[format ?? "text"] ?? 6}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

function sheetXml(rows: string[], widths: number[], freezeRow?: number) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const pane = freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/><numFmt numFmtId="167" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF13582D"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13582D"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCF1DF"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="9"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/><xf numFmtId="167" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/><xf fillId="3" applyFill="1"/></cellXfs></styleSheet>`;

/** Planilha .xlsx com a tabela do relatório (aba 1) e os indicadores e filtros (aba 2). */
export function toXlsx(title: string, filterLines: string[], kpis: ReportKpi[], table: Table): Uint8Array {
  const dataRows: string[] = [];
  dataRows.push(`<row r="1">${cellXml("A1", title, "text", 7)}</row>`);
  dataRows.push(`<row r="2">${cellXml("A2", filterLines.join(" · "), "text")}</row>`);
  const headerIndex = 4;
  dataRows.push(`<row r="${headerIndex}">${table.columns.map((column, index) => cellXml(`${colName(index)}${headerIndex}`, column.label, "text", 1)).join("")}</row>`);
  table.rows.forEach((row, rowIndex) => {
    const r = headerIndex + 1 + rowIndex;
    dataRows.push(`<row r="${r}">${table.columns.map((column, index) => cellXml(`${colName(index)}${r}`, cell(row, column.key), column.format)).join("")}</row>`);
  });
  if (table.total) {
    const r = headerIndex + 1 + table.rows.length;
    dataRows.push(`<row r="${r}">${table.columns.map((column, index) => {
      const value = cell(table.total!, column.key);
      return value === null ? `<c r="${colName(index)}${r}" s="8"/>` : cellXml(`${colName(index)}${r}`, value, column.format, typeof value === "number" ? undefined : 8);
    }).join("")}</row>`);
  }
  const widths = table.columns.map((column) => Math.min(48, Math.max(column.label.length + 4, ...table.rows.slice(0, 200).map((row) => formatValue(cell(row, column.key), column.format).length + 2))));

  const kpiRows = [`<row r="1">${cellXml("A1", `${title} — indicadores`, "text", 7)}</row>`, `<row r="3">${cellXml("A3", "Indicador", "text", 1)}${cellXml("B3", "Valor", "text", 1)}${cellXml("C3", "Período anterior", "text", 1)}</row>`];
  kpis.forEach((kpi, index) => {
    const r = 4 + index;
    kpiRows.push(`<row r="${r}">${cellXml(`A${r}`, kpi.label, "text")}${kpi.text ? cellXml(`B${r}`, kpi.text, "text") : cellXml(`B${r}`, kpi.value, kpi.format)}${kpi.previous !== undefined ? cellXml(`C${r}`, kpi.previous, kpi.format) : ""}</row>`);
  });
  const filterStart = 6 + kpis.length;
  kpiRows.push(`<row r="${filterStart}">${cellXml(`A${filterStart}`, "Filtros", "text", 1)}</row>`);
  filterLines.forEach((line, index) => kpiRows.push(`<row r="${filterStart + 1 + index}">${cellXml(`A${filterStart + 1 + index}`, line, "text")}</row>`));

  const sheetName = (name: string) => xml(name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31));
  const files: [string, string][] = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName(table.title || "Dados")}" sheetId="1" r:id="rId1"/><sheet name="Indicadores" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(dataRows, widths, headerIndex)],
    ["xl/worksheets/sheet2.xml", sheetXml(kpiRows, [38, 22, 22])],
  ];
  return zip(files.map(([name, content]) => [name, new TextEncoder().encode(content)]));
}

/* ---------- ZIP sem compressão (suficiente para o .xlsx) ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(entries: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    const record = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(record.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    record.set(nameBytes, 46);
    chunks.push(local, data);
    central.push(record);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const part of [...chunks, ...central, end]) { out.set(part, position); position += part.length; }
  return out;
}

export function download(name: string, content: Uint8Array | string, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fileSlug(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
