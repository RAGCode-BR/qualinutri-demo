# Etapa 1 — Base simulada, moldura nova e painel inicial — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao rodar `npm run dev`, a demo abre num sistema com cara nova: menu agrupado com ícones, cabeçalho novo e painel inicial com KPIs clicáveis. Calculadora, Produtos, Descontos, Condições, Frete, Política, Clientes e Orçamentos funcionam com dados fictícios gravados no navegador.

**Architecture:** Um plugin do Vite redireciona `src/services/<x>.ts` e `src/app/AuthProvider.tsx` para "gêmeos" em `src/demo/`, que têm as mesmas exportações e gravam num banco local (`localStorage`) semeado por código determinístico. Telas (`src/features/**`) e domínio (`src/domain/**`) não mudam. KPIs são funções puras sobre o banco local.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 5, CSS puro (`src/styles/global.css`), `lucide-react` (nova dependência).

**Spec:** `docs/superpowers/specs/2026-11-13-demo-ampliada-design.md`

## Global Constraints

- Não alterar lógica em `src/domain/**` nem em `src/features/**` (nesta etapa, nenhuma edição nessas pastas).
- Mesmas entradas na Calculadora → mesmos resultados de hoje.
- Os testes existentes (`tests/**`) continuam passando sem alteração. `npm run check` passa, inclusive `scripts/check-public-bundle.mjs`.
- Dados todos fictícios. Nenhum nome do catálogo real ("Quali Engorda 160 RM", "Brasnorte até 35 km", "Regras comerciais das vendas diretas da fábrica Qualinutri").
- Textos da interface em português do Brasil.
- `localStorage`, ler e gravar sempre com `try/catch`. Se falhar, a demo roda só em memória.
- Seed determinístico (semente fixa) e com datas relativas a "hoje".
- Twins exportam **todos** os nomes de valor que o original exporta. O que ainda não é desta etapa lança `Error("Disponível na próxima etapa da demonstração.")`.
- Sem commits automáticos: commitar só quando o usuário pedir (o repo está em `main`, com mudanças não commitadas do usuário).

## Review Focus

1. **`localStorage` corrompido ou com versão antiga do seed:** a demo deve resemear sozinha, sem tela branca. Coberto pelo teste `store › resemeia quando a versão difere ou o JSON é inválido` (Tarefa 2).
2. **Totais do painel diferentes das listas:** o KPI "Vendas do mês" deve ser igual à soma de `grand_total` dos aprovados no mês mostrados na gaveta. Coberto por `kpis › gaveta e cartão usam a mesma seleção` (Tarefa 7).
3. **Editar preço em Produtos e voltar à Calculadora:** o preço novo deve aparecer. Coberto por `catalog twins › updateProduct reflete em loadCommercialData` (Tarefa 4).
4. **Orçamento salvo pela Calculadora aparece em Orçamentos e no painel na hora:** coberto por `quote twin › createQuote aparece em listQuotes e nos KPIs` (Tarefa 5).
5. **Tela de 390 px:** sem rolagem horizontal da página, menu inferior visível, gaveta de detalhe em tela cheia. Coberto pelo passeio Playwright (Tarefa 10).

---

## Estrutura de arquivos

