# Cópia do Qualinutri

Esta pasta contém a aplicação atual, suas páginas, regras de negócio, funções do Supabase, migrations, testes e recursos. O nome do Worker e o identificador local do Supabase foram alterados para `qualinutri-demo`, evitando que um deploy desta pasta substitua o Worker principal.

O arquivo `.env.local` foi copiado para permitir executar a aplicação imediatamente. **Ele ainda aponta para o mesmo projeto Supabase usado pelo sistema principal.** Cadastros e outras alterações feitas pela demo afetarão os dados em uso. Antes de testar gravações isoladamente, configure um projeto Supabase separado e substitua os valores de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.local`.

O token administrativo `.env.supabase-cli` e o vínculo remoto em `supabase/.temp` não foram copiados. A pasta também não herdou o repositório Git do projeto principal.

Para executar: `npm run dev`. Para verificar: `npm run check`.
