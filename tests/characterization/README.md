# Testes de caracterização

Esta suíte registra o comportamento observado no sistema original antes da migração para React. Os dados comerciais de referência ficam em `src/data/commercial-snapshot.json`, sem dependência de execução do HTML legado.

Os testes não representam necessariamente as regras comerciais desejadas. Alguns casos preservam deliberadamente comportamentos questionáveis para que futuras alterações sejam explícitas e aprovadas.

## Comportamentos protegidos

- desconto de linha somado diretamente ao desconto antecipado de 1,5%;
- ausência de arredondamento financeiro intermediário;
- múltiplos itens e pesos diferentes;
- frete Juara fracionado e fechado;
- fallback de peso diferente de 25, 30 e 40 kg;
- frete Regional fracionado e fechado;
- tarifa indisponível representada por frete zero e aviso;
- chapa calculada pelo peso da saca;
- total geral como produto mais frete e chapa;
- preço manual;
- dados e ordem das tabelas fixas do HTML.

## Lacunas atuais caracterizadas sem correção

- pedido abaixo de uma tonelada é aceito;
- carga fechada abaixo das tonelagens declaradas é aceita;
- mínimos regionais não são validados;
- chapa pode ser usada em carga fracionada;
- desconto personalizado acima de 100% pode gerar subtotal negativo;
- combinação de descontos apenas mostra aviso.

Execute com:

```bash
npm test
```
