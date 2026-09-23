begin;

-- VORA 313: garante que o painel administrativo consiga ler os dados
-- de vendedores/produtos/vendas de vendedores sem desligar o RLS.

alter table public.vendedores enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas_vendedor enable row level security;
alter table public.venda_itens enable row level security;
alter table public.comissoes enable row level security;

-- Vendedores: o administrador pode consultar e gerir através do backend.
drop policy if exists vendedores_admin_select on public.vendedores;
create policy vendedores_admin_select on public.vendedores
for select to authenticated
using (public.is_admin() or id = auth.uid());

drop policy if exists vendedores_admin_update on public.vendedores;
create policy vendedores_admin_update on public.vendedores
for update to authenticated
using (public.is_admin() or id = auth.uid())
with check (public.is_admin() or id = auth.uid());

-- Produtos: administrador lê todos, incluindo pendentes/recusados.
drop policy if exists produtos_admin_all on public.produtos;
create policy produtos_admin_all on public.produtos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Faturamento por vendedor.
drop policy if exists vendas_vendedor_admin_select on public.vendas_vendedor;
create policy vendas_vendedor_admin_select on public.vendas_vendedor
for select to authenticated
using (public.is_admin() or uid_vendedor = auth.uid());

-- Itens da venda para auditoria administrativa.
drop policy if exists venda_itens_admin_select on public.venda_itens;
create policy venda_itens_admin_select on public.venda_itens
for select to authenticated
using (public.is_admin() or vendedor_id = auth.uid());

-- Comissões/contabilidade administrativa.
drop policy if exists comissoes_admin_select on public.comissoes;
create policy comissoes_admin_select on public.comissoes
for select to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
commit;
