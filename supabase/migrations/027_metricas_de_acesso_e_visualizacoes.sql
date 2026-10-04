-- VORA 313 — métricas de acessos e visualizações sem dados pessoais.
-- Execute depois das migrations 016 e 026. O navegador envia apenas um
-- identificador aleatório; a API guarda somente o hash SHA-256 desse valor.
begin;

create table if not exists public.acessos_site_diarios (
  dia date not null default current_date,
  visitante_hash text not null check (char_length(visitante_hash) = 64),
  pagina text not null check (pagina in ('inicio', 'categoria', 'loja', 'produto')),
  produto_id text not null default '',
  primeiro_acesso_em timestamptz not null default now(),
  ultimo_acesso_em timestamptz not null default now(),
  primary key (dia, visitante_hash, pagina, produto_id)
);

create index if not exists acessos_site_diarios_dia_idx
  on public.acessos_site_diarios(dia desc);

create table if not exists public.produto_visualizacoes_unicas (
  produto_id text not null references public.produtos(id) on delete cascade,
  visitante_hash text not null check (char_length(visitante_hash) = 64),
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  primary key (produto_id, visitante_hash)
);

create index if not exists produto_visualizacoes_unicas_produto_idx
  on public.produto_visualizacoes_unicas(produto_id, primeiro_visto_em desc);

alter table public.acessos_site_diarios enable row level security;
alter table public.produto_visualizacoes_unicas enable row level security;

-- Nenhum visitante, cliente ou vendedor pode ler/escrever métricas pelo browser.
revoke all on table public.acessos_site_diarios from anon, authenticated;
revoke all on table public.produto_visualizacoes_unicas from anon, authenticated;
grant all privileges on table public.acessos_site_diarios to service_role;
grant all privileges on table public.produto_visualizacoes_unicas to service_role;

create or replace function public.resumo_acessos_geral_admin(p_dias integer default 30)
returns table(visitantes_unicos bigint, acessos_registados bigint, visualizacoes_produtos bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inicio date;
begin
  if p_dias not between 1 and 365 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  inicio := current_date - (p_dias - 1);
  return query
  select
    count(distinct a.visitante_hash)::bigint,
    count(*)::bigint,
    (select count(*)::bigint from public.produto_visualizacoes_unicas pv where pv.primeiro_visto_em::date >= inicio)
  from public.acessos_site_diarios a
  where a.dia >= inicio;
end;
$$;

create or replace function public.resumo_acessos_diarios_admin(p_dias integer default 7)
returns table(dia date, visitantes bigint, acessos bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inicio date;
begin
  if p_dias not between 1 and 90 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  inicio := current_date - (p_dias - 1);
  return query
  select
    serie.dia::date as dia,
    count(distinct a.visitante_hash)::bigint as visitantes,
    count(a.visitante_hash)::bigint as acessos
  from generate_series(inicio, current_date, interval '1 day') as serie(dia)
  left join public.acessos_site_diarios a on a.dia = serie.dia::date
  group by serie.dia
  order by serie.dia;
end;
$$;

create or replace function public.produtos_mais_vistos_admin(p_dias integer default 30, p_limite integer default 5)
returns table(produto_id text, visualizacoes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inicio date;
begin
  if p_dias not between 1 and 365 or p_limite not between 1 and 20 then
    raise exception 'Parâmetros inválidos.' using errcode = '22023';
  end if;
  inicio := current_date - (p_dias - 1);
  return query
  select pv.produto_id, count(*)::bigint as visualizacoes
  from public.produto_visualizacoes_unicas pv
  where pv.primeiro_visto_em::date >= inicio
  group by pv.produto_id
  order by visualizacoes desc, pv.produto_id asc
  limit p_limite;
end;
$$;

revoke all on function public.resumo_acessos_geral_admin(integer) from public, anon, authenticated;
revoke all on function public.resumo_acessos_diarios_admin(integer) from public, anon, authenticated;
revoke all on function public.produtos_mais_vistos_admin(integer, integer) from public, anon, authenticated;
grant execute on function public.resumo_acessos_geral_admin(integer) to service_role;
grant execute on function public.resumo_acessos_diarios_admin(integer) to service_role;
grant execute on function public.produtos_mais_vistos_admin(integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
