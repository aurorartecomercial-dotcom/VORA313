# VORA 313 — reparar acesso do Admin (RLS)

Os erros `permission denied for table vendedores` e `permission denied for table produtos` indicam que o utilizador autenticado não está a passar pelas políticas RLS administrativas do Supabase.

## 1. Aplicar a reparação

No **Supabase → SQL Editor**, execute:

```sql
-- conteúdo de supabase/migrations/009_admin_rls_repair.sql
```

Ou execute a migration 009 através do fluxo de migrations do projeto.

## 2. Confirmar que a conta é realmente administradora

Substitua o email pelo email usado no painel Admin e execute:

```sql
select p.id, u.email, p.role, p.ativo
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_ADMIN');
```

O resultado precisa mostrar:

- `role = admin`
- `ativo = true`

Se não mostrar, execute:

```sql
update public.profiles
set role = 'admin',
    ativo = true,
    atualizado_em = now()
where id = (
  select id from auth.users
  where lower(email) = lower('SEU_EMAIL_ADMIN')
);
```

Depois saia do Admin e entre novamente para renovar a sessão.

## 3. Erros das Edge Functions

O `supabase-compat.js` foi ajustado para mostrar a mensagem real devolvida pela Edge Function, em vez de esconder o erro atrás de `Edge Function returned a non-2xx status code`.
