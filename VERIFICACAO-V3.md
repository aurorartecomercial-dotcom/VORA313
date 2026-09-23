# VORA 313 — V3 verificada

## Correções desta versão

### Painel de vendedores
- `admin-vendedores.js` continua a usar a Edge Function `listarVendedoresAdmin` para leitura administrativa.
- O cliente agora tenta ler o corpo JSON devolvido por uma Edge Function que responde 4xx, para mostrar a mensagem real do backend em vez de apenas `Edge Function returned a non-2xx status code`.
- O painel mostra `A carregar...` durante a consulta e não apresenta `0 vendedores` como se fosse resultado real quando a consulta falha.
- Cache-busting atualizado para `admin-vendedores.js?v=20260923-04`.

### Cadastro de outro vendedor
- O formulário anterior herdava automaticamente a sessão já aberta.
- O e-mail ficava `readonly` e a palavra-passe desaparecia.
- Isso impedia criar uma segunda conta com outro e-mail.
- Agora, quando existe uma sessão, o formulário mostra claramente a conta atual e o botão `Usar outro e-mail`.
- Esse botão encerra a sessão atual, limpa apenas os campos de autenticação e reativa e-mail + palavra-passe para criar uma nova conta.
- Os restantes dados da candidatura não são apagados ao trocar de conta.

### Verificações
- Todos os ficheiros JavaScript passam `node --check`.
- A Edge Function contém `listarVendedoresAdmin` e `gerirVendedor`.
- A tabela `vendedores` no schema inclui a coluna `uid`, portanto a seleção administrativa usada pela função é compatível com o schema versionado.

## IMPORTANTE — implantação

Esta versão do frontend **não pode, sozinha, corrigir uma Edge Function antiga que já esteja publicada no Supabase**.

Depois de colocar estes ficheiros no GitHub Pages, publique também a Edge Function `api` com o conteúdo de:

`supabase/functions/api/index.ts`

Com Supabase CLI:

```bash
supabase functions deploy api
```

A migration de RLS anterior continua a ser necessária se ainda não foi aplicada:

`supabase/migrations/010_security_rls_repair.sql`

Depois faça um hard refresh no navegador.