```
vite.config.ts                         (modificar: plugin demoTwins)
vitest.config.ts                       (modificar: inclui tests/demo)
src/demo/
  twins/resolveTwin.ts                 regra pura de redirecionamento (testável)
  twins/vitePlugin.ts                  plugin Vite usando resolveTwin
  config.ts                            abas ocultas na demo, nome do produto
  store/db.ts                          banco local: tabelas, persistência, reset, latência
  store/ids.ts                         uuid determinístico + relógio "hoje"
  seed/random.ts                       PRNG com semente
  seed/catalog.ts                      catálogo fictício (~15 produtos, prazos, descontos, frete, política)
  seed/people.ts                       usuários e clientes fictícios
  seed/quotes.ts                       orçamentos gerados pelo domínio
  seed/index.ts                        buildSeed(today): DemoTables
  quotes/rows.ts                       snapshotToRows (QuoteSnapshot → linhas)
  services/commercialDataService.ts    gêmeo
  services/productService.ts           gêmeo
  services/discountService.ts          gêmeo
  services/freightService.ts           gêmeo
  services/policyService.ts            gêmeo
  services/customerService.ts          gêmeo
  services/quoteService.ts             gêmeo
  services/visitService.ts             gêmeo (só propriedades/visitas do cliente; resto lança)
  services/loadService.ts              gêmeo (só getQuoteShipping; resto lança)
  services/<demais>.ts                 gêmeos que só lançam (reportService, visitReportService, profileService, adminUserService, adminPasswordService, passwordService, catalogUpdateService)
  app/AuthProvider.tsx                 gêmeo: usuário demo logado + troca de perfil
  kpis/finance.ts                      parcelas a receber + contas a pagar
  kpis/dashboard.ts                    KPIs e seleções para a gaveta
src/layouts/AppSidebar.tsx             (modificar: grupos, ícones, recolher, usa demo/config)
src/layouts/AppHeader.tsx              (modificar: trilha, selo, menu do usuário)
src/layouts/MobileNav.tsx              (novo)
src/layouts/UserMenu.tsx               (novo)
src/features/dashboard/DashboardPage.tsx      (novo)
src/features/dashboard/KpiCard.tsx            (novo)
src/features/dashboard/DetailDrawer.tsx       (novo)
src/features/dashboard/Sparkline.tsx          (novo)
src/app/App.tsx                        (modificar: aba dashboard, padrão inicial)
src/app/AuthGate.tsx, CommercialDataProvider.tsx, lib/supabase.ts, components/DataSourceStatus.tsx  (reverter para f00c520)
src/styles/global.css                  (modificar: tokens e moldura; restyle das telas)
tests/demo/*.test.ts                   (novos)
```

---

### Tarefa 1: Plugin de gêmeos

**Files:** Create `src/demo/twins/resolveTwin.ts`, `src/demo/twins/vitePlugin.ts`, `tests/demo/resolve-twin.test.ts`. Modify `vite.config.ts`, `vitest.config.ts` (nada muda: `tests/**` já está incluído).

**Interfaces:**
- Produces: `resolveTwin(resolvedId: string, importer: string | undefined, root: string, exists: (p: string) => boolean): string | null`; `demoTwins(): Plugin`.

- [ ] **Step 1: Teste**

```ts
const root = "/p";
const has = (p: string) => p === "/p/src/demo/services/quoteService.ts" || p === "/p/src/demo/app/AuthProvider.tsx";
test("redireciona serviço com gêmeo", () => expect(resolveTwin("/p/src/services/quoteService.ts", "/p/src/features/quotes/QuotesPage.tsx", root, has)).toBe("/p/src/demo/services/quoteService.ts"));
test("redireciona AuthProvider", () => expect(resolveTwin("/p/src/app/AuthProvider.tsx", "/p/src/main.tsx", root, has)).toBe("/p/src/demo/app/AuthProvider.tsx"));
test("não redireciona import vindo de src/demo", () => expect(resolveTwin("/p/src/services/quoteService.ts", "/p/src/demo/services/quoteService.ts", root, has)).toBeNull());
test("sem gêmeo, mantém", () => expect(resolveTwin("/p/src/services/serviceError.ts", "/p/src/x.ts", root, has)).toBeNull());
```

