# Contexto do sistema comercial Qualinutri

Use as informações abaixo como contexto sobre o sistema comercial da Qualinutri. Responda sempre em português do Brasil. Quando eu pedir ajuda para usar, explicar, corrigir ou evoluir o sistema, baseie-se nestas regras. Se algo não estiver descrito aqui, diga que não sabe em vez de supor.

## 1. A empresa e o objetivo do sistema

A Qualinutri (Qualinutri Ind. Com. de Nutrição Animal Ltda, Juara/MT) é uma indústria de ração e suplementação animal. Vende principalmente para pecuaristas, fazendas, granjas e revendas da região norte de Mato Grosso.

O sistema é uma ferramenta interna da equipe comercial. Ele serve para:

- montar pedidos com o preço certo, conforme a política comercial;
- salvar, acompanhar e exportar orçamentos;
- manter o cadastro de clientes e das propriedades (fazendas) de cada um;
- registrar e planejar as visitas dos vendedores aos clientes;
- manter atualizadas as tabelas de produtos, descontos e frete, inclusive a partir do PDF da tabela de preços;
- acompanhar vendas e visitas em relatórios.

Ele não emite nota fiscal, não controla estoque e não tem área para o cliente final. Todo o texto da interface é em português do Brasil.

## 2. Vocabulário do negócio

- **Saca:** unidade de venda. Os produtos vêm em sacas de 25, 30 ou 40 kg. Preços, quantidades e frete fracionado são por saca.
- **Tabela de preços:** preço de cada produto para cada prazo de pagamento, em R$ por saca. O preço "à vista" é a base dos descontos.
- **Linha de desconto:** percentual de desconto por linha de produto (ex.: Qualiphós 80, Núcleos, Linha Adense). Incide sobre o preço de tabela, independente do prazo. Existe também a linha "Outro / personalizado", com percentual digitado pelo vendedor.
- **À vista antecipado:** pagamento antecipado, com desconto adicional de 1,5% somado ao desconto da linha. Juntar os dois descontos exige aprovação do gestor comercial e da diretoria; o sistema mostra um aviso.
- **Frete Juara:** tabela por faixa de distância a partir de Juara. Na carga fracionada cobra por saca (valor diferente para 25, 30 e 40 kg); na carga fechada cobra por tonelada.
- **Frete Regional:** tabela por cidade/faixa (Brasnorte, Juína, Aripuanã, Cotriguaçu, Juruena etc.), em R$ por tonelada, com valor para carga fracionada e para carga fechada. Algumas cidades só aceitam carga fechada, com tonelagem mínima.
- **Carga fechada:** uma única entrega, de 10, 18 ou 28 t. **Carga fracionada:** mais de uma entrega no mesmo caminhão.
- **Chapa:** serviço terceirizado de carga e descarga, cobrado à parte por tonelada (valor padrão editável; hoje R$ 40/t). Frete e chapa não têm desconto.
- **Pedido mínimo:** 1 tonelada. **Entrega mínima:** 1.000 kg por cliente.
- **Compra para retirada:** o cliente tem até 6 meses para retirar na fábrica; depois, R$ 1,00 por saca ao mês de armazenagem.

## 3. Perfis de acesso

O login é feito com um **login** (nome de usuário), não com e-mail. Não há cadastro público: só o administrador cria usuários.

- **Administrador:** acesso total. Edita produtos, descontos, frete e chapa, importa o PDF de atualização e gerencia usuários. Pode editar, mudar a situação e cancelar qualquer orçamento.
- **Comercial (vendedor):** usa a Calculadora, salva e acompanha orçamentos, cadastra clientes, registra visitas e vê relatórios. Vê todos os orçamentos, mas só edita, muda a situação e cancela os que ele mesmo criou. Nas visitas e nos relatórios vê só os próprios números.
- **Consulta:** só consulta a Calculadora e as tabelas (produtos, descontos, condições, frete). Não salva orçamento nem acessa clientes, orçamentos, visitas e relatórios.

Usuários novos recebem uma senha temporária e precisam trocá-la no primeiro acesso. Usuário inativo não entra. O sistema impede que o último administrador ativo seja desativado ou rebaixado.

## 4. Páginas do sistema

O menu fica na lateral (no celular, abre por um botão). A ordem é: Calculadora, Orçamentos, Produtos, Clientes, Visitas, Descontos, Condições, Frete, Relatórios, Atualizações e Usuários.

### 4.1 Calculadora

É a tela principal: monta o pedido produto a produto e recalcula tudo na hora.

