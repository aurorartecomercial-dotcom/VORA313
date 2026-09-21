# Configuração do primeiro administrador

O login do Admin usa **Supabase Auth**. A palavra-passe nunca fica gravada no código.

## 1. Criar/confirmar a conta

No Supabase:
**Authentication → Users**

Confirme que existe a conta de administrador com o email desejado. Se ainda não existir, crie/invite o utilizador e defina uma palavra-passe.

> Uma migração do Firebase não consegue transportar as palavras-passe antigas. Por isso, a conta migrada precisa de uma nova palavra-passe no Supabase.

## 2. Dar permissão de administrador

Depois de a conta existir no Auth, abra **SQL Editor** e execute, trocando o email:

```sql
update public.profiles
set role = 'admin',
    ativo = true,
    atualizado_em = now()
where id = (
  select id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_ADMIN')
);
```

Para confirmar:

```sql
select p.id, u.email, p.role, p.ativo
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_ADMIN');
```

O resultado deve mostrar `role = admin` e `ativo = true`.

## 3. Migrations

Execute as migrations na ordem indicada em `supabase/README.md`, incluindo:

- `006_produtos_admin_fields.sql`
- `007_security_hardening.sql`

Se as migrations anteriores já foram aplicadas no teu projeto, execute apenas as que ainda faltarem.

## 4. Se esquecer a palavra-passe

Na página `admin.html`, informe o email e clique em **Esqueci a palavra-passe**.

O Supabase enviará um link. O link volta para o próprio Admin, onde será possível definir a nova palavra-passe.

No painel Supabase, **Authentication → URL Configuration**, o domínio onde o site está hospedado deve estar em **Redirect URLs**. Para GitHub Pages, adicione a URL completa da página `admin.html`.

## 5. Importante

Não coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend, no `.env` publicado ou no GitHub. A chave `anon/publishable` do `js/supabase-config.js` é pública por natureza; a proteção real vem do RLS e do backend privilegiado.
