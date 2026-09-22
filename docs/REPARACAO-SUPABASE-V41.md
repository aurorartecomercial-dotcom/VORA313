# VORA 313 — Reparação Supabase V41

## Sintomas tratados

1. `Could not find the 'ordem' column of 'produtos' in the schema cache`.
2. Produtos pendentes/rascunhos a aparecerem publicamente.
3. Produtos aprovados não aparecerem na página inicial quando a tabela Supabase está vazia ou com cache antigo.
4. Conta de vendedor a usar `uid` do Firebase num utilizador Supabase.
5. Erro genérico `Failed to send a request to the Edge Function`.
6. Configuração `verify_jwt` colocada no local errado.

## Ordem de aplicação

No Supabase SQL Editor, execute primeiro as migrations 001→007 que ainda não tenham sido executadas e, por último:

`supabase/migrations/008_vora313_schema_repair.sql`

Se as migrations 001→007 já estiverem aplicadas, execute apenas a 008.

Depois publique a função:

`supabase functions deploy api`

A configuração da função agora fica em `supabase/config.toml`.

## Verificação rápida do banco

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'produtos'
order by ordinal_position;
```

A coluna `ordem` precisa aparecer.

## Verificação de publicação

Um produto só aparece no catálogo público quando:

- `ativo = true`
- `vendedor_ativo = true`
- `status_aprovacao = 'aprovado'`

Produtos de vendedores continuam a ser criados como `aguardando_aprovacao` e `ativo = false`.

## Vendedor

Para criar a loja:

1. O utilizador cria a conta em Authentication.
2. A sessão precisa existir.
3. O frontend chama `solicitarVendedor`.
4. O vendedor fica `pendente`.
5. O admin aprova.
6. Só depois o vendedor recebe acesso à área de produtos.

Se a confirmação de email estiver ativa, confirme o email e faça login antes de enviar a candidatura.

## Edge Function

O frontend envia o JWT da sessão. A função `api` valida o utilizador e usa service-role somente no backend.

Se ainda aparecer `Failed to send a request to the Edge Function`, abra Supabase → Edge Functions → `api` → Logs/Invocations e veja o erro real. A mensagem do navegador pode ser genérica para falhas 404/401/503.
