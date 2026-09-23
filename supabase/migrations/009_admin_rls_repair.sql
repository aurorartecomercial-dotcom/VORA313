begin;

-- VORA 313 — reparação das políticas RLS usadas pelo painel administrativo.
-- Idempotente: pode ser executada mais de uma vez.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and ativo = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- PERFIS
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- VENDEDORES
drop policy if exists vendedores_public_select_active on public.vendedores;
create policy vendedores_public_select_active on public.vendedores
for select to anon, authenticated
using (status = 'aprovado' and ativo = true);

drop policy if exists vendedores_self_or_admin on public.vendedores;
create policy vendedores_self_or_admin on public.vendedores
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists vendedores_update_self_or_admin on public.vendedores;
create policy vendedores_update_self_or_admin on public.vendedores
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists vendedores_insert_self on public.vendedores;
create policy vendedores_insert_self on public.vendedores
for insert to authenticated
with check (id = auth.uid());

-- PRODUTOS
drop policy if exists produtos_public_select on public.produtos;
create policy produtos_public_select on public.produtos
for select to anon, authenticated
using (ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado');

drop policy if exists produtos_admin_all on public.produtos;
create policy produtos_admin_all on public.produtos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.profiles enable row level security;
alter table public.vendedores enable row level security;
alter table public.produtos enable row level security;

notify pgrst, 'reload schema';

commit;
