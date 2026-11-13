import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Download, ExternalLink, Search, X } from "lucide-react";
import type { DrawerSelection } from "../../demo/kpis/dashboard";
import { formatCell } from "./format";

type DetailDrawerProps = {
  selection: DrawerSelection;
  targetLabel?: string;
  onOpenTarget?: () => void;
  onClose: () => void;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function toCsv(selection: DrawerSelection, rows: DrawerSelection["rows"]) {
  const escape = (value: string) => /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = selection.columns.map((column) => escape(column.label)).join(";");
  const lines = rows.map((row) => selection.columns.map((column) => {
    const value = row[column.key];
    if (typeof value === "number") return String(value).replace(".", ",");
    return escape(value === null || value === undefined ? "" : String(value));
  }).join(";"));
  return `﻿${[header, ...lines].join("\n")}`;
}

/** Gaveta lateral com a lista detalhada de um indicador. */
export function DetailDrawer({ selection, targetLabel, onOpenTarget, onClose }: DetailDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const rows = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = needle
      ? selection.rows.filter((row) => selection.columns.some((column) => normalize(String(row[column.key] ?? "")).includes(needle)))
      : selection.rows;
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === "number" && typeof right === "number") return (left - right) * sort.dir;
      return String(left ?? "").localeCompare(String(right ?? ""), "pt-BR") * sort.dir;
    });
  }, [query, selection, sort]);

  function exportCsv() {
    const blob = new Blob([toCsv(selection, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${normalize(selection.title).replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const total = selection.columns.find((column) => column.format === "currency");

  return (
    <dialog ref={ref} className="detail-drawer" aria-labelledby="drawer-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="drawer-inner">
        <header className="drawer-head">
          <div>
            <p className="drawer-kicker">{rows.length} {rows.length === 1 ? "registro" : "registros"}{total ? ` · ${formatCell(rows.reduce((sum, row) => sum + Number(row[total.key] ?? 0), 0), "currency")}` : ""}</p>
            <h2 id="drawer-title">{selection.title}</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="drawer-tools">
          <label className="drawer-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" placeholder="Filtrar na lista" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="secondary-button compact-secondary" onClick={exportCsv}><Download size={16} aria-hidden="true" />&nbsp;CSV</button>
          {onOpenTarget && targetLabel && (
            <button type="button" className="primary-button compact-button" onClick={onOpenTarget}>Abrir em {targetLabel}&nbsp;<ExternalLink size={15} aria-hidden="true" /></button>
          )}
        </div>
        <div className="drawer-table">
          {rows.length === 0 ? <p className="drawer-empty">Nada para mostrar neste período.</p> : (
            <table>
              <thead>
                <tr>
                  {selection.columns.map((column) => (
                    <th key={column.key} className={column.format && column.format !== "text" && column.format !== "date" ? "is-number" : undefined}>
                      <button type="button" onClick={() => setSort((current) => ({ key: column.key, dir: current?.key === column.key ? (current.dir === 1 ? -1 : 1) : -1 }))}>
                        {column.label}<ArrowDownUp size={12} aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)} style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}>
                    {selection.columns.map((column) => (
                      <td key={column.key} className={column.format && column.format !== "text" && column.format !== "date" ? "is-number" : undefined}>{formatCell(row[column.key] ?? null, column.format)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </dialog>
  );
}
