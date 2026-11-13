# Demo ampliada Qualinutri — redesign, KPIs e módulo Checklist – Controles – Análises

Data: 2026-11-13 · Repositório: `qualinutri-demo`

## 1. Intenção

Esta é uma **demonstração comercial** para a Qualinutri. Hoje a demo é "a calculadora": cinco telas, sem login e sem banco. O objetivo é que ela pareça **um sistema novo e muito maior**, uma plataforma de gestão com painel, indicadores, área comercial completa e um módulo de qualidade e operação, e não a mesma calculadora com outra cor.

Tudo é **simulado no navegador**: nenhum banco, nenhuma conta externa, nenhum login. A demo precisa abrir pelo link e funcionar sempre, inclusive no celular, durante a apresentação.

## 2. Metas, não metas e anti-metas

**Metas**
1. Novo visual em todas as telas existentes, responsivo (celular, tablet, computador).
2. Religar **todas** as telas escondidas (Clientes, Orçamentos, Visitas, Relatórios, Cargas, Atualizações, Usuários, Política comercial) com dados fictícios. Toda ação simulada funciona: criar, editar, mudar situação, cancelar, duplicar, montar carga, registrar visita etc.
3. **Painel inicial** com KPIs. Clicar num KPI abre a lista detalhada na hora.
4. **Faixa de KPIs no topo de cada tela**, também clicável.
5. Novo módulo **Checklist – Controles – Análises** com as 11 abas, registro diário, histórico, evidência (foto/arquivo), painel de conformidade e alertas.
6. Botão **Restaurar dados de exemplo** para deixar a demo pronta antes de cada apresentação.
7. Documento final separando **re-estilizado** e **acrescentado**.

**Não metas**
- Persistência real, multiusuário ou sincronização entre aparelhos.
- Segurança real (RLS, autenticação). Os perfis são simulados.
- Financeiro de verdade. "A receber" e "a pagar" são simulados (ver 6.3).

**Anti-metas** (falha mesmo que "funcione")
- Mudar qualquer cálculo, fórmula ou regra da Calculadora, dos orçamentos, do frete ou das cargas. Os resultados exibidos para as mesmas entradas devem ser idênticos aos de hoje.
- Editar a lógica das telas existentes (`src/features/**`) ou do domínio (`src/domain/**`).
- Um dado fictício que contradiga outro na mesma tela (ex.: KPI de vendas que não bate com a lista de orçamentos).
- A demo travar, ficar vazia ou mostrar erro técnico durante a apresentação.
- Vazar o catálogo comercial real no bundle (`scripts/check-public-bundle.mjs` continua passando).

## 3. Estado atual (o que o builder precisa saber)

- React 19 + TypeScript + Vite, CSS único em `src/styles/global.css` (cerca de 4 mil linhas, tokens em `:root`), fontes Barlow e Barlow Semi Condensed, sem biblioteca de UI.
- Navegação por estado em `src/app/App.tsx` (`tabContent: Record<TabId, …>`), sem rotas de URL. O menu e as permissões ficam em `src/layouts/AppSidebar.tsx` (`navItems`, `hiddenTabs`, `previewTabs`, `canAccessTab`).
- **Só `src/services/*.ts` e `src/app/AuthProvider.tsx` falam com o Supabase.** Nenhuma tela acessa o banco diretamente. Isso é o que torna a abordagem escolhida possível.
- 16 serviços e 22 chamadas `rpc(...)`. As regras mais pesadas estão em SQL: `create_quote`, `update_quote`, `set_quote_status`, `save_load`, `set_load_status`, `sales_report`, `visits_report`, `apply_catalog_update` etc. (ver `supabase/migrations` e `src/ARCHITECTURE.md`).
- **Mudanças não commitadas** já transformaram o repo em demo: `AuthGate` pula o login, `CommercialDataProvider` devolve um catálogo fixo (`src/data/demoCommercialData.ts`), `lib/supabase.ts` virou `null`, e a sessão do usuário saiu da barra lateral. Sem perfil, só aparecem Calculadora, Produtos, Descontos, Condições e Frete.

## 4. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A (escolhida)** | **Serviços "gêmeos" no navegador.** Cada serviço ganha uma versão de demo com as mesmas exportações e tipos, gravando num banco local. Um plugin do Vite troca o serviço real pelo gêmeo no build. | Zero dependência externa, funciona offline, sem login, resetável, telas e domínio intocados. | As regras do SQL precisam ser reescritas de forma simplificada nos gêmeos. É o maior volume de trabalho. |
| B | Projeto Supabase separado com seed fictício | Regras 100% fiéis, menos código | Conta para manter, o plano gratuito pausa por inatividade (risco na apresentação), login de volta, dados compartilhados por todos |
| C | Supabase falso que interpreta o query builder | — | Mais trabalho que A, frágil, sem vantagem |

