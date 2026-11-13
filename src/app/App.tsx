import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { QuoteEditingContext, type QuoteEditingContextValue } from "./QuoteEditingContext";
import { useAuth } from "./AuthProvider";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { CommercialPolicyPage } from "../features/commercial-policy/CommercialPolicyPage";
import { DiscountsPage } from "../features/discounts/DiscountsPage";
import { FreightPage } from "../features/freight/FreightPage";
import { ProductsPage } from "../features/pricing/ProductsPage";
import { AppHeader, PageHeading } from "../layouts/AppHeader";
import { AppSidebar, canAccessTab, tabGroups, tabLabels, type TabId } from "../layouts/AppSidebar";
import { MobileNav } from "../layouts/MobileNav";
import { PageKpis } from "../components/demo/PageKpis";
import { QuoteRowOpener } from "../components/demo/QuoteRowOpener";
import { RowClickToEdit } from "../components/demo/RowClickToEdit";
import { LoadsRowOpener } from "../components/demo/LoadViewer3D";
import { QuoteSavedViewer } from "../components/demo/QuoteSavedViewer";
import { CommandPalette } from "../components/demo/CommandPalette";
import { AlertsPanel } from "../components/demo/AlertsPanel";
import { demoAlerts } from "../demo/kpis/alerts";
import { useDemoTables } from "../demo/app/useDemoTables";
import { today as demoToday } from "../demo/store/ids";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ChecklistPage } from "../features/checklist/ChecklistPage";
import { YardPage } from "../features/yard/YardPage";
import { FinancePage } from "../features/erp/FinancePage";
import { FiscalPage } from "../features/erp/FiscalPage";
import { CreditPage } from "../features/erp/CreditPage";
import { FleetPage } from "../features/erp/FleetPage";
import { ProductionPage } from "../features/erp/ProductionPage";
import { ApprovalsPage } from "../features/erp/ApprovalsPage";
import { NavigationContext } from "./NavigationContext";
import { useDemoBadges } from "../demo/app/useDemoBadges";
import { PaymentTermsPage } from "../pages/PaymentTermsPage";
import { ProfilesPage } from "../features/auth/ProfilesPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { QuotesPage } from "../features/quotes/QuotesPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { UpdatesPage } from "../features/updates/UpdatesPage";
import { VisitsPage } from "../features/visits/VisitsPage";
import { LoadsPage } from "../features/loads/LoadsPage";

import { NutritionPage } from "../features/nutrition/NutritionPage";
import { ChatPage } from "../features/chat/ChatPage";
import { ReportsCenter } from "../features/reports-center/ReportsCenter";
import { ChatLauncher } from "../components/demo/ChatLauncher";

const tabContent: Record<TabId, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  checklist: ChecklistPage,
  yard: YardPage,
  finance: FinancePage,
  fiscal: FiscalPage,
  credit: CreditPage,
  fleet: FleetPage,
  production: ProductionPage,
  nutrition: NutritionPage,
  chat: ChatPage,
  analytics: ReportsCenter,
  approvals: ApprovalsPage,
  calculator: CalculatorPage,
  discounts: DiscountsPage,
  terms: PaymentTermsPage,
  prices: ProductsPage,
  freight: FreightPage,
  policy: CommercialPolicyPage,
  customers: CustomersPage,
  quotes: QuotesPage,
  reports: ReportsPage,
  updates: UpdatesPage,
  visits: VisitsPage,
  loads: LoadsPage,
  users: ProfilesPage,
};

const BACK_TABS = new Set<TabId>(["calculator", "chat", "credit"]);

