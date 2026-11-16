import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, FileText, Search, Truck, User } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { canAccessTab, navGroups, type TabId } from "../../layouts/AppSidebar";
import { formatKpi } from "./format";
import { REAL_SHORTCUTS, openReal } from "../../demo/history/entry";
import { isRealOnly } from "../../demo/realOnly";
import { history as realHistory, customerName as realCustomer } from "../../demo/history/sales";

type Result = { id: string; kind: string; title: string; detail?: string; icon: typeof Search; run: () => void };

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type CommandPaletteProps = { onNavigate: (tab: TabId) => void; onClose: () => void };

/** Busca global: telas, clientes, orçamentos, veículos e registros. Enter abre. */
export function CommandPalette({ onNavigate, onClose }: CommandPaletteProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const tables = useDemoTables();
  const { profile } = useAuth();
  const { openCalculatorForCustomer } = useQuoteEditing();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const results = useMemo<Result[]>(() => {
    const needle = normalize(query.trim());
    const go = (tab: TabId) => () => { onClose(); onNavigate(tab); };
    const screens: Result[] = navGroups.flatMap((group) => group.items)
      .filter((item) => canAccessTab(item.id, profile))
      .filter((item) => !needle || normalize(`${item.label} ${item.hint}`).includes(needle))
      .map((item) => ({ id: `tab-${item.id}`, kind: "Tela", title: item.label, detail: item.hint, icon: item.icon, run: go(item.id) }));
    const realOk = canAccessTab("analytics", profile);
    const real = (target: Parameters<typeof openReal>[0]) => () => { onClose(); openReal(target, onNavigate); };
    const realScreens: Result[] = realOk ? REAL_SHORTCUTS
      .filter((item) => !needle || normalize(`${item.label} ${item.hint} ${item.source} real tga pdf relatorio`).includes(needle))
      .map((item) => ({ id: `real-${item.key}`, kind: "Relatório real · TGA", title: item.label, detail: `${item.hint} · ${item.source}`, icon: FileText, run: real(item.target) })) : [];
    if (!needle) return [...realScreens, ...screens];
    const list: Result[] = [...realScreens, ...screens];
    if (realOk) {
      for (const [id, name] of Object.entries(realHistory.sellers).filter(([id, name]) => normalize(`${id} ${name}`).includes(needle)).slice(0, 4)) {
        list.push({ id: `rs-${id}`, kind: "Vendedor real · TGA", title: `${id} · ${name}`, detail: "Vendas gerais do vendedor (01–13/11)", icon: User, run: real({ kind: "report", id: "vendas-periodo", seller: id }) });
      }
      const products = new Map(realHistory.products.map((row) => [row.code, row.name]));
      for (const [code, name] of [...products].filter(([code, name]) => normalize(`${code} ${name}`).includes(needle)).slice(0, 4)) {
        list.push({ id: `rp-${code}`, kind: "Produto real · TGA", title: `${code} · ${name}`, detail: "Quem vendeu, quantidade e valor (01–13/11)", icon: FileText, run: real({ kind: "report", id: "vendas-produto", product: code }) });
      }
      const docs = realHistory.documents.filter((row) => normalize(`${row.document} ${row.customerCode} ${realCustomer(row)}`).includes(needle));
      for (const row of docs.slice(0, 4)) {
        list.push({ id: `rd-${row.document}-${row.customerCode}`, kind: "Venda real · TGA", title: `${row.document} · ${realCustomer(row)}`, detail: `${row.date.split("-").reverse().join("/")} · ${formatKpi(row.net, "currency")}`, icon: FileText, run: real({ kind: "history", tab: "documents", query: row.document }) });
      }
    }
    if (isRealOnly()) return list;
    if (canAccessTab("customers", profile)) {
      for (const customer of tables.customers.filter((row) => row.active && normalize(`${row.legal_name} ${row.trade_name ?? ""} ${row.document ?? ""}`).includes(needle)).slice(0, 6)) {
        list.push({ id: `c-${customer.id}`, kind: "Cliente · Enter cria orçamento", title: customer.legal_name, detail: customer.document ?? undefined, icon: User, run: () => { onClose(); openCalculatorForCustomer({ id: customer.id, name: customer.legal_name, document: customer.document }); } });
      }
    }
    if (canAccessTab("quotes", profile)) {
      const number = Number(needle.replace(/\D/g, ""));
      for (const quote of tables.quotes.filter((row) => (number && String(row.quote_number).includes(String(number))) || normalize(row.customer_name_snapshot ?? "").includes(needle)).slice(0, 6)) {
        list.push({ id: `q-${quote.id}`, kind: "Orçamento", title: `#${quote.quote_number} · ${quote.customer_name_snapshot ?? "Sem cliente"}`, detail: formatKpi(quote.grand_total, "currency"), icon: FileText, run: go("quotes") });
      }
    }
    if (canAccessTab("loads", profile)) {
      for (const vehicle of tables.vehicles.filter((row) => row.active && normalize(`${row.name} ${row.plate ?? ""}`).includes(needle)).slice(0, 4)) {
        list.push({ id: `v-${vehicle.id}`, kind: "Veículo", title: vehicle.name, detail: vehicle.plate ?? undefined, icon: Truck, run: go("loads") });
      }
    }
    return list;
  }, [query, tables, profile, onClose, onNavigate, openCalculatorForCustomer]);

  useEffect(() => setActive(0), [query]);

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(results.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    if (event.key === "Enter") { event.preventDefault(); results[active]?.run(); }
  }

  return (
    <dialog ref={ref} className="command-palette" aria-label="Busca global" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="palette-inner">
        <label className="palette-search">
          <Search size={20} aria-hidden="true" />
          <input autoFocus placeholder="Busque telas, clientes, orçamentos, veículos…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} aria-controls="palette-results" />
          <kbd>Esc</kbd>
        </label>
        <ul id="palette-results" className="palette-results" role="listbox">
          {results.length === 0 && <li className="palette-empty">Nada encontrado para “{query}”.</li>}
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <li key={result.id} role="option" aria-selected={index === active}>
                <button type="button" onMouseEnter={() => setActive(index)} onClick={result.run}>
                  <span className="palette-icon"><Icon size={18} aria-hidden="true" /></span>
                  <span className="palette-text"><strong>{result.title}</strong>{result.detail && <small>{result.detail}</small>}</span>
                  <span className="palette-kind">{result.kind}</span>
                  {index === active ? <CornerDownLeft size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