1. **Cliente (opcional):** escolhido numa lista com busca, entre os clientes cadastrados. O orçamento pode ser salvo sem cliente.
2. **Produto:** escolhe o produto (ou "Informar preço manualmente") e a linha de desconto e informa a quantidade em sacas. Ao escolher o produto, o preço de tabela (na coluna do prazo do orçamento) e o peso da saca são preenchidos; enquanto o prazo não é escolhido, o preço usado é o à vista (base da tabela), para o vendedor ver o total antes de falar da condição. O vendedor pode alterar o preço. No preço manual, o peso da saca (25, 30 ou 40 kg) é obrigatório, para o peso da carga sair certo.
3. **Itens do pedido:** lista dos produtos adicionados, com editar, remover e "Desfazer" logo após remover.
4. **Pagamento:**
   - **Prazo de pagamento do orçamento inteiro** (obrigatório para salvar): vale para todos os produtos. Ao trocar o prazo, os preços que vieram da tabela passam para a coluna do novo prazo; preços digitados à mão não mudam.
   - **Forma do prazo:** quando o prazo tem duas formas ("30/60 ou 45", "30/60/90 ou 60", "30/60/90/120 ou 75", "30/60/90/120/150 ou 90 dd"), o vendedor escolhe **Parcelado** (ex.: 5x em 30/60/90/120/150 dias) ou **Direto** (boleto único em 90 dias). O preço é o mesmo nas duas; a escolha é obrigatória para salvar, para o faturamento saber como cobrar.
   - Pagamento antecipado (+1,5%).

   No PDF, o prazo aparece uma vez, nas condições: "Prazo de pagamento: Parcelado em 5x: 30/60/90/120/150 dias" (ou "Direto: pagamento único em 90 dias", ou "À vista").
5. **Frete e chapa (opcional):** escolhe a tabela (Juara ou Regional), a faixa ou cidade e o tipo de carga (fracionada ou fechada). Cidades sem valor fracionado só permitem carga fechada. A chapa pode ser ligada e ter o valor por tonelada ajustado.
6. **Observações (opcional):** texto livre de até 1.000 caracteres (ex.: previsão de entrega, validade da proposta). Sai no PDF do orçamento, volta para a Calculadora na edição e é copiado ao duplicar.
7. **Resumo:** total do pedido, número de produtos, sacas e peso, subtotal dos produtos, frete, chapa, desconto concedido e chapa média por saca.

**Regras de cálculo, por item:**

- desconto total = desconto da linha + 1,5 (se antecipado);
- preço final da saca = preço de tabela × (1 − desconto total ÷ 100);
- subtotal do produto = preço final × quantidade;
- desconto concedido = (preço de tabela − preço final) × quantidade;
- frete por saca:
  - Juara fracionada: o valor da coluna do peso da saca (25, 30 ou 40 kg). Para outros pesos, converte pela carga fechada.
  - Juara fechada e Regional: valor por tonelada × peso da saca ÷ 1000;
- chapa por saca = valor por tonelada × peso da saca ÷ 1000;
- total do pedido = produtos + frete + chapa.

Ao salvar, o orçamento guarda uma "fotografia" completa: preços, descontos, frete, nomes de produtos e cliente, e as tabelas usadas. Assim, mudanças futuras nas tabelas ou no cadastro do cliente não alteram orçamentos antigos.

Se o sistema não conseguir confirmar com o servidor que os preços estão atualizados, o salvamento fica bloqueado com aviso. O pedido em montagem não se perde ao trocar de página.

### 4.2 Orçamentos

Lista os 50 orçamentos mais recentes, com busca por número e filtro por cliente (ou "Sem cliente vinculado").

**Situações:** Rascunho → Enviado (mandado ao cliente) → Aprovado (venda fechada). Também pode ser Cancelado. As datas de envio, aprovação e cancelamento são registradas pelo servidor.

**Ações:**

- avançar a situação; aprovar pede confirmação;
- editar: só rascunhos e enviados, abre na Calculadora com o mesmo número;
- duplicar: cria um novo rascunho a partir de qualquer orçamento;
- exportar em PDF: documento A4 com logo, dados do cliente, nome do vendedor, itens (com o peso de cada um), condições, totais, observações e, no fim da página, o peso total da carga (soma de sacas × peso da saca, a mesma conta da Calculadora);
- cancelar, com confirmação.

Orçamento aprovado não pode mais ser editado; para refazer, duplica-se. Só o dono do orçamento ou um administrador edita, muda a situação ou cancela.

### 4.3 Produtos