O usuário escolheu A ("todas as mudanças simuladas").

## 5. Arquitetura da simulação

### 5.1 Troca de serviços sem editar as telas

- Novo diretório `src/demo/`.
- Um plugin em `vite.config.ts` (`resolveId`) redireciona qualquer import que resolva para `src/services/<nome>.ts` para `src/demo/services/<nome>.ts`, quando o gêmeo existe. Faz o mesmo para `src/app/AuthProvider.tsx` → `src/demo/app/AuthProvider.tsx`.
- O mesmo redirecionamento vale no Vitest (`vitest.config` / `test.alias`) **só para testes da demo**. Os testes existentes continuam rodando contra o código original e devem continuar passando.
- Os gêmeos exportam **exatamente** os mesmos nomes e tipos, reaproveitando os tipos dos arquivos originais (`import type … from "../../services/x"` resolve para o original, porque o redirecionamento só vale para imports de valor; o builder confirma isso ou usa `src/types`).
- **Reverter os atalhos de demo não commitados** (`AuthGate.tsx`, `CommercialDataProvider.tsx`, `lib/supabase.ts`, `DataSourceStatus.tsx`, `AppSidebar.tsx`) para a versão do commit `f00c520` sempre que o gêmeo cobrir o caso. Assim o código original roda de verdade, e produto editado em Produtos aparece na Calculadora porque `commercialDataService` (gêmeo) lê do banco local.

### 5.2 Banco local

- `src/demo/store/`: coleções em memória, persistidas em `localStorage` (chave versionada, ex.: `qualinutri-demo:v1`), com leitura e escrita protegidas por `try/catch`. Se o armazenamento falhar, a demo roda só em memória.
- **Arquivos de evidência** (fotos/PDF) em **IndexedDB**. Fotos são reduzidas no navegador para no máximo 1600 px e JPEG ~0,8 antes de salvar. O banco local guarda só a referência.
- Latência simulada de 120–300 ms por chamada, para os estados de carregamento das telas aparecerem como no sistema real.
- **Restaurar dados de exemplo:** apaga tudo e recarrega o seed. Fica no menu do usuário e em `?reset=1` na URL.
- O seed é gerado por código (`src/demo/seed/`) com **datas relativas a hoje**, para a demo estar sempre "atual". O gerador é determinístico (semente fixa) e produz sempre os mesmos dados.

### 5.3 Regras reimplementadas nos gêmeos (simplificadas, mas coerentes)

Reutilizar sempre as funções puras de `src/domain/**` (cálculo de pedido, peso, `summarizeLoad`, prazo de pagamento) em vez de reescrever contas.

- **Orçamentos:** número sequencial; fluxo rascunho → enviado → aprovado, e cancelado; datas de envio e aprovação marcadas pelo gêmeo; só rascunho e enviado são editáveis; duplicar copia as observações; orçamento numa carga ativa não pode ser cancelado. Totais vêm do snapshot (já calculado pelo domínio).
- **Clientes:** CRUD com desativação lógica, propriedades, cache igual ao original.
- **Visitas:** agendar, reagendar, registrar, marcar como não realizada, retorno cria a próxima visita, visita registrada não pode ser excluída.
- **Cargas:** capacidade do veículo, saldo por item do pedido, paletes via `summarizeLoad`, fluxo Planejada → Carregada → Expedida e cancelamento devolvendo o saldo, `getQuoteShipping`.
- **Relatórios:** `sales_report` e `visits_report` calculados a partir do banco local, com os mesmos formatos de retorno.
- **Produtos, descontos, frete:** edição e exclusão lógica, com registro de alterações.
- **Atualizações por PDF:** a leitura do PDF continua no navegador (código original). `applyCatalogUpdate` aplica no banco local.
- **Usuários:** listar, criar, ativar/desativar, redefinir senha (simulado), proteção do último administrador.
- **Erros:** mensagens amigáveis no mesmo formato de `serviceError` quando uma regra é violada.

### 5.4 Login e perfis

