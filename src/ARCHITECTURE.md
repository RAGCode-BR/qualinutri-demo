# Estrutura inicial

Esta estrutura registra a arquitetura resultante da migração incremental do sistema legado.

- `app`: composição e inicialização da aplicação.
- `assets`: imagens e outros arquivos estáticos extraídos do legado.
- `components`: componentes compartilhados e sem regra de negócio específica.
- `domain`: cálculos e regras puras, independentes de React e Supabase.
- `features`: módulos funcionais, como calculadora, produtos, preços e frete.
- `hooks`: hooks reutilizáveis.
- `layouts`: estruturas visuais de página.
- `lib`: configuração de bibliotecas externas.
- `pages`: composição das áreas navegáveis.
- `services`: acesso a fontes externas de dados.
- `types`: tipos compartilhados.
- `utils`: utilitários sem estado.

Os dados comerciais de referência permanecem no snapshot versionado `src/data/commercial-snapshot.json`. Testes e geração do seed não dependem mais do arquivo HTML original.

## Fonte dos dados comerciais

O `CommercialDataProvider` é o único ponto de estado responsável pelo catálogo usado pela interface. Ele inicia vazio e carrega o catálogo pelo Supabase após a autenticação. O snapshot versionado permanece apenas para testes e geração do seed; não entra no JavaScript publicado. A atualização periódica e a atualização ao voltar para a aba suspendem o salvamento quando não conseguem confirmar os dados vigentes.

O acesso ao Supabase está separado por responsabilidade:

- `productService`: produtos, categorias, condições com preço e tabela vigente;
- `discountService`: regras selecionáveis da tabela de descontos vigente;
- `freightService`: tabelas, faixas, tarifas e taxa de descarga vigentes;
- `policyService`: versão e seções da política vigente.

Os componentes consomem somente `CommercialData`; eles não executam queries. Os cálculos permanecem nas funções puras de `domain` e não consultam o banco durante alterações da calculadora.

Depois da autenticação, apenas perfis ativos carregam os dados remotos. Falhas de leitura são convertidas em uma mensagem segura; sem catálogo confirmado, não é possível salvar orçamentos nem editar tabelas. Erros técnicos do PostgreSQL ou do PostgREST não são exibidos ao usuário.

## Persistência histórica de orçamentos

`createQuoteSnapshot` copia todas as entradas, textos comerciais e resultados calculados. Quando disponíveis, também registra os IDs das tabelas, produtos, prazos e regras usados. O snapshot não depende do catálogo vigente para ser reconstruído posteriormente e mantém os valores intermediários sem arredondamento adicional.

`quoteService` converte esse snapshot para o contrato do PostgreSQL. A função `create_quote` grava `quotes` e `quote_items` na mesma transação. O serviço também prepara listagem, consulta, duplicação e cancelamento lógico; não existe exclusão física de histórico.

As tabelas e a função transacional usam RLS. Administradores e usuários comerciais podem gravar clientes e orçamentos; consultas não têm acesso a essas áreas. Escrita anônima permanece bloqueada.

Não há escrita direta em `quotes` e `quote_items`: toda gravação passa por `create_quote`, `update_quote` e `set_quote_status`. Todos os comerciais veem todos os orçamentos, mas só o dono do orçamento ou um administrador edita, muda a situação ou cancela. Só rascunhos e enviados podem ser editados; o aprovado fica fechado, e para refazê-lo é preciso duplicar. As datas de envio e aprovação são marcadas pelo servidor. `created_by` é preenchido por gatilho em clientes, orçamentos, visitas e propriedades, e não pode ser informado pela tela.

O peso da carga é sempre a soma de sacas × peso da saca de cada item (`domain/order/orderWeight.ts`), a mesma conta da Calculadora; o PDF usa o peso gravado em cada item. No preço manual, o peso da saca é obrigatório.

O prazo de pagamento é do orçamento inteiro: é escolhido no bloco Pagamento da Calculadora, define a coluna de preço de todos os produtos e é gravado igual em cada item (`payment_term_snapshot`). Ao trocar o prazo, só os itens com preço vindo da tabela (`priceFromTable`) são repreçados; preço digitado fica. Enquanto o prazo não é escolhido, os produtos usam o preço à vista; salvar exige o prazo. No PDF, o prazo sai uma vez nas condições (orçamentos antigos com prazos diferentes continuam com o prazo em cada linha). Prazos com duas formas ("30/60/90 ou 60 dd") exigem escolher a forma do prazo do orçamento (`quotes.payment_mode`: `installments` = parcelado, `single` = direto). A regra de leitura e o texto do PDF ficam em `domain/payment/paymentTerm.ts`; orçamentos antigos, sem a escolha, mostram o prazo como antes.

O orçamento tem um campo de observações (`quotes.notes`, até 1.000 caracteres), preenchido na Calculadora, gravado por `create_quote` e `update_quote`, copiado ao duplicar e impresso no PDF para o cliente.

