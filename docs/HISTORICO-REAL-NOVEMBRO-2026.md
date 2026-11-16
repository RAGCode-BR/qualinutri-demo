# Histórico real e cenários comerciais locais

Acesso: Relatórios → Histórico real · Nov/2026 e simulação.

Fontes locais: `produtos 11-26.pdf` (3 páginas) e `vendedor 11-26.pdf` (4 páginas). Período 01–13/11/2026, emissão 14/11/2026. Recebimento informado por Reinan: Igor Morgado, LA: Sistemas, 14/11/2026; a origem da mensagem não foi consultada nesta tarefa. O JSON guarda SHA-256 de cada PDF e página de cada linha. Extração reproduzível em `scripts/extract-historical-pdfs.py` com PyMuPDF; fontes esperadas em `/Users/rei/Downloads/`.

## Colunas e conferência

Produtos: código/nome, unidade, fabricante (inclusive ausente), grupo (inclusive texto truncado), quantidade, preço médio histórico e valor. 95 linhas vendedor/produto, 43 códigos, 13 vendedores. Quantidades entre parênteses convertidas para negativas. Valores monetários originais preservados; não recalculados pelo preço médio arredondado.

Vendas gerais: cliente/fornecedor e código, documento, série, emissão, vendedor, bruto, descontos, despesa, líquido e status (inclusive vazio). 134 documentos. A série EV do documento 0005783 está no rodapé da página 3 e sua linha na página 4. Nomes truncados não foram completados.

| Vendedor | KG | SC | Valor produtos = líquido geral | Documentos |
|---|---:|---:|---:|---:|
| 001 Agnaldo | 7.097,10 | 7 | 11.778,33 | 2 |
| 022 Fabiano | 0 | 354 | 25.261,39 | 5 |
| 025 S/ comissão | 0 | 219 | 13.693,22 | 7 |
| 026 Telma | 0 | 904 | 58.666,06 | 24 |
| 054 Luan | 0 | 285 | 21.227,90 | 3 |
| 101 Roberto | 0 | 35 | 5.174,05 | 1 |
| 115 Daiany | 125 | 2.567 | 173.863,96 | 70 |
| 131 Daniel | 0 | -155 | -9.534,40 | 8 |
| 136 Igor Vieira | 0 | 100 | 5.732,00 | 1 |
| 139 Igor S. Santos | 0 | 84 | 8.182,18 | 2 |
| 145 Ana | 0 | 577 | 5.129,91 | 7 |
| 149 Anderson | 0 | 34 | 2.154,24 | 1 |
| 155 Moacir | 0 | 1.133 | 74.617,04 | 3 |
| Total | 7.222,10 | 6.144 | 395.945,88 | 134 |

Todos os subtotais de quantidade, valor, número de documentos e quatro colunas monetárias reconciliam com os impressos, sem diferenças. O total misto impresso 13.366,10 não tem unidade física válida.

Bruto 370.304,24 − desconto 0,76 + despesa 3.525,50 = 373.828,98; líquido impresso 395.945,88. Diferença não explicada pelas colunas: 22.116,90. Não atribuímos impostos/frete ou erro sem evidência adicional.

À vista 95.264,80 + a prazo 300.681,08 = 395.945,88. Não há essa classificação por documento exportada. Status não foram tratados como situação de cobrança.

## Simulação e limites

Produtos reais podem ser selecionados do histórico para um cenário, com vendedor selecionável, unidade original, quantidade e preço simulados explícitos. O preço inicia zerado para exigir informação atual do usuário. Cenários são salvos e reabertos numa chave própria de localStorage, sem alterar a versão, a semente ou o conteúdo do armazenamento ERP existente.

O fluxo comercial fica acessível no centro de relatórios existente. Cenários não entram nos KPIs de pedidos fictícios: não há relação produto/documento no PDF, nem preços atuais, dimensões, saldos de estoque, condições de pagamento, parcelas ou contas bancárias. Não são criados pedidos aprovados, logística ou títulos financeiros a partir de inferências. Não foi afirmada conversão SC → KG, inclusive quando o nome contém uma embalagem aparente.

Dados reais são estáticos; edição só nos cenários. Nenhum envio, publicação, commit, push, deploy, migração ou acesso ao banco externo foi executado.

## Integração nas telas principais

- Início: quadro dos 13 vendedores reais, com KG, SC, documentos e valor líquido; botões para os produtos e as vendas de cada vendedor. Indicadores simulados abaixo têm identificação própria.
- Comercial → Vendedores: cadastro comercial de referência dos nomes/códigos encontrados nos PDFs. Não cria usuários/senhas nem atribui regiões por inferência.
- Tabelas → Produtos: abre os produtos reais por vendedor, com acesso à tabela simulada anterior por botão. A faixa antiga de indicadores fictícios foi retirada dessa tela para evitar confundir as duas bases.
- Relatórios → Vendas por período, Vendas por produto e Desempenho por vendedor: abrem na base real. Seletor “Base dos dados” permite voltar aos relatórios simulados. Exportação e prévia usam a base e os filtros selecionados.
- Nos relatórios reais, o filtro de vendedor contém os 13 códigos do TGA. Datas filtram documentos. Quantidades e produtos só aparecem quando o período selecionado cobre integralmente 01–13/11/2026, pois o PDF de produtos não traz data por linha.

## Nomes completos (16/11/2026)

A impressão do TGA corta nomes longos na coluna, mas o texto inteiro está no PDF. O script agora lê também sem o recorte (`TEXT_MEDIABOX_CLIP` desligado) e grava o nome completo em campo próprio, sem trocar o texto impresso:

- `customerFull` em 10 clientes (ex.: C002984 "CARLOS GABRIEL OLYNTHO DE A" → "CARLOS GABRIEL OLYNTHO DE ARRUDA VILLACA"). O fim de nomes longos aparece no PDF depois do número do documento e é reunido ao começo.
- `groupFull` em 3 grupos: PROTEICOS ENERGETICOS, SUPLEMENTO MINERAL, MINERAIS ADENSADOS.

Só há substituição quando o nome completo começa exatamente pelo impresso. Nenhum valor, quantidade, data, série ou status mudou (conferido campo a campo; testes em `tests/demo/historical-sales.test.ts`). As telas usam `customerName()` e `groupName()` de `src/demo/history/sales.ts`.

## Detalhes por clique

- Histórico real → Produtos: a linha abre o produto em todos os vendedores (quantidade, valor, preço médio histórico, página do PDF); cada vendedor leva às vendas dele.
- Histórico real → Vendas gerais: a linha abre o documento (bruto, descontos, despesa, líquido, diferença não detalhada pelo PDF, status, página) e os outros documentos do mesmo cliente.
- Início → Vendedores reais: a linha inteira abre os produtos do vendedor.
- Relatórios (base real): linhas de produto filtram pelo produto; linhas de documento filtram pelo vendedor.
