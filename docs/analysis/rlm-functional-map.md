# Integração nutricional à demonstração Qualinutri

## Alvo e evidências

O alvo fornecido é o RLM.exe do instalador RLM 3.3.113, PE32 x86. SHA-256 verificado pelo REA `458a8f59c0da234f8d653317447bb0f64afdda41de0727f19618af7545c441b4`.

O REA inventariou 1.133 recursos PE, incluindo formulários de formulação, comparação, misturadores e relatórios de corte, leite, concentrados, análise financeira e séries NDT. Evidência `ev_eac93f3839ac45b217759235ab1b098637f2ddd0b9b93cad9c0b291d491ba786`. A identificação do alvo também foi confirmada com `open_binary`.

O manual incluído no instalador se identifica como 3.3.71. As referências abaixo são linhas do arquivo local `/Users/rei/Documents/Codex/2026-11-13/eu/work/RLM_PTB.txt`. Diferenças entre essa documentação e o executável permanecem possíveis.

A sessão REA não tem Ghidra, Hopper ou IDA configurado para descompilar funções. As equações internas de previsão biológica e a equivalência numérica com o programa em execução continuam sem verificação. O módulo usa cálculos independentes e explicita consumo, ganho e produção informados pelo usuário.

## Cobertura funcional

| Área documentada | Implementação na demo | Referência no manual |
|---|---|---|
| Bibliotecas e alimentos | Cadastro, busca, custo, MS, análises, comparação de dois alimentos, nutrientes personalizados | 1489–1735 |
| Clientes e lotes | Vínculo com clientes existentes e identificação do lote | 1980–2057 |
| Tipos de formulação | Corte, leite, concentrado e exigências informadas, com base natural ou seca | 2009–2043 |
| Avaliação manual | Composição ponderada por MS, conversão de bases, kg/lote e kg/cabeça/dia, compra do período, custos | 2396–2486 e 2954–3026 |
| Formulação de menor custo | Solver linear no navegador, limites de ingredientes e nutrientes, verificação de resíduos e inviabilidade | 749–755 e 2544–2605 |
| Misturadores | Três estágios, transferência 3→2→1, capacidades, pesos calculados/ajustados, peso acumulado e aplicação explícita à fórmula | 3053–3195 |
| Relatórios | Técnico, cliente e ficha operacional, impressão/PDF, CSV e JSON da formulação | 3247–3388 |
| Análises econômicas | Custos e margem com ganho/produção/preço informados. Cenários discretos de preços e mínimos nutricionais | 3400–3522 |
| Importação | R3A, R3F e XML DATAPACKET, limites, descompressão, CRC, metadados e consulta dos resultados de origem | 3824–3862 e 4224–4294 |
| Produção | Conversão para percentuais naturais, conferência de insumos, snapshot da fórmula na ordem e baixa ao concluir | Integração própria com o ERP da demo |

## Unidades e procedência

As composições padrão são concentrações na matéria seca. Matéria seca do alimento é percentual da matéria natural, e preço é R$/kg natural. Valores fictícios iniciam a biblioteca. As bibliotecas reais são carregadas por seleção explícita de arquivos locais e mantêm a origem.

Importações com dicionário ausente ou parcial exigem seleção explícita de um dicionário compatível para completar a composição. Valores relativos a PB, FDN ou outras bases não são tratados como concentrações na MS. Campos incompatíveis permanecem na consulta original. Preço ausente fica identificado como pendente.

A proteína bruta equivalente de alimentos nitrogenados pode ultrapassar 100% MS. Esses valores são preservados. A otimização exige uma análise para cada nutriente restringido em todos os ingredientes potencialmente usados.

O objetivo linear permite minimizar custo por kg natural para fabricação ou por kg de MS para um consumo de MS fixo. A conversão de base não mantém limites percentuais antigos. O usuário configura limites na nova base.

## Funcionalidades ainda sem equivalência verificada

- Exigências automáticas e previsões de consumo, crescimento, gestação, lactação, reservas corporais e desempenho dos modelos NRC Tropicalizado, leite e NASEM.
- Lucro máximo condicionado ao modelo biológico, séries NDT com ganho previsto e preços exatos de inclusão/exclusão.
- Metano, carbono e excreções com as equações internas do RLM.
- Exportação compatível com o formato binário R3A/R3F e formatos DOC/XLS do programa original.
- Organização completa das pastas do RLM e todas as suas opções avançadas de relatórios.

Esses itens dependem de evidência adicional das funções nativas ou de casos de referência executados em uma instalação licenciada. Resultados gravados em arquivos importados são apresentados como resultados de origem.

## Verificações

Os testes do domínio cobrem balanço de massas, bases, custos, composição ausente, inviabilidade, limites, cenários e misturadores. Os testes de produção conferem snapshot, ausência de baixa no planejamento e rejeição de falta de estoque no fechamento.

O parser foi exercitado no Chrome com bibliotecas Alimentos 2024 e NASEM, dietas Corte e Leite e exemplos incluídos no instalador. Arquivos com CRC alterado foram rejeitados. Os artefatos binários e bases do RLM não foram incluídos no repositório.
