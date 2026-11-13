import {
  BarChart3, Boxes, Calculator, CheckCheck, ClipboardCheck, Factory, FileCheck2, Landmark, ShieldCheck, Wrench, X, FileText, FileUp, LayoutDashboard,
  Package, Percent, Receipt, ScrollText, Truck, UserCog, Users, CalendarDays, Route, type LucideIcon,
} from "lucide-react";
import logoUrl from "../assets/qualinutri-logo.png";
import { useAuth } from "../app/AuthProvider";
import { DEMO_HIDDEN_TABS } from "../demo/config";
import type { UserProfile } from "../types/auth";

export type TabId = "nutrition" | "finance" | "fiscal" | "credit" | "fleet" | "production" | "approvals" | "yard" | "dashboard" | "calculator" | "discounts" | "terms" | "prices" | "freight" | "policy" | "customers" | "quotes" | "reports" | "updates" | "visits" | "loads" | "checklist" | "users";

export type NavItem = { id: TabId; label: string; hint: string; icon: LucideIcon };
export type NavGroup = { label: string | null; items: NavItem[] };

export const navGroups: NavGroup[] = [
  { label: null, items: [{ id: "dashboard", label: "Início", hint: "Indicadores do dia e atalhos", icon: LayoutDashboard }] },
  {
    label: "Comercial",
    items: [
      { id: "calculator", label: "Calculadora", hint: "Monte pedidos com o preço da política", icon: Calculator },
      { id: "quotes", label: "Orçamentos", hint: "Acompanhe, aprove e gere o PDF", icon: FileText },
      { id: "customers", label: "Clientes", hint: "Cadastro, propriedades e histórico", icon: Users },
      { id: "credit", label: "Crédito e cliente 360°", hint: "Score automático, histórico e documentos", icon: ShieldCheck },
      { id: "visits", label: "Visitas", hint: "Agenda dos vendedores", icon: CalendarDays },
      { id: "reports", label: "Relatórios", hint: "Vendas e visitação por período", icon: BarChart3 },
    ],
  },
  {
    label: "Operação",
    items: [
      { id: "loads", label: "Logística", hint: "Cargas, romaneios e visualização 3D", icon: Truck },
      { id: "yard", label: "Pátio de carga 3D", hint: "Simule a montagem no caminhão", icon: Boxes },
      { id: "fleet", label: "Frota", hint: "Consertos, aprovação e frete × custo", icon: Wrench },
      { id: "nutrition", label: "Nutrição e formulação", hint: "Alimentos, dietas, menor custo e misturadores", icon: Factory },
      { id: "production", label: "Produção e estoque", hint: "Ordens, insumos e fórmulas", icon: Factory },
      { id: "checklist", label: "Checklist – Controles – Análises", hint: "Qualidade, manutenção e conformidade", icon: ClipboardCheck },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { id: "finance", label: "Financeiro", hint: "Bancos, antecipação e conciliação", icon: Landmark },
      { id: "fiscal", label: "Fiscal · NF-e e MDF-e", hint: "Notas com checagem de inscrição estadual", icon: FileCheck2 },
    ],
  },
  {
    label: "Tabelas",
    items: [
      { id: "prices", label: "Produtos", hint: "Tabela de preços por prazo", icon: Package },
      { id: "discounts", label: "Descontos", hint: "Linhas de desconto vigentes", icon: Percent },
      { id: "terms", label: "Condições", hint: "Prazos e formas de pagamento", icon: Receipt },
      { id: "freight", label: "Frete", hint: "Tabelas Juara, Regional e chapa", icon: Route },
      { id: "policy", label: "Política comercial", hint: "Regras comerciais vigentes", icon: ScrollText },
      { id: "updates", label: "Atualizações", hint: "Importe a tabela em PDF", icon: FileUp },
    ],
  },
  {
    label: "Gestão",
    items: [
      { id: "approvals", label: "Aprovações e chat", hint: "Cadastro, desconto, crédito e consertos", icon: CheckCheck },
      { id: "users", label: "Usuários", hint: "Acessos e perfis", icon: UserCog },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

export const tabLabels = Object.fromEntries(navItems.map((item) => [item.id, item.label])) as Record<TabId, string>;
export const tabIcons = Object.fromEntries(navItems.map((item) => [item.id, item.icon])) as Record<TabId, LucideIcon>;
export const tabGroups = Object.fromEntries(navGroups.flatMap((group) => group.items.map((item) => [item.id, group.label]))) as Record<TabId, string | null>;

/** Páginas fora do menu para todos os perfis. O código continua no projeto. */
const hiddenTabs: ReadonlySet<string> = DEMO_HIDDEN_TABS;

/**
 * Páginas em teste: só os logins listados veem. Para liberar a todos os
 * perfis permitidos abaixo, basta tirar a página daqui.
 */
const previewTabs: Partial<Record<TabId, readonly string[]>> = {};

type Viewer = Pick<UserProfile, "role" | "login"> | null | undefined;

export function canAccessTab(tab: TabId, viewer: Viewer) {
  const role = viewer?.role;
  if (hiddenTabs.has(tab)) return false;
  const previewLogins = previewTabs[tab];
  if (previewLogins && !previewLogins.includes(viewer?.login ?? "")) return false;
  if (tab === "users" || tab === "updates" || tab === "finance" || tab === "fiscal") return role === "administrador";
  if (tab === "credit" || tab === "approvals") return role === "administrador" || role === "comercial";
  if (tab === "customers" || tab === "quotes" || tab === "reports" || tab === "visits" || tab === "loads" || tab === "yard") return role === "administrador" || role === "comercial";
  return true;
}

export function useVisibleGroups() {
  const { profile } = useAuth();
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessTab(item.id, profile)) }))
    .filter((group) => group.items.length > 0);
}

type AppSidebarProps = {
  activeTab: TabId;
  open: boolean;
  badges?: Partial<Record<TabId, number>>;
  onChange: (tab: TabId) => void;
  onClose: () => void;
};

/** Menu completo em folha de vidro: no celular e tablet, aberto pelo botão da barra. */
export function AppSidebar({ activeTab, open, badges = {}, onChange, onClose }: AppSidebarProps) {
  const groups = useVisibleGroups();
  return (
    <>
      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Menu">
        <div className="sidebar-brand">
          <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
          <span className="sidebar-product">Gestão Integrada</span>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Fechar menu"><X size={20} aria-hidden="true" /></button>
        </div>
        <nav aria-label="Áreas do sistema">
          {groups.map((group) => (
            <div className="nav-group" key={group.label ?? "inicio"}>
              {group.label && <p className="nav-group-label">{group.label}</p>}
              <ul className="nav-list">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const badge = badges[item.id];
                  return (
                    <li key={item.id}>
                      <button type="button" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>
                        <Icon className="nav-icon" size={18} strokeWidth={2} aria-hidden="true" />
                        <span className="nav-label">{item.label}</span>
                        {badge ? <span className="nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="sidebar-backdrop" aria-hidden="true" onClick={onClose} />}
    </>
  );
}
