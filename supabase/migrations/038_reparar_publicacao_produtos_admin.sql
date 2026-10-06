-- VORA 313 — repara produtos do painel administrativo que existem no banco
-- mas não foram devolvidos pelo catálogo público da V2.
--
-- Escopo intencionalmente limitado: somente produtos sem vendedor. Produtos
-- de vendedores continuam a exigir revisão/aprovação administrativa.
begin;

alter table public.produtos
  alter column status_aprovacao set default 'aprovado',
  alter column ativo set default true,
  alter column vendedor_ativo set default true;

update public.produtos
set
  status_aprovacao = 'aprovado',
  ativo = coalesce(ativo, true),
  vendedor_ativo = true,
  atualizado_em = now()
where vendedor_id is null
  and (
    status_aprovacao is null
    or status_aprovacao <> 'aprovado'
    or ativo is null
    or vendedor_ativo is null
    or vendedor_ativo is false
  );

-- Garante a leitura pública exclusivamente de produtos publicados. A policy
-- não dá escrita a visitantes nem reduz a proteção dos produtos pendentes.
alter table public.produtos enable row level security;
drop policy if exists produtos_public_select on public.produtos;
create policy produtos_public_select on public.produtos
for select to anon, authenticated
using (ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado');

create index if not exists idx_produtos_publicos_v2
  on public.produtos (criado_em desc)
  where ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado';

notify pgrst, 'reload schema';
commit;