- [ ] **Step 2:** `npx vitest run tests/demo/resolve-twin.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `resolveTwin` (normaliza `\\`→`/` e ignora `?query`) e `demoTwins()` com `enforce: "pre"` e `resolveId(source, importer)` → `this.resolve(source, importer, { skipSelf: true })` → `resolveTwin(...)`. Registrar em `vite.config.ts`: `plugins: [demoTwins(), react()]`. `serviceError.ts` **não** tem gêmeo.
- [ ] **Step 4:** Rodar o teste. Esperado: PASS.

---

### Tarefa 2: Banco local

**Files:** Create `src/demo/store/db.ts`, `src/demo/store/ids.ts`, `tests/demo/store.test.ts`.

**Interfaces:**
- Produces:
  - `type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]`
  - `type DemoTables = { catalog: DemoCatalog; profiles: UserProfile[]; customers: Row<"customers">[]; customer_properties: Row<"customer_properties">[]; quotes: Row<"quotes">[]; quote_items: Row<"quote_items">[]; visits: Row<"visits">[]; payables: Payable[]; seq: { quote: number } }`. `DemoCatalog = CommercialData & { anticipatedPercentage: number; changeLog: { at: string; what: string }[] }`. `Payable` vem da Tarefa 7, mas o tipo é declarado aqui: `{ id: string; supplier: string; category: "Matéria-prima" | "Manutenção da frota" | "Frete" | "Serviços"; description: string; dueDate: string; amount: number; paidAt: string | null }`.
  - `db.read(): DemoTables`, `db.write(mutator: (t: DemoTables) => void): void` (persiste e notifica), `db.subscribe(fn: () => void): () => void`, `db.reset(): void`
  - `simulateLatency<T>(value: T | (() => T)): Promise<T>` (120–300 ms; 0 quando `import.meta.env.MODE === "test"`)
  - `STORAGE_KEY = "qualinutri-demo:v1"`, `SEED_VERSION = 1`
  - `ids.ts`: `newId(): string` (`crypto.randomUUID`), `seededId(rng): string`, `today(): Date` (sobrescrevível em teste via `setToday`), `isoDate(d)`, `isoDateTime(d)`
  - `?reset=1` na URL chama `db.reset()` na primeira leitura e remove o parâmetro com `history.replaceState`.

- [ ] **Step 1: Testes** (`localStorage` simulado por um Map em `globalThis`)
  - `inicia com seed quando vazio`: `db.read().customers.length > 0`.
  - `persiste write`: depois de `write(t => t.seq.quote = 999)`, um novo módulo (`vi.resetModules`) lê `999`.
  - `resemeia quando a versão difere ou o JSON é inválido`: gravar `"{"` e depois `{"version":0}`; `read()` não lança e `customers.length > 0`.
  - `funciona sem localStorage`: `getItem` lança; `read()` e `write()` não lançam.
  - `reset volta ao seed`: apaga um cliente, `reset()`, a contagem volta.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Formato salvo: `{ version: SEED_VERSION, seededOn: "AAAA-MM-DD", tables }`. Se `seededOn` é de outro dia, **mantém** os dados (o usuário pode ter criado coisas); datas relativas só valem na criação do seed.
- [ ] **Step 4:** Rodar. Esperado: PASS.

---

### Tarefa 3: Seed comercial

**Files:** Create `src/demo/seed/{random,catalog,people,quotes,index}.ts`, `src/demo/quotes/rows.ts`, `tests/demo/seed.test.ts`. Substituir o conteúdo de `src/data/demoCommercialData.ts` por um re-export do catálogo de `seed/catalog.ts` (o arquivo é do usuário e não está commitado; mantê-lo exportando `demoCommercialData`).

**Interfaces:**
- Consumes: `calculateCurrentOrder` (`src/domain/order/calculateOrder.ts`), `createQuoteSnapshot` (`src/domain/quotes/createQuoteSnapshot.ts`), `mapQuoteSnapshotToPayload`.
- Produces: `buildSeed(today: Date): DemoTables`; `snapshotToRows(snapshot: QuoteSnapshot, meta: { id: string; quoteNumber: number; createdAt: string; createdBy: string }): { quote: Row<"quotes">; items: Row<"quote_items">[] }`; `mulberry32(seed: number): () => number`; `DEMO_USERS` (4 perfis; o admin tem `id = "demo-admin"`, `login = "demonstracao"`, `displayName = "Usuário Demonstração"`).

Valores fixados:
- Catálogo: prazos `["À vista", "30 dd", "30/60 ou 45 dd", "30/60/90 ou 60 dd"]` com ids; cerca de 15 produtos em 3 grupos ("Rações", "Minerais", "Núcleos"), com sacas de 25, 30 e 40 kg e preços crescentes por prazo; 5 linhas de desconto + "Outro / personalizado" (`percentage: null`); `anticipatedPercentage: 1.5`; 4 faixas Juara fictícias ("Até 30 km", "31 a 60 km"…) e 4 cidades regionais fictícias ("Vale Verde", "Serra Azul", "Rio Claro", "Boa Esperança"), uma delas com `fractionalPerTon: null`; chapa 40; política com 6 seções fictícias; `policyVersion: "2026.2 (demo)"`.
- 45 clientes (fazendas e revendas fictícias do norte de MT, CPF/CNPJ **válidos** gerados pelo PRNG, cidade em `address.city`), 0 a 2 propriedades cada.
- 140 orçamentos em 120 dias, distribuídos pelos 2 comerciais e pelo admin. Situação por idade: os mais antigos são em maioria aprovados ou cancelados, os recentes ficam em rascunho ou enviados. Pelo menos 2 aprovados **hoje** e 1 enviado hoje. De 1 a 4 itens, 20 a 400 sacas. Frete em cerca de 60%. `payment_mode` preenchido quando o prazo tem "ou".

- [ ] **Step 1: Testes**
  - `determinístico`: `buildSeed(d)` duas vezes → `JSON.stringify` igual.
  - `totais coerentes`: para todo orçamento, `grand_total` ≈ soma de `items.total` (±0,01) e cada item bate com `calculateCurrentOrder` para as mesmas entradas.
  - `datas relativas`: nenhum `created_at` posterior a `today`; existem aprovados com `approved_at` no dia de `today`.
  - `sem catálogo real`: `JSON.stringify(seed)` não contém nenhum dos 3 textos proibidos.
  - `documentos válidos`: `validateDocument(c.document).valid` para todos.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Cada orçamento passa por `calculateCurrentOrder` → `createQuoteSnapshot` → `snapshotToRows`. `snapshotToRows` usa `mapQuoteSnapshotToPayload` e completa as colunas de sistema (`id`, `quote_number`, `created_at`, `updated_at`, `created_by`, `issued_at`, `approved_at`, `cancelled_at`, `updated_by`, ids dos itens, `quote_id`).
- [ ] **Step 4:** Rodar. Esperado: PASS.

---

### Tarefa 4: Gêmeos do catálogo

**Files:** Create `src/demo/services/{commercialDataService,productService,discountService,freightService,policyService}.ts`, `tests/demo/catalog-twins.test.ts`.

**Interfaces:**
- Mesmas assinaturas dos originais (ver `src/services/*.ts`). Os `load*` que recebem `client` ignoram o parâmetro (`_client`) e leem `db.read().catalog`.
- `loadCommercialData()` monta `CommercialData` igual ao original: prepende "À vista antecipado" em `paymentTerms`. `invalidateCommercialData()` não faz nada.
- Edições (`updateProduct`, `deactivateProduct`, `saveDiscountRule`, `deactivateDiscountRule`, `saveFreightZone`, `deactivateFreightZone`, `saveHandlingRate`) gravam no catálogo, acrescentam um item em `changeLog` e mantêm `products = [...rationProducts, ...mineralProducts, …]` coerente. Nova linha de desconto entra antes de "Outro / personalizado".

- [ ] **Step 1: Testes:** `updateProduct reflete em loadCommercialData` (preço e peso); `deactivateProduct remove da lista`; `saveDiscountRule(null, …) insere antes do personalizado`; `saveFreightZone("regional", null, "Nova", {fractionalPerTon: null, closedPerTon: 150})` aparece em `regionalFreightRates`.
- [ ] **Step 2:** Rodar. Esperado: FAIL. **Step 3:** Implementar. **Step 4:** Rodar. Esperado: PASS.

---

### Tarefa 5: Gêmeos de clientes, orçamentos e apoio

**Files:** Create `src/demo/services/{customerService,quoteService,visitService,loadService,reportService,visitReportService,profileService,adminUserService,adminPasswordService,passwordService,catalogUpdateService}.ts`, `tests/demo/commercial-twins.test.ts`.

**Interfaces:**
- Consumes: `db`, `snapshotToRows`, `useDemoSession` / `getDemoViewer()` da Tarefa 6 (`getDemoViewer(): UserProfile`, função pura que lê o perfil atual de um módulo-singleton em `src/demo/app/session.ts`; criar esse arquivo aqui se a Tarefa 6 ainda não existir).
- **customerService:** mesmas validações do original (`validateDocument`, `validatePhone`, nome obrigatório, CPF/CNPJ duplicado entre ativos → `"Já existe um cliente ativo com este CPF/CNPJ."`). `listCustomers` devolve `CustomerSummary` com `city` de `address.city` e `document_raw` de `legacy_details.document_raw`, em ordem de `legal_name`.
- **quoteService:** `createQuote` grava com `quote_number = ++seq.quote` e devolve o mesmo formato do RPC (ler `Database["public"]["Functions"]["create_quote"]["Returns"][0]`). Status: `issued` só a partir de `draft`, `approved` só a partir de `issued`, `cancelled` a partir de `draft` ou `issued`, `issued_at`/`approved_at`/`cancelled_at` = agora. Editar só em `draft`/`issued`. Dono ou admin, com a mensagem `"Só quem criou o orçamento ou um administrador pode alterá-lo."`. `listQuotes` aplica os filtros e o `limit` e ordena por `created_at desc`. `getQuoteSellerName` devolve `displayName` do perfil. `duplicateQuote` é igual ao original (copiar a função; ela só usa `getQuote`/`createQuote`).
- **visitService:** implementar `listProperties`, `saveProperty`, `deactivateProperty`, `listCustomerVisits` (lê `visits`, vazio nesta etapa). Os demais lançam o erro de "próxima etapa".
- **loadService:** `getQuoteShipping` devolve `[]`/vazio no formato do tipo `QuoteShipping`. Os demais lançam.
- Os outros gêmeos só lançam.

- [ ] **Step 1: Testes:** `createQuote aparece em listQuotes e nos KPIs` (usa `salesKpis` da Tarefa 7 quando ela existir; até lá, só `listQuotes`); `fluxo de situação` (draft→approved direto lança; draft→issued→approved ok e preenche datas); `comercial não altera orçamento de outro`; `cliente duplicado lança mensagem`; `listCustomers ordenado e com city`.
- [ ] **Step 2:** Rodar. Esperado: FAIL. **Step 3:** Implementar. **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** `npx tsc -b`. Esperado: sem erros (os gêmeos compilam sozinhos com `strict`, `noUnusedParameters`; prefixar com `_` os parâmetros ignorados).

---

### Tarefa 6: Sessão demo, reversões e visibilidade das abas

**Files:** Create `src/demo/app/AuthProvider.tsx`, `src/demo/app/session.ts`, `src/demo/config.ts`. Reverter para `f00c520`: `src/app/AuthGate.tsx`, `src/app/CommercialDataProvider.tsx`, `src/lib/supabase.ts`, `src/components/DataSourceStatus.tsx`. Modify `src/layouts/AppSidebar.tsx` (só a lista de ocultas, nesta tarefa).

**Interfaces:**
- `AuthProvider` gêmeo exporta `AuthProvider` e `useAuth` com o **mesmo** `AuthContextValue`: `session` e `user` são objetos mínimos não nulos (`{ user: { id: profile.id } }` com cast); `profile` vem de `session.ts`; `loading: false`; `signIn` ok; `signOut` volta ao perfil admin; `refreshProfile` não faz nada. Exporta também `useDemoSession(): { profile: UserProfile; switchRole(role: ProfileRole): void; resetData(): void }`.
- `session.ts`: `getDemoViewer()`, `setDemoRole(role)`. O perfil escolhido fica em `localStorage` `qualinutri-demo:role`. Cada papel usa um dos usuários de `DEMO_USERS`.
- `config.ts`: `PRODUCT_NAME = "Qualinutri · Gestão Integrada"`; `DEMO_HIDDEN_TABS: ReadonlySet<TabId> = new Set(["visits", "loads", "reports", "updates", "users"])` (a etapa 2 esvazia o conjunto).
- `AppSidebar`: `hiddenTabs` passa a ser `DEMO_HIDDEN_TABS`; `previewTabs` fica `{}`. `canAccessTab` não muda.
- Depois de reverter `CommercialDataProvider`, o `source` vira `"supabase"` (porque o gêmeo carrega com sucesso) e o aviso "Dados de demonstração" some. O selo "Demonstração" vem do cabeçalho (Tarefa 8). `isSupabaseConfigured` é falso sem `.env`. Por isso o gêmeo de `commercialDataService` precisa ser carregado **mesmo** com `isSupabaseConfigured === false`: verificar no `CommercialDataProvider` original. Se ele não chamar `loadCommercialData` quando não configurado, o gêmeo de `lib/supabase.ts` (`src/demo/lib/supabase.ts`, com `isSupabaseConfigured = true` e `supabase = null`) entra no `resolveTwin`. Nesse caso, estender `resolveTwin` para `src/lib/supabase.ts` e adicionar o caso ao teste da Tarefa 1.

- [ ] **Step 1:** Teste `tests/demo/session.test.ts`: `setDemoRole("consulta")` → `getDemoViewer().role === "consulta"` e `canAccessTab("quotes", viewer) === false`.
- [ ] **Step 2–4:** Falha, implementa, passa.
- [ ] **Step 5:** `npm run dev` + abrir `http://localhost:5173`: menu mostra Calculadora, Orçamentos, Produtos, Clientes, Descontos, Condições, Frete e Política. Orçamentos lista cerca de 140 itens. Salvar um orçamento na Calculadora faz ele aparecer em Orçamentos.

---

### Tarefa 7: KPIs (funções puras)

**Files:** Create `src/demo/kpis/finance.ts`, `src/demo/kpis/dashboard.ts`, `tests/demo/kpis.test.ts`. Estender `seed/index.ts` para gerar `payables` (cerca de 40, nos últimos 60 e próximos 30 dias, cerca de 10% vencidos e não pagos).

**Interfaces:**
- `type Period = { from: string; to: string }` (AAAA-MM-DD inclusivo); `periodFor(key: "today" | "7d" | "month", today: Date): Period`; `previousPeriod(p: Period): Period`.
- `receivables(tables: DemoTables, today: Date): Installment[]`, com `Installment = { quoteId: string; quoteNumber: number; customer: string; number: number; of: number; dueDate: string; amount: number; paidAt: string | null }`. Usa os orçamentos aprovados, com o prazo de `quote_items[0].payment_term_snapshot` + `quotes.payment_mode`: "À vista" → 1 parcela no `approved_at`; com `installments` ou sem "ou" → os dias do texto (`/\d+/g` antes de "ou"); com `single` → o número depois de "ou". O valor é dividido igualmente, e a última parcela absorve o arredondamento. `paidAt`: parcela vencida é paga no vencimento, salvo quando `hash(quoteId + n) % 100 < 8` (fica em atraso).
- `type Kpi = { id: KpiId; label: string; value: number; format: "currency" | "number" | "percent" | "tons"; previous: number | null; trend: number[]; simulated?: boolean; target?: TabId; selection: DrawerSelection }`, com `KpiId = "sales" | "openQuotes" | "conversion" | "topProduct" | "ticket" | "receivable" | "payable" | "overdue" | "newCustomers"`.
- `type DrawerSelection = { title: string; columns: { key: string; label: string; format?: Kpi["format"] | "date" }[]; rows: Record<string, string | number | null>[] }`.
- `dashboardKpis(tables: DemoTables, period: Period, today: Date): Kpi[]`.
  - `sales`: soma de `grand_total` dos aprovados com `approved_at` no período. `trend`: 14 pontos diários.
  - `openQuotes`: valor de `draft` + `issued` (ignora o período).
  - `conversion`: aprovados ÷ (emitidos no período), em %.
  - `topProduct`: valor = sacas do produto líder no período. `label` inclui o nome. A seleção mostra o ranking dos 5 primeiros.
  - `ticket`: `sales` ÷ número de aprovados.
  - `receivable`: soma das parcelas não pagas com vencimento ≥ hoje (`simulated: true`).
  - `payable`: idem para `payables` (`simulated: true`).
  - `overdue`: parcelas não pagas vencidas + contas a pagar vencidas. A seleção junta as duas, com coluna "Tipo".
  - `newCustomers`: clientes com `created_at` no período.
- **Mesma fonte:** `value` de cada KPI é calculado a partir de `selection.rows`, nunca por um caminho separado.

- [ ] **Step 1: Testes:** `gaveta e cartão usam a mesma seleção` (para `sales`: soma da coluna `total` das linhas = `value`); `parcelamento 30/60/90 em 3 parcelas somando o total`; `single "30/60/90 ou 60 dd" → 1 parcela em +60`; `à vista → 1 parcela`; `createQuote + advance até approved hoje aumenta sales de "today"`; `periodFor("month")` começa no dia 1.
- [ ] **Step 2–4:** Falha, implementa, passa.

---

### Tarefa 8: Moldura nova (tokens, menu, cabeçalho, celular)

**Files:** `npm i lucide-react`. Modify `src/styles/global.css` (seção de tokens `:root` e moldura: `.app-layout`, `.app-sidebar`, `.nav-list`, `.app-topbar`), `src/layouts/AppSidebar.tsx`, `src/layouts/AppHeader.tsx`, `src/app/App.tsx`. Create `src/layouts/MobileNav.tsx`, `src/layouts/UserMenu.tsx`.

**Interfaces:**
- `TabId` ganha `"dashboard"` (só acréscimo). `tabLabels.dashboard = "Início"`. `canAccessTab("dashboard")` é `true`.
- `navGroups: { label: string; items: { id: TabId; label: string; icon: LucideIcon }[] }[]` na ordem da spec 6.2: Início | Comercial (Calculadora, Orçamentos, Clientes, Visitas, Relatórios) | Operação (Cargas) | Tabelas (Produtos, Descontos, Condições, Frete, Política comercial, Atualizações) | Administração (Usuários). Grupo sem item visível não aparece.
- Recolher no desktop: botão no rodapé da barra. O estado fica em `localStorage` `qualinutri-demo:sidebar` e aplica a classe `.app-layout.is-collapsed` (só ícones, com o rótulo em `title` e `aria-label`).
- `AppHeader` props: `{ title: string; group: string | null; menuOpen: boolean; onToggleMenu(): void; onNavigate(tab: TabId): void }`. Mostra a trilha `grupo › título`, o selo "Demonstração" e o `UserMenu` (nome, perfil, "Ver como: Administrador/Comercial/Consulta", "Restaurar dados de exemplo" com confirmação via `ConfirmDialog`).
- `MobileNav` (≤ 960 px): Início, Calculadora, Orçamentos, Menu (abre a barra lateral). Fica fixo embaixo, com `padding-bottom: env(safe-area-inset-bottom)`.
- `App.tsx`: estado inicial `"dashboard"`, `tabContent.dashboard = DashboardPage` (tarefa 9; até lá, um placeholder). O fallback de `canAccessTab` volta para `"dashboard"`. A Calculadora continua sempre montada.
- Tokens (valores): `--brand-900 #0c3318`, `--brand-700 #146a2e`, `--brand-500 #2f9a4a`, `--brand-100 #e3f1e5`, `--accent #9cc823`, `--ink #14201a`, `--ink-2 #4a5850`, `--ink-3 #6b776f`, `--line #e2e8e3`, `--surface #ffffff`, `--surface-2 #f6f8f6`, `--background #eef2ef`, `--radius 14px`, `--radius-sm 9px`, `--shadow-1 0 1px 2px rgb(16 40 24 / .06), 0 1px 3px rgb(16 40 24 / .08)`, `--shadow-2 0 8px 24px rgb(16 40 24 / .10)`. Manter os nomes antigos (`--green-*`, `--lime` etc.) como aliases dos novos, para não quebrar regras existentes.
- Barra lateral escura (`--brand-900`), com item ativo em pílula clara e ícone com `--accent`. Cabeçalho branco fixo com borda inferior. Fonte de título `--font-display` 600.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run typecheck`. Esperado: sem erros.
- [ ] **Step 3:** `npm test`. Esperado: tudo verde (testes antigos intactos).
- [ ] **Step 4:** Abrir no navegador em 1440 px e 390 px: grupos e ícones aparecem, recolher funciona, menu inferior no celular, trocar o perfil para "Consulta" esconde Orçamentos e Clientes, "Restaurar dados" volta ao seed.

---

### Tarefa 9: Painel inicial

**Files:** Create `src/features/dashboard/{DashboardPage,KpiCard,DetailDrawer,Sparkline}.tsx`. Modify `src/styles/global.css` (seção `/* Painel */`), `src/app/App.tsx` (passar `onNavigate` via contexto, ou prop do `DashboardPage` com `changeTab`).

**Interfaces:**
- Consumes: `dashboardKpis`, `periodFor`, `db.read`, `db.subscribe` (recalcular quando o banco muda).
- `DashboardPage({ onNavigate }: { onNavigate(tab: TabId): void })`.
- `KpiCard({ kpi, onOpen, dragHandleProps })`: valor formatado (`utils/formatters.ts`), variação % contra `previous` (verde/vermelho; em `overdue` e `payable`, subir é ruim), `Sparkline` de `trend`, selo "simulado" quando `simulated`. O cartão inteiro é um botão que chama `onOpen`.
- **Arrastar para reordenar:** HTML5 drag-and-drop nos cartões, mais teclado (alça com setas ←/→). A ordem fica em `localStorage` `qualinutri-demo:dashboard-order`.
- `DetailDrawer({ selection, target, onClose, onNavigate })`: painel lateral (`<dialog>` modal; tela cheia ≤ 640 px), busca, ordenação por coluna, "Exportar CSV" (separador `;`, BOM UTF-8), "Abrir em <tabLabels[target]>". Esc fecha e o foco volta ao cartão.
- Layout: cabeçalho "Bom dia/Boa tarde/Boa noite, <nome>" + data por extenso + seletor de período (Hoje / 7 dias / Mês). Grade de cartões `repeat(auto-fill, minmax(240px, 1fr))`. Abaixo, duas colunas: "Últimos orçamentos" (8 itens, clicável → Orçamentos) e "Ranking de produtos no período" (barras horizontais SVG).
- `Sparkline({ values, tone })`: SVG 96×28, linha + área com opacidade 0,12, sem eixos.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run typecheck && npm test`. Esperado: verde.
- [ ] **Step 3:** No navegador: clicar em "Vendas" abre a gaveta com as linhas cuja soma bate com o cartão. "Abrir em Orçamentos" navega. Arrastar um cartão muda a ordem, que persiste após recarregar. Salvar um orçamento novo e aprová-lo em Orçamentos faz "Vendas — Hoje" aumentar ao voltar ao Início.

