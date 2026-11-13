import { DataSourceStatus } from "../components/DataSourceStatus";

type AppHeaderProps = {
  title: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
};

export function AppHeader({ title, menuOpen, onToggleMenu }: AppHeaderProps) {
  return (
    <header className="app-topbar">
      <button
        type="button"
        className="menu-toggle"
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span aria-hidden="true" />
        <span className="sr-only">{menuOpen ? "Fechar menu" : "Abrir menu"}</span>
      </button>
      <h1>{title}</h1>
      <DataSourceStatus />
    </header>
  );
}