Tabela de preços por prazo de pagamento, separada em rações e minerais/proteinados/núcleos, com busca e data de vigência da tabela. Categorias atuais:

- Rações, Energéticos, Aves e Suínos;
- Mineral, Mineral Adensado e Mineral Aditivado;
- Proteinado (Nutri pasto);
- Núcleos e Concentrados.

O administrador edita nome, peso da saca e preços de cada prazo, e exclui produtos. A exclusão é lógica: o produto sai das listas, mas os orçamentos antigos continuam com ele. Toda alteração de produto e preço fica registrada num histórico com autor e data.

### 4.4 Clientes

Lista dos clientes ativos (cerca de 1.465), com paginação de 15, 30 ou 50 por página. A busca ignora acentos e procura por nome, nome fantasia, código, CPF/CNPJ, telefone ou cidade.

- **Cadastro:**
  - CPF ou CNPJ, validado pelos dígitos verificadores e com pontuação automática. É opcional, mas não pode repetir entre clientes ativos.
  - Nome ou razão social.
  - Telefone/celular, com formato validado.
  - E-mail.
  - Endereço: rua, complemento, bairro, cidade, UF numa lista e CEP com máscara.
- **Ficha do cliente:**
  - dados de cadastro e contato;
  - endereço;
  - propriedades (fazendas), que podem ser criadas, editadas e excluídas;
  - histórico de visitas;
  - orçamentos do cliente.
- **Desativar:** o cliente sai das listas, mas orçamentos e visitas antigos continuam ligados a ele.
- **Clientes importados:** 1.463 clientes vieram de um relatório PDF do sistema antigo, cada um com o **código original**. Eles guardam também os dados extras do cadastro antigo: inscrição estadual/RG, segundo telefone, contato, e-mails, data de nascimento e documento original. Só o administrador altera o código original. Cerca de 51 deles têm CPF/CNPJ inválido ou incompleto no relatório. A lista marca esses casos como "Documento inválido", e a edição mostra o valor original para correção.

### 4.5 Visitas

Agenda de visitas dos vendedores aos clientes, com visão por dia, semana (segunda a domingo) ou mês.

- **Agendar visita:** escolhe vendedor, cliente, propriedade (opcional) e data.
- **Registrar visita:** pode concluir uma agendada ou lançar uma já feita. Informa:
  - data;
  - o que foi feito;
  - tipos da visita: Relacionamento, Prospecção e/ou Fechamento;
  - próxima ação;
  - data de retorno, que cria uma nova visita agendada.

  Na visita de **Fechamento**, vincula-se um orçamento do cliente. Há um atalho "Criar orçamento na Calculadora", e o que já foi preenchido na visita fica guardado para concluir depois.
- **Visita não realizada:** registrada com motivo (cliente não estava, cliente remarcou, emergência do cliente, emergência do vendedor, outro).
- Só visitas ainda não registradas podem ser excluídas ou reagendadas.
- Cada vendedor vê as próprias visitas; o administrador vê as de todos e escolhe o vendedor.

### 4.6 Descontos

Tabela das linhas de desconto e seus percentuais. Exemplos atuais:

- Qualiphós 80: 13%; Qualiphós 40/60: 8%;
- Linha Adense: 6%;
- Qualiphós 130/160: 3%; Linha Top Aditivada: 3%;
- Nutripasto/Nutriengorda: 10%;
- Rações: 0%;
- Núcleos: 12%;
- Outro/personalizado.

O administrador cria, edita e exclui linhas, e a Calculadora passa a usar os novos valores na hora. O desconto de 1,5% do pagamento antecipado é fixo.

### 4.7 Condições

Mostra as modalidades de pagamento:

- à vista antecipado;
- à vista (até 15 dias);
- a prazo: 30; 30/60 ou 45; 30/60/90 ou 60; 30/60/90/120 ou 75; 30/60/90/120/150 ou 90 dias.

Mostra também as regras gerais (pedido mínimo e retirada).

### 4.8 Frete

Mostra e permite ao administrador editar:

- a tabela Juara, por faixa de distância: valor por saca de 25, 30 e 40 kg na fracionada e valor por tonelada na fechada;
- a tabela Regional, por cidade: valor por tonelada na fracionada (vazio quando só há carga fechada) e na fechada;
- o valor da chapa por tonelada.

Toda alteração fica registrada em histórico.

### 4.9 Relatórios