Gatilhos adiados validam no banco a aritmética dos itens e totais antes de concluir a transação. O preço manual continua permitido; a validação garante consistência matemática, não substitui uma política de aprovação comercial para valores informados manualmente.

## Clientes

`customerService` concentra criação, edição, consulta, listagem e desativação lógica. Clientes não são excluídos fisicamente, e o documento não é normalizado nem tratado como chave sem uma regra comercial aprovada.

O orçamento referencia o cliente, mas também guarda snapshots de nome e documento. Assim, uma correção cadastral futura não muda a identificação apresentada em um orçamento histórico.

`listCustomers` traz só o resumo de cada cliente (nome, código, documento, telefone, e-mail, cidade e documento original do cadastro antigo), em páginas de 500. Calculadora, Orçamentos, Visitas e Clientes compartilham a mesma resposta por 2 minutos; criar, editar ou desativar um cliente renova a lista. A ficha e a edição buscam o cadastro completo com `getCustomer`.

Clientes importados guardam `legacy_code` e `legacy_details`. Só o administrador altera esses campos (gatilho `protect_legacy_customer_fields`).

## Autenticação e autorização

`AuthProvider` concentra sessão, login, logout e perfil. `AuthGate` impede que a aplicação interna seja montada sem sessão ou com uma conta inativa. A interface autentica por login e senha; internamente, um endereço técnico não entregável e determinístico é usado apenas como identificador exigido pelo Supabase Auth.

O cadastro público está desabilitado no frontend e no Supabase Auth. A criação de contas ocorre somente na área administrativa por meio da Edge Function `create-user`, que valida a sessão e o papel do solicitante antes de usar a API administrativa. A `service_role` permanece exclusivamente no ambiente seguro da função.

Contas administrativas são criadas com `must_change_password = true`. Após autenticar com a senha temporária, `AuthGate` permite apenas a tela de troca. A Edge Function `change-initial-password` altera a senha no Supabase Auth e só então libera o perfil; componentes do navegador nunca recebem a chave administrativa.

Administradores podem redefinir a credencial de outro usuário pela Edge Function `reset-user-password`. A função primeiro marca `must_change_password = true` e só então grava a nova senha temporária. `current_profile_role` só retorna um papel quando esse marcador está falso, bloqueando também as operações RLS durante a troca pendente.

Os papéis disponíveis são:

- `administrador`: gerencia usuários e dados comerciais;
- `comercial`: gerencia clientes e orçamentos;
- `consulta`: consulta catálogo, tabelas e política.

As permissões visuais refletem as políticas RLS, mas a autorização efetiva fica no PostgreSQL. O banco também impede a desativação, o rebaixamento ou a exclusão do último administrador ativo.

## Edição de produtos

Administradores editam nome, peso e preços de um produto pela página **Produtos**. `productService` chama a função `update_product`, que valida os dados e grava produto e preços da tabela vigente na mesma transação. A exclusão chama `deactivate_product` e é lógica: o produto sai do catálogo e da calculadora, mas permanece referenciado pelos orçamentos.

Toda alteração em `products` e `product_prices` é registrada por gatilho em `product_change_log`, com os valores anteriores, os novos, o autor e o horário. A edição só é liberada quando o catálogo vigente foi confirmado pelo Supabase.

## Edição de descontos

Administradores criam, editam e excluem linhas de desconto pela página **Descontos**. `discountService` chama `save_discount_rule` (cria quando não recebe id) e `deactivate_discount_rule`. A exclusão é lógica. Linhas novas entram antes de "Outro / personalizado", e a Calculadora reconhece a linha personalizada por não ter percentual fixo, não pela posição. O 1,5% do pagamento antecipado é fixo no domínio de cálculo e não é editado por essa página. Alterações ficam registradas em `discount_change_log`.

## Edição de frete

Administradores criam, editam e excluem faixas da tabela Juara e cidades da tabela Regional pela página **Frete**, e alteram o valor padrão da chapa. `freightService` chama `save_freight_zone` (cria quando não recebe id e grava as tarifas da faixa), `deactivate_freight_zone` (exclusão lógica) e `save_handling_rate`. Na Regional, deixar a fracionada vazia remove essa tarifa: a cidade passa a aceitar só carga fechada. Alterações em faixas, tarifas e chapa ficam em `freight_change_log`. A Calculadora reencontra a faixa escolhida pelo nome quando a tabela muda e desmarca o frete se ela foi excluída.

## Atualizações por PDF

