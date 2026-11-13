# Importação do relatório de clientes de 03/11/2026

O PDF original foi processado fora do repositório. Nenhum cadastro pessoal foi versionado no Git.

- Registros identificados pelo código do relatório: **1.463**; todos foram importados com `legacy_code` distinto.
- Cadastros anteriores preservados: **2**; total no banco após a importação: **1.465**.
- Documentos validados pelo mesmo algoritmo do cadastro: **1.412** (1.306 CPF e 106 CNPJ).
- Documentos ausentes, incompletos ou inválidos: **51**. O valor original permanece em `legacy_details.document_raw`; `document` fica vazio até correção.
- Há **26 ocorrências adicionais de documentos válidos repetidos**. Cada código do relatório permanece como cadastro separado.
- Endereços importados: **1.463**. Telefone principal: **1.221**; segundo telefone: **415**; contato: **308**; e-mail principal reconhecido: **378**. Os valores originais, inclusive e-mails adicionais, ficam em `legacy_details`.

O endereço usa `customers.address` com rua, complemento, bairro, cidade, UF e CEP. `legacy_details` guarda inscrição estadual/RG, órgão expedidor, telefones adicionais, fax, data de nascimento, nome do contato, e-mails do PDF e documento original. A ficha do cliente mostra esses campos e o código original. A lista é buscada em páginas de 500 para ultrapassar o limite padrão da API.

Os 51 documentos pendentes exigem conferência humana para se tornarem CPF/CNPJ validado. O código original permite localizar a linha correspondente no PDF.

## Revisão das viradas de página

Uma segunda extração percorreu as linhas do PDF em sequência, mantendo o cliente aberto quando a linha de contato continuava na página seguinte. Ela identificou **117 campos vazios em 49 clientes** na primeira importação; todos foram completados no banco. Os demais campos já preenchidos coincidiam com o PDF, sem troca entre clientes. Depois da correção, os **1.463 registros** foram comparados campo a campo com o PDF: nomes, documento original, endereço, telefones, fax, contato, nascimento e e-mail, com **zero divergências**.

## Auditoria complementar

As 118 páginas foram lidas novamente por duas bibliotecas independentes. Ambas identificaram exatamente os mesmos **1.463 códigos únicos**, em acordo com o total impresso no relatório. A leitura estrutural encontrou 1.463 linhas de identificação, 1.463 linhas de endereço e 50 linhas que continuavam na página seguinte. Nenhum trecho de dados ficou fora das colunas mapeadas ou sem cliente associado.

Uma nova comparação entre o PDF e o banco verificou todos os campos originais e os campos apresentados na ficha, registro por registro: **zero divergências**. Permanecem problemas no arquivo de origem que não podem ser corrigidos por comparação: 51 documentos ausentes, incompletos ou inválidos; 10 textos de e-mail sem endereço reconhecível; um CEP fora do formato; um endereço preenchido com zeros; e 11 nomes que atingem o limite de 60 caracteres do relatório (possível truncamento). Todos os textos originais foram preservados para conferência.
