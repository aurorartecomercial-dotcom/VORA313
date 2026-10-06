-- VORA 313 — avaliações verificadas de produtos e vendedores.
-- Evolui a tabela public.avaliacoes existente e cria somente a estrutura
-- complementar necessária para avaliações de vendedores.
begin;

alter table public.avaliacoes
  add column if not exists comentario text,
  add column if not exists venda_item_id uuid references public.venda_itens(id) on delete restrict,
  add column if not exists vendedor_id uuid references public.vendedores(id) on delete set null,
  add column if not exists verificada boolean not null default false;

alter table public.avaliacoes
  drop constraint if exists avaliacoes_produto_id_uid_cliente_key;

-- As avaliações antigas foram criadas pelo fluxo que já verificava uma compra
-- entregue. Fazemos o vínculo com um item real quando ele pode ser identificado.
update public.avaliacoes a
set venda_item_id = x.venda_item_id,
    vendedor_id = x.vendedor_id,
    verificada = true
from (
  select distinct on (a2.id)
    a2.id as avaliacao_id,
    vi.id as venda_item_id,
    vi.vendedor_id
  from public.avaliacoes a2
  join public.venda_itens vi on vi.produto_id = a2.produto_id
  join public.vendas v on v.id = vi.venda_id
                         and v.uid_cliente = a2.uid_cliente
                         and v.status = 'entregue'
  where a2.venda_item_id is null
  order by a2.id, v.criado_em desc, vi.id
) x on x.avaliacao_id = a.id;

create unique index if not exists uq_avaliacoes_item_cliente
  on public.avaliacoes(venda_item_id, uid_cliente)
  where venda_item_id is not null;

create index if not exists idx_avaliacoes_vendedor
  on public.avaliacoes(vendedor_id, data desc)
  where vendedor_id is not null and verificada = true;

alter table public.avaliacoes
  drop constraint if exists avaliacoes_comentario_tamanho_chk;
alter table public.avaliacoes
  add constraint avaliacoes_comentario_tamanho_chk
  check (comentario is null or char_length(comentario) <= 1000);

create table if not exists public.avaliacoes_vendedores (
  id uuid primary key default gen_random_uuid(),
  venda_id text not null references public.vendas(id) on delete restrict,
  vendedor_id uuid not null references public.vendedores(id) on delete restrict,
  uid_cliente uuid not null references auth.users(id) on delete restrict,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  verificada boolean not null default true,
  data timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint avaliacoes_vendedores_comentario_tamanho_chk
    check (comentario is null or char_length(comentario) <= 1000),
  constraint uq_avaliacao_vendedor_pedido
    unique (venda_id, vendedor_id, uid_cliente)
);

create index if not exists idx_avaliacoes_vendedores_vendedor
  on public.avaliacoes_vendedores(vendedor_id, data desc)
  where verificada = true;
create index if not exists idx_avaliacoes_vendedores_cliente
  on public.avaliacoes_vendedores(uid_cliente, data desc);

-- A escrita passa exclusivamente pelas funções seguras abaixo.
revoke all on table public.avaliacoes from anon, authenticated;
revoke all on table public.avaliacoes_vendedores from anon, authenticated;

drop policy if exists avaliacoes_public_select on public.avaliacoes;
drop policy if exists avaliacoes_admin_update on public.avaliacoes;
create policy avaliacoes_public_select on public.avaliacoes
for select to anon, authenticated using (verificada = true);

create policy avaliacoes_admin_select on public.avaliacoes
for select to authenticated using (public.is_admin());

alter table public.avaliacoes_vendedores enable row level security;
drop policy if exists avaliacoes_vendedores_public_select on public.avaliacoes_vendedores;
create policy avaliacoes_vendedores_public_select on public.avaliacoes_vendedores
for select to anon, authenticated using (verificada = true);
drop policy if exists avaliacoes_vendedores_admin_select on public.avaliacoes_vendedores;
create policy avaliacoes_vendedores_admin_select on public.avaliacoes_vendedores
for select to authenticated using (public.is_admin());

-- Produto: só o comprador autenticado pode criar uma avaliação para o item
-- entregue que pertence ao seu pedido. A unicidade é reforçada pelo banco.
create or replace function public.registrar_avaliacao_produto(
  p_produto_id text,
  p_venda_item_id uuid,
  p_nota integer,
  p_comentario text default null
)
returns public.avaliacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.venda_itens%rowtype;
  v_pedido public.vendas%rowtype;
  v_comentario text := nullif(left(trim(coalesce(p_comentario, '')), 1000), '');
  v_result public.avaliacoes;
