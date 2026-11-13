# Demo ampliada — o que mudou

Demonstração da **Qualinutri · Gestão Integrada**. Todos os dados são fictícios e ficam salvos só no navegador de quem usa. Para voltar aos dados de exemplo, use o menu do usuário › **Restaurar dados de exemplo**, ou abra o endereço com `?reset=1`.

## Garantia: nenhuma função existente foi alterada

| Área | Situação |
|---|---|
| `src/domain/**` (cálculos de pedido, preço, desconto, frete, chapa, peso, paletes, prazo) | **Intocado.** Nenhuma linha mudou. |
| `src/services/**` (acesso ao Supabase) | **Intocado.** Na demo, um plugin do Vite troca cada serviço por um "gêmeo" simulado com o mesmo nome e o mesmo formato de resposta (`src/demo/services`). |
| Telas existentes em `src/features/**` (Calculadora, Orçamentos, Clientes, Visitas, Relatórios, Cargas, Produtos, Descontos, Condições, Frete, Política, Atualizações, Usuários) | **Intocadas.** Mesmos campos, botões, fluxos e PDFs. Só ganharam a pele nova pelo CSS (`src/styles/redesign.css`). |
| Testes originais (`tests/**`, fora de `tests/demo`) | Todos passam sem alteração (`npm run check`). |

Para os mesmos dados de entrada, a Calculadora dá os mesmos resultados: ela continua usando as funções originais de `src/domain`.

## Apenas re-estilizado (aparência e navegação)

- **Navegação nova:** barra superior em vidro verde com o logo e os grupos Início, Comercial, Operação, Tabelas e Administração. Cada grupo abre um painel com as telas. A barra recolhe numa pílula flutuante.
- **Celular:** menu que desce do topo e barra de atalhos embaixo.
- **Tema "vidro líquido" verde:** tipografia Manrope, cartões translúcidos, fundo animado com a marca d'água do logo, botões em pílula e foco visível.
- **Animações:** transição entre telas, números que contam até o valor, gráficos que se desenham e cartões que reagem ao mouse. Tudo respeita a opção do sistema de reduzir movimento.
- Todas as telas existentes têm o visual novo e a mesma função.
- Impressões (PDF do orçamento e romaneio de carga): **sem mudança.**

## Acrescentado

| Item | Onde |
|---|---|
| **Painel inicial (Início)** com KPIs: vendas, orçamentos em aberto, conversão, produto mais vendido, ticket médio, a receber, a pagar, em atraso e novos clientes. Os cartões podem ser arrastados para reordenar. Tudo é clicável: o gráfico abre os pedidos do dia, o ranking abre os pedidos do produto, o caixa abre as contas da semana, o funil abre os orçamentos de cada etapa e a movimentação abre os itens do orçamento. | `src/features/dashboard` |
| **Faixa de KPIs no topo de cada tela**, clicável, que abre a lista detalhada numa gaveta com busca, ordenação, exportação CSV e o botão "Abrir em…". | `src/components/demo/PageKpis.tsx` |
| **Busca global (Ctrl+K):** encontra telas, clientes, orçamentos e veículos. Enter num cliente abre o Novo orçamento com ele escolhido. | `src/components/demo/CommandPalette.tsx` |
| **Sino de alertas:** parcelas e contas vencidas, visitas sem registro e alertas do checklist. | `src/components/demo/AlertsPanel.tsx` |
| **Troca de perfil** (Administrador, Comercial, Consulta) para mostrar as permissões. | menu do usuário |
| **Módulo Checklist – Controles – Análises:** 11 abas, painel de conformidade, registro diário com data, responsável, situação e evidência (foto pela câmera ou arquivo), histórico, gráfico por dia, filtros, quadro arrastável por etapa, visão por veículo com custo acumulado, alertas de revisão, relatório para imprimir e exportação. Inclui também os cadastros do módulo: fornecedores, matérias-primas com padrões, colaboradores, equipamentos, pontos de pragas e áreas de limpeza. | `src/features/checklist`, `src/demo/checklist` |

