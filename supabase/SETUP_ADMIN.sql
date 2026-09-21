-- VORA 313 — configurar o primeiro administrador
-- 1) Crie/convide o utilizador em Authentication > Users.
-- 2) Substitua SEU_EMAIL_ADMIN pelo email real.
-- 3) Execute este script no SQL Editor.

update public.profiles
set role = 'admin',
    ativo = true,
    atualizado_em = now()
where id = (
  select id from auth.users
  where lower(email) = lower('SEU_EMAIL_ADMIN')
);

select p.id, u.email, p.role, p.ativo
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_ADMIN');