- Sem tela de login. A demo abre logada como **"Usuário Demonstração — Administrador"**.
- **Troca de perfil** no menu do usuário (Administrador / Comercial / Consulta), para mostrar as permissões. `canAccessTab` continua decidindo o menu.
- Em modo demo, `hiddenTabs` e `previewTabs` ficam vazios, para todas as telas aparecerem. Sair só volta para a tela inicial.

## 6. Redesign visual

### 6.1 Direção

- Plataforma de gestão moderna, clara, densa sem ser apertada. Mantém a marca (logo, verde Qualinutri), mas com nova identidade de interface: tokens refeitos, superfícies com elevação sutil, raio maior, tipografia com hierarquia mais forte e números tabulares.
- Nome exibido: **"Qualinutri · Gestão Integrada"** (decisão minha, ver seção 10).
- Ícones em todos os itens de menu, botões principais e KPIs (`lucide-react`, ou SVG inline equivalente).
- Estados de hover, foco visível, ativo, desabilitado, carregando (skeleton) e vazio, consistentes.

### 6.2 Moldura nova (layouts, não telas)

- **Barra lateral agrupada** com ícones: Início · Comercial (Calculadora, Orçamentos, Clientes, Visitas, Relatórios) · Operação (Cargas, Checklist – Controles – Análises) · Tabelas (Produtos, Descontos, Condições, Frete, Política comercial, Atualizações) · Administração (Usuários). No computador ela recolhe para mostrar só os ícones; no celular abre por cima da tela. Contador de pendências ao lado de Checklist e de Orçamentos.
- **Cabeçalho:** título com trilha (grupo › tela), **busca global / paleta de comandos** (Ctrl+K, ou toque no ícone no celular) que encontra telas, clientes, orçamentos, veículos, lotes e registros do módulo e abre direto. Sino de alertas, menu do usuário (perfil, restaurar dados) e selo "Demonstração".
- **Celular:** barra inferior com 4 atalhos (Início, Calculadora, Checklist, Menu).
- `App.tsx` ganha as abas novas (`dashboard`, `checklist`) **somente por acréscimo** e passa a abrir em `dashboard`. A Calculadora continua sempre montada e escondida, como hoje.

### 6.3 Restyle das telas existentes

- Feito principalmente em `global.css`. Nas telas (`src/features/**`) só são permitidas mudanças **puramente visuais** (className, ícone, wrapper sem lógica). Nenhuma mudança em estado, handlers, efeitos, chamadas de serviço ou condicionais. A revisão do diff dessas pastas precisa mostrar isso.
- Tabelas: cabeçalho fixo, linhas zebradas, valores alinhados à direita, e no celular viram cartões quando o `ScrollableTable` não bastar (via CSS).
- Diálogos, `Select`, `DateInput`, `Notice`, `Panel`, `EmptyState`: novo visual, mesma API.
- PDFs/impressões (`QuotePrint`, `LoadPrint`): **não mudam**.

## 7. KPIs

### 7.1 Painel inicial (Início)

Grade de cartões **reordenável por arraste** (ordem salva no navegador), com filtro de período (Hoje / 7 dias / Mês / Personalizado). Cada cartão tem valor, comparação com o período anterior e minigráfico. **Clique abre uma gaveta lateral** com a lista detalhada (busca, ordenação, exportar CSV) e o botão "Abrir em <tela>", que navega para a tela completa. Não é preciso filtrar a tela de origem, então as telas existentes não mudam.

KPIs (todos calculados do banco local, para baterem com as telas):
- Vendas do dia / período (orçamentos aprovados, R$ e toneladas)
- Orçamentos em aberto (rascunho + enviado, R$)
- Taxa de conversão (aprovados ÷ enviados)
- Produto mais vendido (sacas e R$) e ranking dos 5 primeiros
- Ticket médio
- **A receber:** gerado dos orçamentos aprovados × prazo/forma de pagamento (parcelas com vencimento). Parcelas são marcadas como pagas no seed para as datas passadas, com alguns atrasos.
- **A pagar:** coleção fictícia própria (fornecedores de matéria-prima, manutenção da frota, fretes), coerente com os registros do módulo (ex.: custo de manutenção vira conta a pagar).
- **Em atraso:** parcelas vencidas, visitas atrasadas, manutenções vencidas e checklists vencidos, numa só lista
- Cargas: planejadas, em carregamento, expedidas; ocupação média da frota
- Visitas da semana: agendadas, realizadas, não realizadas
- Conformidade geral do módulo (%) e alertas abertos (análise fora do padrão, NC aberta, EPI vencido)

Os cartões "a receber" e "a pagar" levam o selo "simulado".

