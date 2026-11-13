# Qualinutri — Calculadora & Política Comercial

Aplicação interna para consulta da política comercial, cálculo de pedidos e gestão de clientes e orçamentos. A migração preserva o comportamento do sistema legado e separa interface, domínio financeiro e persistência.

## Tecnologias

- React 19, TypeScript e Vite;
- Vitest para testes de caracterização;
- Supabase Auth, Postgres e Row Level Security;
- migrations SQL versionadas em `supabase/migrations`.

## Configuração local

Requisito: Node.js compatível com Vite 8.

```bash
npm ci
npm run dev
```

A demonstração abre direto na calculadora e usa um catálogo fictício. Ela funciona sem configurar Supabase. As telas disponíveis são a calculadora e as consultas de produtos, descontos, condições e frete.

## Verificação

```bash
npm run check
```

Esse comando executa os testes, a verificação TypeScript, o build de produção e uma checagem para impedir que o catálogo comercial de referência apareça no JavaScript público. As fórmulas financeiras são protegidas por testes em `tests/characterization`.

## Deploy na Cloudflare

O sistema é publicado como site estático em **Cloudflare Workers**, com deploy automático a cada envio para o GitHub. A configuração fica em `wrangler.jsonc`, e os cabeçalhos de segurança e de cache em `public/_headers`.

### Primeira configuração

1. Crie um repositório no GitHub e envie o projeto. `.env.local`, `.env.supabase-cli` e as pastas locais já estão no `.gitignore`.
2. No painel da Cloudflare, abra **Workers & Pages → Create → Import a repository** e escolha o repositório.
3. Confira as opções de build:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/`
4. Salve e rode o primeiro deploy. O endereço fica no formato `https://qualinutri-demo.<sua-conta>.workers.dev`.

Depois disso, cada envio para a branch principal gera um novo deploy. Um domínio próprio pode ser ligado em **Settings → Domains & Routes**, sem mudanças no código.

### Comandos locais

```bash
npm run preview:cloudflare   # compila e serve localmente com o mesmo motor da Cloudflare
npm run deploy               # compila e publica direto pelo terminal (exige npx wrangler login)
```

A versão do Node usada no build está em `.node-version`.

## Supabase

Para operações da CLI, copie `.env.supabase-cli.example` para `.env.supabase-cli`, informe um token com escopo para este projeto e restrinja o arquivo ao usuário local:

```bash
chmod 600 .env.local .env.supabase-cli
npm run db:push:dry
npm run db:lint
```

Scripts disponíveis:

- `npm run db:push`: aplica migrations pendentes no projeto vinculado;
- `npm run db:types`: regenera os tipos TypeScript do schema remoto;
- `npm run db:seed:generate`: regenera `supabase/seed.sql` a partir do snapshot comercial versionado.

## Referências

- `src/data/commercial-snapshot.json`: snapshot versionado dos dados extraídos do sistema legado;
- `src/ARCHITECTURE.md`: organização da aplicação;
- `docs/supabase-data-model.md`: modelagem e decisões do banco;
- `tests/characterization/README.md`: regras atuais preservadas e inconsistências conhecidas.

### GitHub Pages da demonstração

O workflow `.github/workflows/pages.yml` publica a branch `main` em
https://ragcode-br.github.io/qualinutri-demo/.
O build usa a base `/qualinutri-demo/`, executa os testes e verifica que o
catálogo comercial de referência não está no JavaScript público.
A demonstração usa dados fictícios e persistência local do navegador; não
é necessário configurar credenciais do Supabase no GitHub.
