-- VORA 313 — recuperação segura do catálogo e das vitrines públicas.
-- Execute depois das migrations existentes. É idempotente e não altera dados.
begin;

alter table public.produtos enable row level security;

-- O vendedor precisa de listar os próprios produtos pendentes, aprovados e
-- recusados na sua Central. Visitantes continuam a ver apenas o catálogo
-- público pela policy própria já existente.
drop policy if exists produtos_vendedor_select_proprio on public.produtos;
create policy produtos_vendedor_select_proprio on public.produtos
for select to authenticated
using (vendedor_id = auth.uid());

-- A vitrine não lê a tabela privada de vendedores: expõe somente os campos
-- públicos necessários para nome, logótipo, contacto e apresentação da loja.
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
with (security_barrier = true)
as
select
  id,
  nome_loja,
  telefone,
  categoria,
  descricao,
  perfil_publico,
  total_vendas,
  total_produtos,
  criado_em
from public.vendedores
where status = 'aprovado' and ativo = true;

revoke all on public.lojas_publicas from public;
grant select on public.lojas_publicas to anon, authenticated;

notify pgrst, 'reload schema';
commit;