---

### Tarefa 10: Restyle das telas existentes e verificação

**Files:** Modify `src/styles/global.css` (apenas CSS; nenhuma edição em `src/features/**` nesta etapa).

- [ ] **Step 1:** Restyle via CSS dos componentes compartilhados e das telas: `.panel`, botões (primário, secundário, perigo, ghost; `:hover`, `:focus-visible` com anel `--accent`, `:disabled`), campos e `Select`, `DateInput`, tabelas (cabeçalho fixo, zebra, `font-variant-numeric: tabular-nums`, números à direita), `Notice`, `EmptyState`, `Dialog`. Na Calculadora, aplicar a mesma superfície em cartões. **Não** mudar as regras `@media print` nem as classes de `QuotePrint`/`LoadPrint`.
- [ ] **Step 2:** `npm run check`. Esperado: testes, typecheck, build e "Bundle público sem o catálogo comercial de referência." OK.
- [ ] **Step 3:** Caracterização manual: na Calculadora, montar o mesmo pedido em `git stash` (antes) e depois (2 produtos, desconto de linha, antecipado, frete Juara fracionado, chapa ligada). Os totais devem ser iguais. Registrar os números no relatório da tarefa.
- [ ] **Step 4:** Passeio Playwright em 390, 820 e 1440 px por Início, Calculadora, Orçamentos, Clientes, Produtos, Descontos, Condições, Frete e Política: sem rolagem horizontal da página (`document.documentElement.scrollWidth <= innerWidth`), sem erro no console. Salvar os screenshots no scratchpad.
- [ ] **Step 5:** `git diff --stat src/domain src/features` vazio.

---

## Próximos planos (fora desta etapa)

- **Etapa 2:** gêmeos completos de visitas, cargas, relatórios, atualizações e usuários; `DEMO_HIDDEN_TABS` vazio; `PageKpis` por tela (spec 7.2); busca global Ctrl+K e sino de alertas; seed de visitas, veículos e cargas.
- **Etapa 3:** módulo Checklist – Controles – Análises (spec 8) e `docs/DEMO-MUDANCAS.md`.
