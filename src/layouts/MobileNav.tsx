import { Calculator, ClipboardCheck, FileText, LayoutDashboard, Menu } from "lucide-react";
import { canAccessTab, type TabId } from "./AppSidebar";
import { useAuth } from "../app/AuthProvider";

type MobileNavProps = { activeTab: TabId; onChange: (tab: TabId) => void; onOpenMenu: () => void };

const shortcuts: Array<{ id: TabId; label: string; icon: typeof Menu }> = [
  { id: "dashboard", label: "Início", icon: LayoutDashboard },
  { id: "calculator", label: "Orçar", icon: Calculator },
  { id: "quotes", label: "Orçamentos", icon: FileText },
  { id: "checklist", label: "Checklist", icon: ClipboardCheck },
];

/** Atalhos fixos no rodapé do celular. */
export function MobileNav({ activeTab, onChange, onOpenMenu }: MobileNavProps) {
  const { profile } = useAuth();
  const items = shortcuts.filter((item) => canAccessTab(item.id, profile)).slice(0, 4);
  return (
    <nav className="mobile-nav glass" aria-label="Atalhos">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button type="button" onClick={onOpenMenu}>
        <Menu size={20} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
