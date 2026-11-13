import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Texto do campo quando nenhum valor corresponde a uma opção. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** Mostra a busca no topo da lista. Padrão: listas com mais de 7 opções. */
  searchable?: boolean;
};

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SEARCH_THRESHOLD = 7;
const LIST_MAX_HEIGHT = 320;
/** Listas grandes (ex.: 1.400 clientes) desenham só os primeiros resultados; a busca encontra o resto. */
const MAX_RENDERED = 100;

/**
 * Lista de seleção do próprio sistema, no lugar da lista nativa do navegador.
 * Abre num popover (camada superior da página), então funciona também dentro
 * das janelas modais. Teclado: setas, Enter, Esc, Home/End e digitar a inicial.
 */
export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = "Selecione",
  disabled = false,
  className,
  searchable,
  ...aria
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listId = `${triggerId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const term = normalize(query.trim());
    return term ? options.filter((option) => normalize(option.label).includes(term)) : options;
  }, [options, query]);
  const visible = useMemo(() => {
    if (matches.length <= MAX_RENDERED) return matches;
    const first = matches.slice(0, MAX_RENDERED);
    // A opção escolhida continua na lista mesmo fora dos primeiros resultados.
    const chosen = matches.find((option) => option.value === value);
    return chosen && !first.includes(chosen) ? [chosen, ...first] : first;
  }, [matches, value]);
  const truncated = matches.length > MAX_RENDERED;

  function place() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < Math.min(LIST_MAX_HEIGHT, 240) && rect.top > spaceBelow;
    const width = Math.max(rect.width, 220);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setPosition({ top: above ? rect.top - 4 : rect.bottom + 4, left, width, above });
  }

  function openList() {
    if (disabled) return;
    place();
    setQuery("");
    // Em lista cortada, a escolhida fora dos primeiros resultados vai para o topo (índice 0).
    const limit = options.length > MAX_RENDERED ? MAX_RENDERED : options.length;
    setActive(Math.max(0, options.slice(0, limit).findIndex((option) => option.value === value && !option.disabled)));
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function choose(option: SelectOption | undefined) {
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  }

  // Popover na camada superior: fica acima até das janelas modais.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    if (open && !popover.matches(":popover-open")) popover.showPopover?.();
    // Em telas de toque, focar a busca abriria o teclado por cima da lista.
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (open) (withSearch && !touch ? searchRef.current : listRef.current)?.focus();
  }, [open, withSearch]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onViewportChange = () => place();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function move(step: number) {
    if (visible.length === 0) return;
    let next = active;
    for (let tries = 0; tries < visible.length; tries += 1) {
      next = (next + step + visible.length) % visible.length;
      if (!visible[next].disabled) break;
    }
    setActive(next);
  }

  function onListKey(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": if (!withSearch) { event.preventDefault(); setActive(visible.findIndex((option) => !option.disabled)); } break;
      case "End": if (!withSearch) { event.preventDefault(); setActive(visible.length - 1); } break;
      case "Enter": event.preventDefault(); choose(visible[active]); break;
      case "Escape": event.preventDefault(); event.stopPropagation(); close(); break;
      case "Tab": close(false); break;
      default:
        if (!withSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          window.clearTimeout(typeahead.current.timer);
          typeahead.current.text += normalize(event.key);
          typeahead.current.timer = window.setTimeout(() => { typeahead.current.text = ""; }, 600);
          const found = visible.findIndex((option) => !option.disabled && normalize(option.label).startsWith(typeahead.current.text));
          if (found >= 0) setActive(found);
        }
    }
  }

  function onTriggerKey(event: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  const activeId = active >= 0 && visible[active] ? `${listId}-${active}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        disabled={disabled}
        className={`select-trigger${selected ? "" : " is-placeholder"}${className ? ` ${className}` : ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className="select-value">{selected?.label ?? placeholder}</span>
      </button>
      {open && position && (
        <div
          ref={popoverRef}
          popover="manual"
          className={`select-popover${position.above ? " is-above" : ""}`}
          style={{ top: position.top, left: position.left, width: position.width }}
          onKeyDown={onListKey}
        >
          {withSearch && (
            <div className="select-search">
              <input
                ref={searchRef}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label="Buscar na lista"
                placeholder="Buscar…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" tabIndex={-1} aria-activedescendant={withSearch ? undefined : activeId} className="select-list">
            {visible.length === 0 && <li className="select-empty">Nada encontrado.</li>}
            {visible.map((option, index) => (
              <li
                key={`${option.value}-${index}`}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={`select-option${index === active ? " is-active" : ""}${option.value === value ? " is-selected" : ""}`}
                onPointerMove={() => { if (!option.disabled) setActive(index); }}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
          {truncated && (
            <p className="select-more">Mostrando {MAX_RENDERED} de {matches.length.toLocaleString("pt-BR")}. Digite para encontrar os demais.</p>
          )}
        </div>
      )}
    </>
  );
}