### 7.2 Faixa de KPIs por tela

Um componente `PageKpis` renderizado pelo `App.tsx` **acima** de cada tela (as telas não são editadas). São de 3 a 5 cartões clicáveis por tela, que abrem a mesma gaveta:

- Calculadora: orçamentos criados hoje, último orçamento salvo, tabela vigente
- Orçamentos: em aberto, aprovados no mês, conversão, valor em aberto
- Clientes: ativos, novos no mês, sem compra há 90 dias
- Visitas: hoje, semana, atrasadas, conversão de fechamento
- Relatórios: sem faixa (a tela já é de indicadores)
- Cargas: planejadas, expedidas no mês, ocupação média, pedidos aprovados a enviar
- Produtos: produtos ativos, por linha, última alteração de preço
- Descontos / Condições / Frete / Política: contagens e última alteração
- Atualizações: última importação, itens alterados
- Usuários: ativos por perfil
- Checklist: o próprio painel de conformidade (seção 8.2)

## 8. Módulo "Checklist – Controles – Análises"

### 8.1 Motor genérico

Todas as abas usam o mesmo motor, configurado por aba (`src/demo/../modules/checklist/` ou `src/features/checklist/`, decisão do builder):

- **Registro:** `id, aba, data/hora, responsável (usuário), status, evidências[], campos da aba, vínculos` (cliente, veículo, produto, fornecedor, lote, colaborador, equipamento, amostra).
- **Status:** `pendente`, `concluído/conforme`, `não conforme`. Algumas abas têm fluxo próprio (ex.: solicitação aberta → em execução → concluída).
- **Agenda/frequência por alvo** (ex.: cada veículo a cada 10.000 km ou 90 dias; cada ponto de praga semanal; EPI mensal por colaborador). O motor gera as **ocorrências esperadas**. Esperada sem registro e já vencida conta como **pendente/atrasada**.
- **Regra de conformidade por aba:** um campo fora do padrão ou um item do checklist "não" marca não conforme e gera **alerta**.
- **Telas de cada aba:** (1) mini-painel com KPIs e gráfico de 30 dias; (2) lista/histórico com filtros (período, status, alvo, responsável) e busca; (3) formulário em diálogo com campos da aba, checklist de itens e **anexo de evidência** (arquivo ou câmera no celular via `capture="environment"`, com miniaturas e visualização); (4) ficha do alvo (ex.: histórico e custo acumulado do veículo).
- **Registro rápido:** botão "+ Registrar" sempre visível. No celular, botão flutuante.
- **Pendências em quadro (kanban)** por aba quando há fluxo (Qualidade, Manutenção, Envase/NC), com **arrastar** entre colunas.
- **Relatório imprimível** por aba e período (impressão do navegador).

### 8.2 Painel de conformidade (entrada do módulo)

Grade com as 11 abas. Cada cartão mostra feitos, pendentes, não conformes, % de conformidade e tendência de 14 dias. O clique leva à aba já filtrada. Abaixo, a lista unificada "precisa de atenção" (vencidos + não conformes + alertas), ordenada por gravidade. A mesma lista alimenta o sino do cabeçalho.

### 8.3 Cadastros

- **Consumidos sem alteração:** clientes (`customerService`), veículos (`loadService.listVehicles`), produtos (catálogo), cargas e orçamentos aprovados (Logística), usuários (responsáveis). O módulo só lê esses dados.
- **Próprios do módulo (novos):** fornecedores, matérias-primas com padrões (ex.: milho: umidade ≤ 14%, proteína ≥ 7%, aflatoxina ≤ 20 ppb), colaboradores, equipamentos, pontos de controle de pragas, áreas de limpeza. Cada um com uma tela simples de cadastro dentro do módulo (aba "Cadastros").

### 8.4 Abas