A página **Atualizações** (somente administradores) recebe um PDF com tabela de preços, descontos ou frete. `extractPdfLines` lê o texto no próprio navegador com pdf.js, carregado só nessa página, e devolve as linhas visuais com a posição horizontal de cada pedaço. `parseCatalogUpdate` compara com o catálogo atual sem depender de posições fixas: produtos, linhas de desconto e faixas de frete cadastrados são reconhecidos pelo nome e os números seguintes são os valores. Quando o texto de uma célula quebra, até três linhas seguidas são remontadas pela ordem das colunas. Linhas com um nome desconhecido seguido de um preço por prazo viram sugestão de produto novo.

Nada é gravado sem confirmação. O que for marcado na tela é enviado a `apply_catalog_update`, que grava tudo numa única transação usando as mesmas funções da edição manual e registra a importação em `catalog_imports`. PDFs escaneados (sem texto) não são suportados.

## Visitas

A página **Visitas** (administrador e comercial) é a agenda de visitas a clientes, com visão por dia, semana (segunda a domingo) ou mês. Uma visita nasce agendada (`planned`) ou já realizada (`completed`) e pode ser marcada como não realizada (`not_done`) com motivo. Ao registrar, o vendedor informa o que foi feito, os tipos de visita e, no fechamento, o orçamento do cliente; uma data de retorno cria a próxima visita agendada (`follow_up_of`). "Criar orçamento na Calculadora" abre a Calculadora com o cliente escolhido.

Clientes continuam compartilhados entre os comerciais; cada um vê só as próprias visitas (RLS em `visits`), e o administrador vê todas. O banco garante que propriedade e orçamento sejam do cliente da visita, que o orçamento não esteja cancelado e que visitas já registradas não sejam excluídas. As propriedades (`customer_properties`) e o histórico ficam na ficha do cliente, aberta pela página Clientes.

O relatório de visitação fica na página **Relatórios** (aba Visitação) e vem de `visits_report`, com o mesmo período e a mesma regra de acesso do relatório de vendas: comercial vê só as próprias visitas e não recebe o comparativo por vendedor. Considera a data de realização da visita ou, se ainda não foi realizada, a data agendada. A conversão compara visitas de fechamento com orçamentos vinculados e aprovados.

## Cargas

A página **Cargas** (administrador e comercial) monta o envio dos orçamentos aprovados num veículo. O administrador cadastra os veículos (capacidade em kg e, opcionalmente, as medidas do baú) e os dados de palete: peso do palete vazio e sacas por palete para cada peso de saca.

Uma carga reúne itens de um ou mais pedidos. Cada pedido pode ir inteiro ou em parte, informando as sacas de cada item; o restante continua "a enviar" para outra carga. Pedidos do mesmo cliente formam uma entrega, e a ordem das entregas fica gravada em `load_items.stop_order`. Cada pedido vai paletizado ou solto.

O peso da carga soma as sacas e os paletes vazios. Os paletes são contados por pedido e peso de saca, arredondando para cima. A mesma regra está em `domain/loads/summarizeLoad.ts`, usada pela tela, e em `save_load`, que recalcula no banco e recusa carga acima da capacidade ou item acima do saldo do pedido, travando os itens do orçamento para evitar duas cargas simultâneas.

Não há escrita direta em `loads`, `load_items`, `vehicles` e `pallet_settings`: tudo passa por `save_load`, `set_load_status`, `save_vehicle`, `deactivate_vehicle` e `save_pallet_settings`. A situação segue **Planejada → Carregada → Expedida**; a carregada pode voltar a planejada, e a planejada ou carregada pode ser cancelada, devolvendo o saldo. Só a planejada é editável, e as datas de cada etapa são do servidor. Um orçamento que está numa carga não cancelada não pode ser cancelado. A página Orçamentos mostra o andamento dos aprovados (`quote_shipping`), e cada carga gera um romaneio em PDF com as entregas na ordem.

A montagem em andamento fica guardada em memória ao trocar de página, como o pedido da Calculadora.

A página está desativada para todos (em `hiddenTabs`, em `layouts/AppSidebar.tsx`), junto com os selos de expedição em Orçamentos. Para reativar só para teste, tire `loads` de `hiddenTabs`: aí ela volta a aparecer apenas para os logins de `previewTabs`, em `layouts/AppSidebar.tsx`. Para liberar aos administradores e comerciais, basta tirar `loads` dessa lista.

## Listas de seleção

Todas as listas usam `components/Select.tsx` no lugar do `<select>` do navegador. A lista abre num popover (camada superior da página), então aparece também por cima das janelas modais, e vira para cima quando falta espaço embaixo. Listas com mais de 7 opções ganham busca sem acentos. Listas muito grandes desenham só os 100 primeiros resultados (mais a opção escolhida) e pedem para digitar para encontrar os demais. Teclado: setas, Enter, Esc, Home/End e digitar a inicial. Para novas listas, use esse componente.

Campos de data usam `components/DateInput.tsx`: mesmo visual dos demais campos, ícone de calendário do sistema e clique em qualquer parte do campo abrindo o calendário do aparelho (`showPicker`).
