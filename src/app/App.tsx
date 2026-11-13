import { useEffect, useMemo, useRef, useState } from "react";
import { QuoteEditingContext, type QuoteEditingContextValue } from "./QuoteEditingContext";
import { useAuth } from "./AuthProvider";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { CommercialPolicyPage } from "../features/commercial-policy/CommercialPolicyPage";
import { DiscountsPage } from "../features/discounts/DiscountsPage";
import { FreightPage } from "../features/freight/FreightPage";
import { ProductsPage } from "../features/pricing/ProductsPage";
import { AppHeader } from "../layouts/AppHeader";
import { AppSidebar, canAccessTab, tabLabels, type TabId } from "../layouts/AppSidebar";
import { PaymentTermsPage } from "../pages/PaymentTermsPage";
import { ProfilesPage } from "../features/auth/ProfilesPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { QuotesPage } from "../features/quotes/QuotesPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { UpdatesPage } from "../features/updates/UpdatesPage";
import { VisitsPage } from "../features/visits/VisitsPage";
import { LoadsPage } from "../features/loads/LoadsPage";

const tabContent: Record<TabId, () => React.JSX.Element> = {
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

export function App() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("calculator");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [pendingCustomer, setPendingCustomer] = useState<QuoteEditingContextValue["pendingCustomer"]>(null);
  const ActivePage = tabContent[activeTab];

  useEffect(() => {
    if (!canAccessTab(activeTab, profile)) setActiveTab("calculator");
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

  function changeTab(tab: TabId) {
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
    <QuoteEditingContext.Provider value={quoteEditing}>
    <div className="app-layout">
      <AppSidebar activeTab={activeTab} open={menuOpen} onChange={changeTab} onClose={closeMenu} />
      <div className="app-main" inert={menuOpen || undefined}>
        <AppHeader title={tabLabels[activeTab]} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
        <main id={`panel-${activeTab}`} className={`page page-${activeTab}`} tabIndex={-1}>
          {activeTab !== "calculator" && <ActivePage />}
          {/* A Calculadora fica montada (só escondida) para o pedido em montagem não se perder ao trocar de página. */}
          <div hidden={activeTab !== "calculator"}>
            <CalculatorPage />
          </div>
        </main>
      </div>
    </div>
    </QuoteEditingContext.Provider>
  );
}