1. **Manutenção Preventiva:** checklist por veículo/equipamento (óleo, filtros, pneus, freios, luzes, correias…), km/horímetro, tipo (preventiva/corretiva), custo, oficina. Histórico e **custo acumulado** por veículo. **Solicitação de manutenção** (aberta → em execução → concluída). **Próxima revisão** por data ou km, com alerta 7 dias / 500 km antes e vencida.
2. **Logística:** viagens/rotas (veículo, motorista, cidades, km, combustível, pedágio, diárias, entregas). Pode vincular uma carga existente. **Custo por entrega** e **por veículo**, e custo por tonelada.
3. **Segurança do Trabalho:** checklist de EPIs por colaborador (capacete, botina, luvas, protetor auricular, máscara PFF2, óculos, uniforme) com nº de CA e validade. Item ausente ou vencido marca não conforme. Mensal por colaborador.
4. **Matérias-Primas (recepção):** fornecedor, insumo, NF, placa, quantidade (kg), umidade, impurezas, temperatura, aspecto/odor, decisão (aceito / aceito com ressalva / recusado). Ranking de fornecedores.
5. **Qualidade:** ocorrências (tipo, gravidade, origem, descrição, ação corretiva, responsável, prazo), quadro aberta → em tratamento → encerrada, evidências e relatório em tempo real.
6. **Produtos para Análises (Amostras):** código, tipo (MP/produto acabado), produto/insumo, lote, coleta, laboratório, status (coletada → enviada → em análise → concluída), retenção até, local da contraamostra.
7. **Controle de Análises de Matérias-Primas:** análise de entrada por lote e fornecedor (proteína, umidade, aflatoxina, impurezas…) contra o padrão do insumo. **Alerta quando fora do padrão.** Gráfico por fornecedor.
8. **Controle dos Resultados das Análises:** laudos (laboratório, nº do laudo, PDF anexo, parâmetros e resultados) vinculados a amostra, lote e fornecedor. Histórico e tendência por parâmetro.
9. **Envase, Contaminação Cruzada e Erros de Produção:** não conformidades de produção (tipo: peso fora, contaminação cruzada, rotulagem, mistura errada, embalagem), produto, lote, quantidade afetada, causa, ação, status.
10. **Controle de Pragas:** checklist periódico por ponto (iscas consumidas, armadilha, sinais de roedor/inseto, ação), empresa terceirizada, certificado anexo. Ponto sem registro na semana fica pendente.
11. **Controle de Descarte (Limpeza):** rotinas por área (frequência, tipo de limpeza, produto/sanitizante, responsável), descarte de resíduos (tipo, kg, destino, MTR anexo).

### 8.5 Seed do módulo

60 a 90 dias de histórico por aba, com cerca de 85% conforme, alguns não conformes e alguns vencidos **hoje**, para o painel sempre ter o que mostrar. As evidências do seed são imagens geradas por código (placeholders com rótulo, ex.: "Foto – pneu dianteiro"), sem fotos reais.

## 9. Seed comercial

Determinístico, relativo a hoje: cerca de 45 clientes (fazendas/revendas fictícias do norte de MT, com propriedades), 4 usuários (1 admin, 2 comerciais, 1 consulta), cerca de 140 orçamentos nos últimos 120 dias, em todas as situações, coerentes com o catálogo fictício, cerca de 120 visitas, 5 veículos e configuração de paletes, cerca de 12 cargas em todas as situações, uma política comercial fictícia e um histórico de importação. O catálogo fictício atual (`demoCommercialData.ts`) é ampliado para cerca de 15 produtos e mais prazos, faixas e linhas de desconto, **todos fictícios** (o check de vazamento continua passando).

## 10. Decisões tomadas por mim (o usuário pode corrigir)

- Nome exibido "Qualinutri · Gestão Integrada" e manutenção do logo e do verde da marca.
- Sem tela de login; abre logado como administrador, com troca de perfil no menu.
- A receber derivado dos orçamentos aprovados; a pagar como coleção fictícia ligada ao módulo.
- Drill-down em gaveta lateral, em vez de filtrar a tela de origem.
- Só tema claro.
- Ícones com `lucide-react` (única dependência nova prevista; gráficos em SVG próprio, sem biblioteca).
- Arrastar: cartões do painel e quadros (kanban) do módulo.

## 11. Deixado para o builder

Organização exata de pastas dentro de `src/demo/`, forma do plugin do Vite, componentes de gráfico, quantidades exatas do seed, textos de exemplo, detalhes de breakpoints.

## 12. Verificação e entrega

- `npm run check` passa (testes originais, typecheck, build, check de vazamento).
- Testes novos para os gêmeos com regras (orçamento, carga, conformidade do módulo, a receber).
- Teste de caracterização: mesmas entradas na Calculadora → mesmos resultados antes e depois.
- Passeio no navegador (Playwright) em 390 px, 820 px e 1440 px por todas as telas, com screenshots.
- `git diff` de `src/domain/**` vazio. `git diff` de `src/features/**` só com mudanças visuais.
- Entregar `docs/DEMO-MUDANCAS.md`: tabela "re-estilizado" × "acrescentado" × "simulado", afirmando que nenhuma função pré-existente teve a lógica alterada.
