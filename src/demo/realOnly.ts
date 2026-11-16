import { useSyncExternalStore } from "react";

/**
 * Modo "Somente dados reais": o sistema mostra só o que veio dos PDFs TGA (01–13/11/2026)
 * e esconde telas, cartões, contadores e alertas com dados fictícios da demonstração.
 * Usa strings nas telas para não criar dependência circular com o menu.
 */
const KEY = "qualinutri-demo:real-only";

/** Telas com dados reais: Início, Vendedores, Relatórios e Produtos (Tabelas). */
export const REAL_ONLY_TABS: ReadonlySet<string> = new Set(["dashboard", "sellers", "analytics", "prices"]);

function read() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

let value = read();
const listeners = new Set<() => void>();

export const isRealOnly = () => value;

export function setRealOnly(next: boolean) {
  value = next;
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* sem armazenamento */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useRealOnly() {
  return useSyncExternalStore(subscribe, isRealOnly, isRealOnly);
}
