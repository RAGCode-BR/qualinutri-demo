# Teste de formulação para Daniel — 14/11/2026

## Onde testar

Na demo local: **Operação → Nutrição e formulação → Formulações → Criar fórmula de teste**.

O botão cria uma fórmula salva e três alimentos próprios, com dados fictícios. Não altera os alimentos existentes, o banco de produção ou o GitHub. Os dados ficam neste navegador. Para transportar o caso para outro computador, use **Exportar formulação** e **Importar formulação** na demo.

## Caso reproduzível

Tipo: concentrado e suplemento. Inclusões na matéria natural; menor custo por kg natural. Mistura de 1.000 kg, consumo informado de 10 kg MS/cabeça/dia, 20 animais e 30 dias. Esses parâmetros são apenas para conferir o funcionamento, sem recomendação de alimentação.

| Alimento | Inclusão MN | MS | Preço R$/kg MN | PB na MS | Mín. inclusão MN | Máx. inclusão MN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Milho em grão | 70% | 88% | 1,12 | 9% | 0% | 90% |
| Farelo de soja | 28% | 89% | 2,31 | 48% | 0% | 60% |
| Premix mineral | 2% | 98% | 6,90 | 0% | 2% | 2% |

Limite de proteína bruta: **18 a 24% na matéria seca**. Os outros nutrientes presentes no cadastro de teste não possuem restrições neste caso. Se o RLM solicitar preço por tonelada natural, os preços equivalentes são R$1.120, R$2.310 e R$6.900, respectivamente.

## Passo a passo na demo

1. Criar a fórmula de teste. A avaliação aparece ao editar, sem exigir um botão de cálculo.
2. Conferir a mistura inicial: **700 kg de milho + 280 kg de soja + 20 kg de premix**, custo **R$1.568,80**, MS **88,48%**, PB **19,784810% MS**.
3. Clicar em **Otimizar menor custo**. O sistema muda as inclusões respeitando os limites, sem alterar as análises dos alimentos.
4. Conferir o resultado abaixo, salvar e recarregar. Selecionar a fórmula salva para confirmar persistência.
5. Em **Misturadores**, ajustar a divisão/pesagens e conferir os acumulados. Alterações só voltam para a composição ao clicar em **Aplicar pesagens à fórmula**.
6. Em **Relatórios e produção**, imprimir relatório técnico ou ficha operacional; o navegador permite salvar como PDF.
7. Para exercitar a integração local, escolher um produto sem ordem aberta e gerar uma ordem de uma saca. O peso da saca vem do cadastro do produto. Na produção, iniciar e concluir a ordem; a baixa deve seguir a composição registrada na ordem.

| Resultado após otimizar | Valor esperado |
| --- | ---: |
| Milho MN | 74,56152513% / 745,6152513 kg |
| Soja MN | 23,43847487% / 234,3847487 kg |
| Premix MN | 2% / 20 kg |
| Total natural | 1.000 kg |
| MS da mistura | 88,43438475% |
| Proteína bruta | 18% MS |
| Custo por mistura/t natural | R$1.514,51785095 |
| Economia por mistura | R$54,28214905 |

O resultado também pode ser conferido algebricamente: se `s` é a inclusão percentual natural de soja, `(776,16 + 34,8*s)/(88,2 + 0,01*s) = 18`, logo `s = 811,44/34,62`. Como o milho é mais barato e o premix está fixo, o menor custo ocorre no mínimo de PB.

## Casos de revisão

- **Inclusão fora do limite:** manter milho em 74,561525% e reduzir seu máximo para 10%. Deve aparecer **Em revisão** e **Fora do limite** na avaliação e no relatório técnico. A ficha de pesagem e a produção devem ser bloqueadas. Salvar para revisão continua permitido.
- **Problema inviável:** com milho máximo10%, soja máximo60% e premix fixo2%, não é possível fechar100%. Otimizar deve informar inviabilidade e preservar a composição anterior.
- **Análise ausente:** um nutriente limitado sem análise em qualquer alimento incluído deve continuar visível como análise incompleta, nunca como zero ou como atendido.
- **Troca de tipo:** preencher leite20kg×R$2,50; mudar para corte e preencher ganho1,2kg×R$10. A receita deve ser **R$12/cabeça/dia**, sem somar os R$50 do leite oculto.

## O que foi e o que ainda não foi comprovado

Este caso verifica cálculo de mistura, conversão MN/MS, custo mínimo linear com exigências informadas, persistência, relatório e integração com a produção **da demo local**. Os testes automatizados usam dados locais isolados.

Validação em 14/11: `npm run check` passou com205 testes e compilação. No navegador isolado foram conferidos o botão de teste, digitação de10,5, otimização, persistência após recarregar, os dois relatórios de revisão (inclusão e análise ausente), bloqueio da ficha operacional, troca leite→corte com receita corrigida e uma ordem de1saca de40kg. Criar a ordem não baixou o estoque; concluir baixou os três insumos conforme a composição registrada e acrescentou1saca ao estoque acabado. Não houve erro JavaScript nesse fluxo.

**Não é uma validação de equivalência completa ao RLM.** A identificação do RLM3.3.113 foi confirmada pelo REA no executável instalado. No Mac, o processo iniciou pelo Wine e abriu seu banco, mas não ficou disponível como alvo de interface para preencher e calcular. A outra rota instalada, CrossOver, exibiu teste expirado. O usuário confirmou que Daniel usa o RLM no Windows. A execução deste mesmo caso no RLM/Windows e a comparação dos resultados permanecem pendentes.

Os modelos automáticos de exigências/consumo/desempenho de corte e leite, máximo lucro biológico, NDT e sensibilidade específica do RLM não foram reconstruídos nem validados por este teste. Selecionar corte/leite na demo guarda o contexto e os valores informados; não executa esses modelos. A aba **Arquivos RLM** importa/consulta dados existentes e não substitui o editor de formulação.