As abas são: Manutenção Preventiva, Logística, Segurança do Trabalho (EPIs), Matérias-Primas (recepção), Qualidade, Produtos para Análises (amostras), Controle de Análises de Matérias-Primas, Controle dos Resultados das Análises, Envase/Contaminação Cruzada/Erros de Produção e Controle de Descarte (Limpeza). O Controle de Pragas existe no motor, mas fica oculto na demonstração.

### Módulos acrescentados a partir da ata de 06/11 e da reunião de 13/11

| Dor levantada | Tela |
|---|---|
| Uma ordem de carga com vários clientes e sem assinatura individual (Rogério) | **Logística › clique na carga › Fichas de entrega**: uma ficha por cliente, com a parada no roteiro, os itens para conferir, as NF-e, os boletos, espaço para fotos (descarga, nota, boleto) e assinatura do recebedor. Pode ser vista na tela e impressa ou salva em PDF. |
| Montagem de carga manual (Cássio, Daniel e Rogério) | **Pátio de carga 3D** (`public/patio-de-carga.html`, em Operação). Carrega uma carga real ou a próxima carga sugerida e transforma os pedidos em paletes de sacas de 25, 30 e 40 kg. Mostra os eixos, o peso e as metas da carga. |
| Conserto de caminhão sem controle (Agnaldo) | **Frota**: pedido de conserto com orçamentos e aprovação da gestão, frete cobrado × custo de cada caminhão e padrões de quebra por cliente. Frota real: 3 graneleiros, 2 carros e uma empilhadeira. |
| Antecipação calculada por média (Cibelly e Cláudia) | **Financeiro › Antecipação**: borderô com valor exato por título (juros, IOF e tarifa), comparado com o cálculo por média; faturado × já antecipado × livre por mês. |
| Extrato por PDF | **Financeiro › Conciliação Sicoob/Itaú**: extrato automático com conciliação e sugestões. Também saldos, boletos descontados em outra cor, Pix com QR Code e meta do mês. |
| Venda para inscrição estadual irregular | **Fiscal**: NF-e bloqueada quando a IE está suspensa ou baixada no SINTEGRA; DANFE; MDF-e encadeado à carga, com notas, veículo, placa e motorista preferido já preenchidos. |
| Score manual, "bolinha verde" com boleto em aberto (Ana) | **Crédito e cliente 360°**: score automático (vermelho a partir de 5 dias de atraso), ticket médio, o que o cliente mais compra, descontos concedidos, histórico, anexos por arrastar, consulta AG Risk (simulada) e conversa interna por cliente. |
| Aprovações por telefone | **Aprovações e chat**: cadastro, desconto, crédito e conserto aprovados pela gestão, com histórico das decisões e chat interno. |
| Fórmula fora da empresa e produção lançada só à noite (Cássio) | **Produção e estoque**: ordens de produção que dão baixa nos insumos na hora, estoque de matéria-prima com mínimo, produto acabado disponível e fórmulas dentro do sistema com custo por tonelada, custo por saca e margem. |

O módulo **lê** veículos, clientes, produtos e cargas do sistema, mas **não altera** esses cadastros.

## Simulado (só na demonstração)

- Todos os serviços que antes falavam com o Supabase: orçamentos, clientes, visitas, cargas, relatórios, usuários, atualizações por PDF e edição de tabelas. As regras principais do banco foram reproduzidas: fluxo de situação do orçamento, dono ou administrador, saldo e capacidade de carga, visitas de cada vendedor, último administrador e período de relatório de até um ano.
- **A receber:** gerado das parcelas dos orçamentos aprovados. **A pagar:** lista fictícia. Os dois aparecem com o selo "simulado".
- Login: a demo abre logada. As fotos de evidência ficam guardadas no navegador (IndexedDB).