begin
  if v_uid is null then
    raise exception 'Inicie sessão para avaliar.' using errcode = '42501';
  end if;
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'Nota inválida.' using errcode = '22023';
  end if;
  if p_produto_id is null or trim(p_produto_id) = '' or p_venda_item_id is null then
    raise exception 'Produto e item da compra são obrigatórios.' using errcode = '22023';
  end if;

  select vi.* into v_item
  from public.venda_itens vi
  where vi.id = p_venda_item_id
    and vi.produto_id = p_produto_id;
  if not found then
    raise exception 'Item da compra não corresponde ao produto.' using errcode = '42501';
  end if;

  select v.* into v_pedido
  from public.vendas v
  where v.id = v_item.venda_id;
  if not found or v_pedido.uid_cliente <> v_uid or v_pedido.status <> 'entregue' then
    raise exception 'Só é possível avaliar produtos de pedidos entregues da sua conta.' using errcode = '42501';
  end if;

  if exists (select 1 from public.avaliacoes where venda_item_id = p_venda_item_id) then
    raise exception 'Este item já foi avaliado.' using errcode = '23505';
  end if;

  insert into public.avaliacoes (
    id, produto_id, uid_cliente, nota, comentario, data,
    venda_item_id, vendedor_id, verificada, criado_em
  ) values (
    gen_random_uuid()::text,
    p_produto_id, v_uid, p_nota, v_comentario, now(),
    p_venda_item_id, v_item.vendedor_id, true, now()
  ) returning * into v_result;

  return v_result;
end;
$$;

-- Vendedor: uma avaliação por vendedor em cada pedido entregue.
create or replace function public.registrar_avaliacao_vendedor(
  p_venda_id text,
  p_vendedor_id uuid,
  p_nota integer,
  p_comentario text default null
)
returns public.avaliacoes_vendedores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pedido public.vendas%rowtype;
  v_comentario text := nullif(left(trim(coalesce(p_comentario, '')), 1000), '');
  v_result public.avaliacoes_vendedores;
begin
  if v_uid is null then
    raise exception 'Inicie sessão para avaliar.' using errcode = '42501';
  end if;
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'Nota inválida.' using errcode = '22023';
  end if;
  if p_venda_id is null or trim(p_venda_id) = '' or p_vendedor_id is null then
    raise exception 'Pedido e vendedor são obrigatórios.' using errcode = '22023';
  end if;

  select * into v_pedido
  from public.vendas
  where id = p_venda_id
    and uid_cliente = v_uid
    and status = 'entregue';
  if not found then
    raise exception 'Só é possível avaliar vendedores de pedidos entregues da sua conta.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.venda_itens vi
    where vi.venda_id = p_venda_id and vi.vendedor_id = p_vendedor_id
  ) then
    raise exception 'Este vendedor não pertence ao pedido indicado.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.avaliacoes_vendedores av
    where av.venda_id = p_venda_id
      and av.vendedor_id = p_vendedor_id
      and av.uid_cliente = v_uid
  ) then
    raise exception 'Este vendedor já foi avaliado neste pedido.' using errcode = '23505';
  end if;

  insert into public.avaliacoes_vendedores (
    venda_id, vendedor_id, uid_cliente, nota, comentario, verificada, data, criado_em
  ) values (
    p_venda_id, p_vendedor_id, v_uid, p_nota, v_comentario, true, now(), now()
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.registrar_avaliacao_produto(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.registrar_avaliacao_produto(text, uuid, integer, text) to authenticated;
revoke all on function public.registrar_avaliacao_vendedor(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.registrar_avaliacao_vendedor(text, uuid, integer, text) to authenticated;

-- Views públicas sem expor o UUID/e-mail do comprador.
create or replace view public.produto_avaliacoes_resumo as
select
  produto_id,
  round(avg(nota)::numeric, 2) as media,
  count(*)::integer as total,
  count(*) filter (where nota = 5)::integer as estrelas_5,
  count(*) filter (where nota = 4)::integer as estrelas_4,
  count(*) filter (where nota = 3)::integer as estrelas_3,
  count(*) filter (where nota = 2)::integer as estrelas_2,
  count(*) filter (where nota = 1)::integer as estrelas_1
from public.avaliacoes
where verificada = true
group by produto_id;

create or replace view public.produto_avaliacoes_recentes as
select produto_id, nota, comentario, data, verificada
from public.avaliacoes
where verificada = true
order by data desc;

create or replace view public.vendedor_avaliacoes_resumo as
select
  vendedor_id,
  round(avg(nota)::numeric, 2) as media,
  count(*)::integer as total,
  count(*) filter (where nota = 5)::integer as estrelas_5,
  count(*) filter (where nota = 4)::integer as estrelas_4,
  count(*) filter (where nota = 3)::integer as estrelas_3,
  count(*) filter (where nota = 2)::integer as estrelas_2,
  count(*) filter (where nota = 1)::integer as estrelas_1
from public.avaliacoes_vendedores
where verificada = true
group by vendedor_id;

create or replace view public.vendedor_avaliacoes_recentes as
select vendedor_id, nota, comentario, data, verificada
from public.avaliacoes_vendedores
where verificada = true
order by data desc;

grant select on public.produto_avaliacoes_resumo to anon, authenticated;
grant select on public.produto_avaliacoes_recentes to anon, authenticated;
grant select on public.vendedor_avaliacoes_resumo to anon, authenticated;
grant select on public.vendedor_avaliacoes_recentes to anon, authenticated;

notify pgrst, 'reload schema';
commit;
