begin;

-- VORA 313 — reparação final de privilégios/RLS.
-- Objetivo: eliminar 42501/403 causados por grants/policies ausentes e
-- impedir que clientes ou vendedores promovam a própria conta por API direta.

-- Privilégios de tabela necessários ao PostgREST. O RLS continua a decidir
-- quais linhas podem ser lidas/alteradas.
grant usage on schema public to anon, authenticated;
grant select on public.produtos to anon, authenticated;
grant select on public.vendedores to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.clientes to authenticated;
grant select, update, insert, delete on public.produtos to authenticated;
grant select, update on public.vendedores to authenticated;
grant select on public.vendas to authenticated;
grant select on public.venda_itens to authenticated;
grant select on public.comissoes to authenticated;
grant select on public.movimentos_vendedores to authenticated;
grant select on public.vendas_vendedor to authenticated;
grant select on public.destaques_solicitados to authenticated;
grant select on public.levantamentos to authenticated;
grant select on public.cupons to authenticated;
grant select on public.avaliacoes to anon, authenticated;
grant select on public.rastreios_publicos to anon, authenticated;
grant select on public.fidelidade_movimentos to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_seller() to authenticated;

-- A candidatura de vendedor é criada pelo Edge Function com service_role.
-- Não permitir INSERT direto pelo browser, porque o policy antigo aceitava
-- status=aprovado/ativo=true enviado por um utilizador autenticado.
drop policy if exists vendedores_insert_self on public.vendedores;

-- A tabela de vendedores contém telefone/email e dados financeiros.
-- Não existe leitura pública dessa tabela; a vitrine pública usa produtos.
drop policy if exists vendedores_public_select_active on public.vendedores;

-- Gestão administrativa de vendedores/produtos.
drop policy if exists vendedores_admin_select on public.vendedores;
create policy vendedores_admin_select
on public.vendedores for select to authenticated
using (public.is_admin() or id = auth.uid());

drop policy if exists vendedores_admin_update on public.vendedores;
create policy vendedores_admin_update
on public.vendedores for update to authenticated
using (public.is_admin() or id = auth.uid())
with check (public.is_admin() or id = auth.uid());

drop policy if exists produtos_admin_all on public.produtos;
create policy produtos_admin_all
on public.produtos for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Cliente: pontos e histórico só podem ser alterados pelo backend/admin.
-- No INSERT também zeramos esses campos para impedir fraude no primeiro registo.
create or replace function public.protect_cliente_loyalty_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.pontos := 0;
      new.historico := '[]'::jsonb;
    else
      new.pontos := old.pontos;
      new.historico := old.historico;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_cliente_loyalty_fields on public.clientes;
create trigger protect_cliente_loyalty_fields
before insert or update on public.clientes
for each row execute procedure public.protect_cliente_loyalty_fields();

-- Perfis: a policy já limita a própria linha e o trigger 007 protege role/ativo.
-- Vendedores: o trigger 007 protege status/ativo/plano/saldos/contadores.

notify pgrst, 'reload schema';
commit;