export function App() {
  const { profile } = useAuth();
  // A tela atual sobrevive à troca de perfil (o app recomeça, mas volta para a mesma tela se o perfil puder vê-la).
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = sessionStorage.getItem("qualinutri-demo:tab");
      return saved && saved in tabLabels ? saved as TabId : "dashboard";
    } catch { return "dashboard"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("qualinutri-demo:tab", activeTab); } catch { /* sem armazenamento */ }
  }, [activeTab]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Tela de onde se veio ao abrir a Calculadora (ex.: editar um orçamento), para o botão "Voltar".
  const [trail, setTrail] = useState<TabId[]>([]);
  const backTo = trail.at(-1) ?? null;
  const activeRef = useRef<TabId>("dashboard");
  activeRef.current = activeTab;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("qualinutri-demo:sidebar") === "collapsed"; } catch { return false; }
  });
  const badges = useDemoBadges();
  // Ao rolar a página, a barra vira a pílula flutuante só com o logo.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 140);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const demoTables = useDemoTables();
  const alerts = useMemo(() => demoAlerts(demoTables, demoToday()), [demoTables]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [pendingCustomer, setPendingCustomer] = useState<QuoteEditingContextValue["pendingCustomer"]>(null);
  const ActivePage = tabContent[activeTab];

  useEffect(() => {
    if (!canAccessTab(activeTab, profile)) setActiveTab("dashboard");
  }, [activeTab, profile]);

  /** Fecha o menu e devolve o foco ao botão que o abriu. */
  const returnFocusToToggle = useRef(false);
  function closeMenu() {
    returnFocusToToggle.current = true;
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) {
      // Só depois de fechar: enquanto aberto, o botão está na parte inerte da tela.
      if (returnFocusToToggle.current) document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
      returnFocusToToggle.current = false;
      return;
    }
    // Leva o foco para o item da página atual; o resto da tela fica inerte enquanto o menu está aberto.
    document.querySelector<HTMLButtonElement>("#app-sidebar nav [aria-current='page'], #app-sidebar nav button")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    // Se a tela crescer até o menu fixo aparecer, o menu móvel não pode ficar "aberto" travando a página.
    const wide = window.matchMedia("(min-width: 961px)");
    const closeOnWide = () => { if (wide.matches) setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    wide.addEventListener("change", closeOnWide);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      wide.removeEventListener("change", closeOnWide);
    };
  }, [menuOpen]);

  // Ao trocar de página, o foco vai para o conteúdo (leitores de tela anunciam a nova página).
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    document.querySelector<HTMLElement>("main.page")?.focus({ preventScroll: true });
  }, [activeTab]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      try { localStorage.setItem("qualinutri-demo:sidebar", current ? "expanded" : "collapsed"); } catch { /* sem armazenamento */ }
      return !current;
    });
  }

  function changeTab(tab: TabId, goingBack = false) {
    const from = activeRef.current;
    // Telas abertas "a partir de outra" (editar orçamento, ampliar conversa, abrir cliente 360°) ganham o
    // botão Voltar; cada Voltar desfaz um passo (Logística → Conversas → Cliente 360° → Conversas → Logística).
    setTrail((current) => goingBack ? current.slice(0, -1) : BACK_TABS.has(tab) && from !== tab ? [...current, from] : []);
    setActiveTab(tab);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const quoteEditing = useMemo<QuoteEditingContextValue>(() => ({
    pendingQuoteId,
    openQuoteForEditing: (quoteId) => {
      setPendingQuoteId(quoteId);
      changeTab("calculator");
    },
    clearPendingQuote: () => setPendingQuoteId(null),
    pendingCustomer,
    openCalculatorForCustomer: (customer) => {
      setPendingCustomer(customer);
      changeTab("calculator");
    },
    clearPendingCustomer: () => setPendingCustomer(null),
  }), [pendingQuoteId, pendingCustomer]);

  return (
    <NavigationContext.Provider value={changeTab}>
    <QuoteEditingContext.Provider value={quoteEditing}>
    <div className={`app-layout${collapsed ? " is-collapsed" : ""}`}>
      <div className="app-backdrop" aria-hidden="true"><span /><span /><span /></div>
      <AppSidebar activeTab={activeTab} open={menuOpen} badges={badges} onChange={changeTab} onClose={closeMenu} />
      <div className="app-main" inert={menuOpen || undefined}>
        <AppHeader activeTab={activeTab} menuOpen={menuOpen} collapsed={collapsed || scrolled} onExpand={() => { if (collapsed) toggleCollapsed(); if (scrolled) window.scrollTo({ top: 0, behavior: "smooth" }); }} badges={badges} onNavigate={changeTab} onToggleMenu={() => setMenuOpen((open) => !open)} onToggleCollapsed={toggleCollapsed} alertCount={alerts.length} onOpenSearch={() => setSearchOpen(true)} onOpenAlerts={() => setAlertsOpen(true)} />
        <main id={`panel-${activeTab}`} className={`page page-${activeTab}`} tabIndex={-1}>
          <PageHeading key={`h-${activeTab}-${backTo ?? ""}`} title={activeTab === "calculator" && backTo === "quotes" ? "Orçamento" : tabLabels[activeTab]} group={tabGroups[activeTab]} />
          {activeTab !== "dashboard" && <PageKpis key={`k-${activeTab}`} tab={activeTab} />}
          {BACK_TABS.has(activeTab) && backTo && (
            <button type="button" className="back-chip glass-dark" onClick={() => changeTab(backTo, true)}>
              <ArrowLeft size={16} aria-hidden="true" /> Voltar para {tabLabels[backTo]}
            </button>
          )}
          {activeTab !== "calculator" && <div className="page-enter" key={activeTab}><ActivePage /></div>}
          <RowClickToEdit />
          {activeTab === "quotes" && <QuoteRowOpener />}
          {activeTab === "loads" && <LoadsRowOpener />}
          <QuoteSavedViewer active={activeTab === "calculator"} />
          {/* A Calculadora fica montada (só escondida) para o pedido em montagem não se perder ao trocar de página. */}
          <div hidden={activeTab !== "calculator"} className={activeTab === "calculator" ? "page-enter" : undefined}>
            <CalculatorPage />
          </div>
        </main>
        <MobileNav activeTab={activeTab} onChange={changeTab} onOpenMenu={() => setMenuOpen(true)} />
        {activeTab !== "chat" && <ChatLauncher />}
        {searchOpen && <CommandPalette onNavigate={changeTab} onClose={() => setSearchOpen(false)} />}
        {alertsOpen && <AlertsPanel alerts={alerts} onNavigate={changeTab} onClose={() => setAlertsOpen(false)} />}
      </div>
    </div>
    </QuoteEditingContext.Provider>
    </NavigationContext.Provider>
  );
}