- **Período:** mês atual, mês anterior, últimos 7 dias, últimos 30 dias ou datas escolhidas.
- **Aba Vendas:**
  - considera só orçamentos **aprovados**, pela data de aprovação;
  - indicadores: vendas em produtos (R$), pedidos aprovados e ticket médio;
  - rankings: clientes que mais compraram, produtos que mais saíram, categorias que mais saíram e, só para o administrador, vendedores que mais venderam.
- **Aba Visitação:**
  - visitas por situação;
  - fechamentos: visitas de fechamento e quantas viraram venda aprovada, com o valor;
  - tipos de visita e motivos de não realização;
  - comparativo por vendedor, só para o administrador.
- O vendedor comercial vê só os próprios números nas duas abas.

### 4.10 Atualizações (administrador)

O administrador envia o PDF da tabela de preços da fábrica. O sistema lê o layout fixo do PDF e mostra uma proposta para conferência:

- produtos com preço novo, só nos prazos que mudaram;
- produtos novos no PDF, que podem ser cadastrados após conferir nome, categoria e peso;
- descontos com percentual novo;
- fretes com valores novos;
- produtos cadastrados que não aparecem no PDF (só aviso);
- linhas que o sistema não entendeu.

O administrador marca o que aplicar e confirma. Tudo é gravado de uma vez: se algo falhar, nada é alterado. Orçamentos já salvos não mudam.

### 4.11 Usuários (administrador)

- criar usuário com nome, login, senha temporária, perfil e situação;
- alterar perfil e ativar/desativar, com indicação de alteração não salva;
- redefinir a senha de outro usuário, que volta a exigir troca no próximo acesso;
- remover o próprio acesso de administrador pede confirmação.

## 5. Tecnologia

- **Frontend:** React 19 com TypeScript e Vite. Aplicação de página única, sem rotas por URL: a página ativa é escolhida no menu.
  - Componentes próprios: lista de seleção com busca (substitui o `<select>` do navegador), campo de data, janelas modais, confirmações e avisos.
  - Visual com menu lateral verde, fontes Barlow e Barlow Semi Condensed, adaptado para celular.
- **Backend:** Supabase.
  - **Banco e acesso:** PostgreSQL com RLS (segurança por linha) em todas as tabelas.
  - **Funções no banco (RPC), com validação no servidor:**
    - orçamentos: `create_quote`, `update_quote`, `set_quote_status`;
    - catálogo e frete: `update_product`, `save_discount_rule`, `save_freight_zone`, `apply_catalog_update`;
    - relatórios: `sales_report_data` e `visits_report_data`.
  - **Gatilhos:**
    - validam a aritmética dos orçamentos;
    - controlam o fluxo de situações;
    - registram o autor;
    - impedem CPF/CNPJ repetido entre clientes ativos;
    - protegem o código original dos clientes importados;
    - registram o histórico de produtos, descontos e frete.
  - **Autenticação e Edge Functions:** Supabase Auth com login convertido internamente em e-mail. Funções para criar usuário, trocar a senha inicial e redefinir senha.
- **Hospedagem:** Cloudflare Workers, publicado a partir do GitHub.
- **Qualidade:**
  - testes com Vitest, incluindo testes que fixam as fórmulas da calculadora;
  - `npm run check` roda testes, verificação de tipos, build e uma checagem que impede que a tabela comercial vá para o JavaScript público;
  - o catálogo comercial só é carregado do banco após o login.
- **Banco versionado:** migrations em `supabase/migrations`. Cada migration de regra crítica tem um teste interno que roda com usuários reais e desfaz tudo no fim. Os tipos do banco ficam em `src/types/database.types.ts`.

## 6. Regras de segurança importantes

- Orçamentos e itens não podem ser gravados direto nas tabelas, só pelas funções do banco, que conferem perfil, dono e situação.
- O banco confere se preços, descontos, subtotais e totais de cada orçamento batem entre si. O preço manual é permitido, mas a conta precisa fechar.
- Nenhuma chave secreta fica no navegador.
- Comercial só vê as próprias visitas e os próprios números nos relatórios. Clientes e orçamentos são compartilhados entre todos os comerciais.

## 7. Dados atuais (ordem de grandeza)

- cerca de 1.465 clientes ativos;
- cerca de 50 produtos ativos, em sacas de 25, 30 e 40 kg;
- 7 prazos de pagamento;
- 9 linhas de desconto;
- 6 faixas de frete Juara e 10 cidades/faixas Regionais;
- cerca de 20 usuários.

Os valores de preços, descontos e frete citados aqui são exemplos e mudam com as tabelas vigentes. Os valores oficiais são os que estão no sistema.
