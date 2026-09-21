-- VORA 313 / Supabase
-- FASE 1: estrutura PostgreSQL + RLS
-- Não contém credenciais nem dados de produção.

create extension if not exists pgcrypto;

create type public.user_role as enum ('cliente', 'vendedor', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  telefone text,
  nif text,
  role public.user_role not null default 'cliente',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.clientes (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  pontos integer not null default 0 check (pontos >= 0),
  historico jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.vendedores (
  id uuid primary key references auth.users(id) on delete cascade,
  uid text,
  nome text not null,
  nome_loja text not null,
  telefone text,
  email text,
  morada text,
  categoria text,
  descricao text,
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','recusado','suspenso')),
  ativo boolean not null default false,
  plano text not null default 'basico'
    check (plano in ('basico','profissional','premium')),
  saldo_disponivel numeric(14,2) not null default 0,
  saldo_retido numeric(14,2) not null default 0,
  total_vendas integer not null default 0,
  total_produtos integer not null default 0,
  dados_recebimento jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.produtos (
  id text primary key,
  ordem integer not null default 999999,
  nome text not null,
  categoria text not null,
  preco text not null,
  preco_antigo text,
  desconto text,
  parcelas text,
  frete_gratis boolean not null default false,
  descricao text not null default '',
  imagens jsonb not null default '[]'::jsonb,
  marca text,
  sku text,
  tag text,
  estoque integer not null default 0 check (estoque >= 0),
  vendedor_id uuid references public.vendedores(id) on delete set null,
  vendedor_nome text,
  status_aprovacao text not null default 'aprovado'
    check (status_aprovacao in ('aguardando_aprovacao','aprovado','recusado')),
  ativo boolean not null default true,
  vendedor_ativo boolean not null default true,
  monetizacao jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.cupons (
  id text primary key,
  codigo text not null unique,
  uid_cliente uuid references public.clientes(id) on delete cascade,
  ativo boolean not null default true,
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  validade timestamptz,
  max_usos integer,
  usos integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.vendas (
  id text primary key,
  codigo_rastreio text not null unique,
  numero_fatura text not null unique,
  uid_cliente uuid not null references auth.users(id) on delete restrict,
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento','pago','em_preparacao','enviado','entregue','cancelado')),
  pagamento jsonb not null default '{}'::jsonb,
  nome_cliente text not null,
  telefone_cliente text not null,
  nif_cliente text not null,
  morada_cliente text,
  bairro text not null,
  observacao text,
  produtos_resumo text,
  total_itens integer not null default 0,
  subtotal numeric(14,2) not null default 0,
  frete numeric(14,2) not null default 0,
  valor_desconto numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  cupom_aplicado jsonb,
  monetizacao jsonb not null default '{}'::jsonb,
  data_hora text,
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id text not null references public.vendas(id) on delete cascade,
  produto_id text not null references public.produtos(id) on delete restrict,
  nome text not null,
  quantidade integer not null check (quantidade > 0),
  preco numeric(14,2) not null default 0,
  observacao text,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  vendedor_nome text,
  comissao_percentual numeric(5,2) not null default 7,
  valor_bruto numeric(14,2) not null default 0,
  comissao_vora numeric(14,2) not null default 0,
  valor_vendedor numeric(14,2) not null default 0
);

create table public.comissoes (
  id text primary key,
  pedido_id text not null unique references public.vendas(id) on delete cascade,
  codigo_rastreio text,
  numero_fatura text,
  uid_cliente uuid references auth.users(id) on delete set null,
  modelo text not null default 'comissao_por_venda',
  valor_venda_produtos numeric(14,2) not null default 0,
  comissao_vora numeric(14,2) not null default 0,
  receita_frete_vora numeric(14,2) not null default 0,
  receita_total_vora numeric(14,2) not null default 0,
  status text not null default 'gerada',
  criado_em timestamptz not null default now()
);

create table public.movimentos_vendedores (
  id uuid primary key default gen_random_uuid(),
  uid_vendedor uuid not null references public.vendedores(id) on delete cascade,
  pedido_id text references public.vendas(id) on delete set null,
  codigo_rastreio text,
  tipo text not null,
  valor_venda numeric(14,2) not null default 0,
  comissao_vora numeric(14,2) not null default 0,
  valor_vendedor numeric(14,2) not null default 0,
  status text not null default 'disponivel',
  criado_em timestamptz not null default now()
);

create table public.vendas_vendedor (
  id text primary key,
  uid_vendedor uuid not null references public.vendedores(id) on delete cascade,
  pedido_id text references public.vendas(id) on delete set null,
  codigo_rastreio text,
  status text,
  valor_venda numeric(14,2) not null default 0,
  comissao_vora numeric(14,2) not null default 0,
  valor_vendedor numeric(14,2) not null default 0,
  produtos_resumo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.destaques_solicitados (
  id uuid primary key default gen_random_uuid(),
  uid_vendedor uuid not null references public.vendedores(id) on delete cascade,
  produto_id text not null references public.produtos(id) on delete cascade,
  nome_produto text,
  dias integer not null check (dias in (7,15,30)),
  valor numeric(14,2) not null default 0,
  status text not null default 'aguardando_pagamento',
  inicio timestamptz,
  fim timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.levantamentos (
  id uuid primary key default gen_random_uuid(),
  uid_vendedor uuid not null references public.vendedores(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'pendente',
  dados_recebimento jsonb not null default '{}'::jsonb,
  processado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.avaliacoes (
  id text primary key,
  produto_id text not null references public.produtos(id) on delete cascade,
  uid_cliente uuid not null references auth.users(id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  data timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (produto_id, uid_cliente)
);

create table public.rastreios_publicos (
  codigo text primary key,
  status text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.fidelidade_movimentos (
  id uuid primary key default gen_random_uuid(),
  uid_cliente uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('ganho','resgate','ajuste')),
  pontos integer not null,
  descricao text,
  pedido_id text references public.vendas(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index idx_produtos_categoria on public.produtos(categoria);
create index idx_produtos_vendedor on public.produtos(vendedor_id);
create index idx_produtos_publicado on public.produtos(ativo, vendedor_ativo, status_aprovacao);
create index idx_vendas_cliente on public.vendas(uid_cliente);
create index idx_vendas_status on public.vendas(status);
create index idx_vendas_criado on public.vendas(criado_em desc);
create index idx_venda_itens_venda on public.venda_itens(venda_id);
create index idx_venda_itens_vendedor on public.venda_itens(vendedor_id);
create index idx_cupons_cliente_ativo on public.cupons(uid_cliente, ativo);
create index idx_avaliacoes_produto on public.avaliacoes(produto_id);
create index idx_vendas_vendedor on public.vendas_vendedor(uid_vendedor);
create index idx_movimentos_vendedor on public.movimentos_vendedores(uid_vendedor);
create index idx_destaques_vendedor_produto on public.destaques_solicitados(uid_vendedor, produto_id);
create index idx_levantamentos_vendedor on public.levantamentos(uid_vendedor);

-- Funções de autorização. SECURITY DEFINER evita recursão de RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and ativo = true
  );
$$;

create or replace function public.is_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendedores
    where id = auth.uid() and status = 'aprovado' and ativo = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.vendedores enable row level security;
alter table public.produtos enable row level security;
alter table public.cupons enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.comissoes enable row level security;
alter table public.movimentos_vendedores enable row level security;
alter table public.vendas_vendedor enable row level security;
alter table public.destaques_solicitados enable row level security;
alter table public.levantamentos enable row level security;
alter table public.avaliacoes enable row level security;
alter table public.rastreios_publicos enable row level security;
alter table public.fidelidade_movimentos enable row level security;

-- Perfil/cliente
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());

create policy profiles_update_self_or_admin on public.profiles
for update to authenticated using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy clientes_select_self_or_admin on public.clientes
for select to authenticated using (id = auth.uid() or public.is_admin());

create policy clientes_insert_self on public.clientes
for insert to authenticated with check (id = auth.uid());

create policy clientes_update_self_limited on public.clientes
for update to authenticated using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Catálogo público; alterações privilegiadas por Edge Function/service role.
create policy produtos_public_select on public.produtos
for select to anon, authenticated using (ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado');

create policy produtos_admin_all on public.produtos
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Vendedores
create policy vendedores_public_select_active on public.vendedores
for select to anon, authenticated using (status = 'aprovado' and ativo = true);

create policy vendedores_self_or_admin on public.vendedores
for select to authenticated using (id = auth.uid() or public.is_admin());

create policy vendedores_update_self_or_admin on public.vendedores
for update to authenticated using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy vendedores_insert_self on public.vendedores
for insert to authenticated with check (id = auth.uid());

-- Pedidos
create policy vendas_select_owner_or_admin on public.vendas
for select to authenticated using (uid_cliente = auth.uid() or public.is_admin());

create policy venda_itens_select_owner_seller_admin on public.venda_itens
for select to authenticated using (
  exists (
    select 1 from public.vendas v
    where v.id = venda_id and (v.uid_cliente = auth.uid() or public.is_admin())
  )
  or vendedor_id = auth.uid()
  or public.is_admin()
);

-- Cupons
create policy cupons_select_owner_or_admin on public.cupons
for select to authenticated using (uid_cliente = auth.uid() or public.is_admin());

-- Financeiro
create policy comissoes_admin_only on public.comissoes
for select to authenticated using (public.is_admin());

create policy movimentos_vendedor_self_or_admin on public.movimentos_vendedores
for select to authenticated using (uid_vendedor = auth.uid() or public.is_admin());

create policy vendas_vendedor_self_or_admin on public.vendas_vendedor
for select to authenticated using (uid_vendedor = auth.uid() or public.is_admin());

create policy levantamentos_self_or_admin on public.levantamentos
for select to authenticated using (uid_vendedor = auth.uid() or public.is_admin());

create policy destaques_self_or_admin on public.destaques_solicitados
for select to authenticated using (uid_vendedor = auth.uid() or public.is_admin());

-- Avaliações: leitura pública. Escrita será feita por Edge Function após validação
-- de compra entregue; não abrir INSERT diretamente ao navegador.
create policy avaliacoes_public_select on public.avaliacoes
for select to anon, authenticated using (true);

create policy avaliacoes_admin_update on public.avaliacoes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Rastreio público
create policy rastreio_public_get on public.rastreios_publicos
for select to anon, authenticated using (true);

-- Fidelidade: somente o dono lê; alterações por backend.
create policy fidelidade_self_select on public.fidelidade_movimentos
for select to authenticated using (uid_cliente = auth.uid() or public.is_admin());

-- View pública útil para média das avaliações.
create or replace view public.produto_avaliacoes_resumo as
select
  produto_id,
  round(avg(nota)::numeric, 2) as media,
  count(*)::integer as total
from public.avaliacoes
group by produto_id;
