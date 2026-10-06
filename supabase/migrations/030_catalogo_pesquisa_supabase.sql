-- VORA 313 — pesquisa e filtros do catálogo no Supabase.
-- Não altera pedidos, pagamentos ou dados privados. A função usa a mesma RLS
-- pública dos produtos e devolve apenas campos destinados ao catálogo.
begin;

create extension if not exists pg_trgm;

create index if not exists idx_produtos_publicados_categoria_preco
  on public.produtos (categoria, preco_valor)
  where ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado';

create index if not exists idx_produtos_publicados_vendedor
  on public.produtos (vendedor_id, preco_valor)
  where ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado';

create index if not exists idx_produtos_publicados_criado
  on public.produtos (criado_em desc)
  where ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado';

create index if not exists idx_produtos_nome_trgm
  on public.produtos using gin (nome gin_trgm_ops);
create index if not exists idx_produtos_descricao_trgm
  on public.produtos using gin (descricao gin_trgm_ops);
create index if not exists idx_produtos_categoria_trgm
  on public.produtos using gin (categoria gin_trgm_ops);
create index if not exists idx_produtos_vendedor_nome_trgm
  on public.produtos using gin (vendedor_nome gin_trgm_ops);
create index if not exists idx_produtos_tag_trgm
  on public.produtos using gin (tag gin_trgm_ops);
create index if not exists idx_produtos_marca_trgm
  on public.produtos using gin (marca gin_trgm_ops);

create index if not exists idx_produtos_busca_fts
  on public.produtos using gin (
    to_tsvector('simple', coalesce(nome,'') || ' ' || coalesce(descricao,'') || ' ' ||
      coalesce(categoria,'') || ' ' || coalesce(vendedor_nome,'') || ' ' ||
      coalesce(tag,'') || ' ' || coalesce(marca,''))
  );

create or replace function public.buscar_catalogo_publico(
  p_busca text default '',
  p_categoria text default '',
  p_preco_min numeric default null,
  p_preco_max numeric default null,
  p_vendedor_id uuid default null,
  p_disponibilidade text default 'todos',
  p_min_avaliacao numeric default 0,
  p_data_dias integer default 0,
  p_ordenacao text default 'relevancia',
  p_limite integer default 20,
  p_offset integer default 0
)
returns table (
  id text,
  ordem integer,
  nome text,
  categoria text,
  preco text,
  preco_valor numeric,
  preco_antigo text,
  desconto text,
  parcelas text,
  frete_gratis boolean,
  descricao text,
  imagens jsonb,
  marca text,
  sku text,
  tag text,
  estoque integer,
  vendedor_id uuid,
  vendedor_nome text,
  monetizacao jsonb,
  criado_em timestamptz,
  atualizado_em timestamptz,
  avaliacao_media numeric,
  avaliacao_total integer,
  total_resultados bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      p.*,
      coalesce(r.media, 0)::numeric as _avaliacao_media,
      coalesce(r.total, 0)::integer as _avaliacao_total,
      to_tsvector('simple', coalesce(p.nome,'') || ' ' || coalesce(p.descricao,'') || ' ' ||
        coalesce(p.categoria,'') || ' ' || coalesce(p.vendedor_nome,'') || ' ' ||
        coalesce(p.tag,'') || ' ' || coalesce(p.marca,'')) as _busca_vector
    from public.produtos p
    left join public.produto_avaliacoes_resumo r on r.produto_id = p.id
    where p.ativo = true
      and p.vendedor_ativo = true
      and p.status_aprovacao = 'aprovado'
      and (nullif(trim(p_categoria), '') is null or p.categoria = trim(p_categoria))
      and (p_preco_min is null or p.preco_valor >= greatest(p_preco_min, 0))
      and (p_preco_max is null or p.preco_valor <= greatest(p_preco_max, 0))
      and (p_vendedor_id is null or p.vendedor_id = p_vendedor_id)
      and (
        lower(coalesce(p_disponibilidade, 'todos')) = 'todos'
        or (lower(p_disponibilidade) = 'disponivel' and p.estoque > 0)
        or (lower(p_disponibilidade) = 'esgotado' and p.estoque <= 0)
      )
      and (coalesce(p_min_avaliacao, 0) <= 0 or coalesce(r.media, 0) >= p_min_avaliacao)
      and (coalesce(p_data_dias, 0) <= 0 or p.criado_em >= now() - make_interval(days => least(greatest(p_data_dias, 0), 3650)))
      and (
        nullif(trim(p_busca), '') is null
        or to_tsvector('simple', coalesce(p.nome,'') || ' ' || coalesce(p.descricao,'') || ' ' ||
          coalesce(p.categoria,'') || ' ' || coalesce(p.vendedor_nome,'') || ' ' ||
          coalesce(p.tag,'') || ' ' || coalesce(p.marca,'')) @@ websearch_to_tsquery('simple', trim(p_busca))
        or p.nome ilike '%' || trim(p_busca) || '%'
        or p.descricao ilike '%' || trim(p_busca) || '%'
        or p.categoria ilike '%' || trim(p_busca) || '%'
        or p.vendedor_nome ilike '%' || trim(p_busca) || '%'
        or p.tag ilike '%' || trim(p_busca) || '%'
        or p.marca ilike '%' || trim(p_busca) || '%'
      )
  ), filtrado as (
    select
      base.*,
      count(*) over() as _total,
      case
        when nullif(trim(p_busca), '') is null then 0::real
        else ts_rank(base._busca_vector, websearch_to_tsquery('simple', trim(p_busca)))
      end as _relevancia
    from base
  )
  select
    f.id, f.ordem, f.nome, f.categoria, f.preco, f.preco_valor, f.preco_antigo,
    f.desconto, f.parcelas, f.frete_gratis, f.descricao, f.imagens, f.marca, f.sku,
    f.tag, f.estoque, f.vendedor_id, f.vendedor_nome, f.monetizacao, f.criado_em,
    f.atualizado_em, f._avaliacao_media, f._avaliacao_total, f._total
  from filtrado f
  order by
    case when p_ordenacao = 'relevancia' then f._relevancia end desc nulls last,
    case when p_ordenacao = 'preco-asc' then f.preco_valor end asc nulls last,
    case when p_ordenacao = 'preco-desc' then f.preco_valor end desc nulls last,
    case when p_ordenacao = 'melhor-avaliacao' then f._avaliacao_media end desc nulls last,
    case when p_ordenacao = 'mais-recentes' then extract(epoch from f.criado_em) end desc nulls last,
    case when p_ordenacao = 'ordem' then f.ordem end asc nulls last,
    f.criado_em desc,
    f.id asc
  limit least(greatest(coalesce(p_limite, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.buscar_catalogo_publico(text, text, numeric, numeric, uuid, text, numeric, integer, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.buscar_catalogo_publico(text, text, numeric, numeric, uuid, text, numeric, integer, text, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
