import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, ChevronsDown, ChevronsUp, Search } from "lucide-react";
import logoUrl from "../assets/qualinutri-logo.png";
import { DataSourceStatus } from "../components/DataSourceStatus";
import { tabIcons, tabLabels, useVisibleGroups, type TabId } from "./AppSidebar";
import { UserMenu } from "./UserMenu";

type AppHeaderProps = {
  activeTab: TabId;
  menuOpen: boolean;
  collapsed: boolean;
  badges?: Partial<Record<TabId, number>>;
  alertCount?: number;
  onNavigate: (tab: TabId) => void;
  onToggleMenu: () => void;
  onToggleCollapsed: () => void;
  onExpand: () => void;
  onOpenSearch?: () => void;
  onOpenAlerts?: () => void;
};

/** Barra de navegação superior em vidro. Recolhe numa pílula flutuante. */
export function AppHeader({ activeTab, menuOpen, collapsed, badges = {}, alertCount = 0, onNavigate, onToggleMenu, onToggleCollapsed, onExpand, onOpenSearch, onOpenAlerts }: AppHeaderProps) {
  const groups = useVisibleGroups();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const ActiveIcon = tabIcons[activeTab];

  useEffect(() => {
    if (!openGroup) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [openGroup]);

  function go(tab: TabId) {
    setOpenGroup(null);
    onNavigate(tab);
  }

  return (
    <>
    <div className={`topbar-spacer${collapsed ? " is-compact" : ""}`} aria-hidden="true" />
    {collapsed && (
      <button type="button" className="logo-pill glass-dark" onClick={onExpand} aria-label={`${tabLabels[activeTab]} · abrir a barra de navegação`} title="Abrir a barra de navegação">
        <img src={logoUrl} alt="Qualinutri" />
        <span className="logo-pill-hint"><ActiveIcon size={14} aria-hidden="true" />{tabLabels[activeTab]}<ChevronsDown size={14} aria-hidden="true" /></span>
      </button>
    )}
    {!collapsed && (
    <header className="app-topbar glass-dark">
      <button type="button" className="menu-toggle" aria-controls="app-sidebar" aria-expanded={menuOpen} onClick={onToggleMenu}>
        <span aria-hidden="true" />
        <span className="sr-only">{menuOpen ? "Fechar menu" : "Abrir menu"}</span>
      </button>
      <button type="button" className="topbar-brand" onClick={() => go("dashboard")} aria-label="Ir para o Início">
        <img src={logoUrl} alt="" />
      </button>

      {(
        <nav className="top-nav" aria-label="Áreas do sistema" ref={navRef}>
          {groups.map((group) => {
            if (!group.label) {
              const item = group.items[0];
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" className="top-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => go(item.id)}>
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              );
            }
            const containsActive = group.items.some((item) => item.id === activeTab);
            const groupBadge = group.items.reduce((total, item) => total + (badges[item.id] ?? 0), 0);
            const isOpen = openGroup === group.label;
            if (group.items.length === 1) {
              const item = group.items[0];
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" className="top-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => go(item.id)}>
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              );
            }
            return (
              <div className={`top-nav-group${isOpen ? " is-open" : ""}`} key={group.label}>
                <button
                  type="button"
                  className={`top-nav-link${containsActive ? " is-active" : ""}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                >
                  {group.label}
                  {groupBadge > 0 && <span className="nav-badge">{groupBadge > 99 ? "99+" : groupBadge}</span>}
                  <ChevronDown size={15} className="top-nav-chevron" aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="mega-panel glass">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const badge = badges[item.id];
                      return (
                        <button key={item.id} type="button" className="mega-item" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => go(item.id)}>
                          <span className="mega-icon"><Icon size={20} aria-hidden="true" /></span>
                          <span className="mega-text">
                            <strong>{item.label}{badge ? <span className="nav-badge">{badge}</span> : null}</strong>
                            <small>{item.hint}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}

      <div className="topbar-actions">
        {onOpenSearch && (
          <button type="button" className="command-trigger" onClick={onOpenSearch}>
            <Search size={17} aria-hidden="true" />
            <span>Buscar</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        <DataSourceStatus />
        <span className="demo-pill" title="Todos os dados são fictícios e ficam salvos só neste navegador.">Demonstração</span>
        {onOpenAlerts && (
          <button type="button" className="icon-button" onClick={onOpenAlerts} aria-label={`Alertas${alertCount ? `: ${alertCount}` : ""}`}>
            <Bell size={19} aria-hidden="true" />
            {alertCount > 0 && <span className="icon-badge">{alertCount > 99 ? "99+" : alertCount}</span>}
          </button>
        )}
        <UserMenu />
        <button type="button" className="icon-button collapse-button" onClick={onToggleCollapsed} aria-label="Recolher a barra (fica só o logo)" title="Recolher barra">
          <ChevronsUp size={19} aria-hidden="true" />
        </button>
      </div>
    </header>
    )}
    </>
  );
}

/** Título da tela, logo abaixo da barra. */
export function PageHeading({ title, group }: { title: string; group: string | null }) {
  return (
    <div className="page-heading">
      {group && <span className="page-crumb">{group}</span>}
      <h1>{title}</h1>
    </div>
  );
}
