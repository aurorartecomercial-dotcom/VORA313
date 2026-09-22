begin;

-- Reparação idempotente para projetos em que a tabela produtos foi criada
-- por uma versão anterior do schema ou em que alguma migration ficou por aplicar.
alter table public.produtos
  add column if not exists ordem integer not null default 999999,
  add column if not exists nome text,
  add column if not exists categoria text,
  add column if not exists preco text,
  add column if not exists preco_antigo text,
  add column if not exists desconto text,
  add column if not exists parcelas text,
  add column if not exists frete_gratis boolean not null default false,
  add column if not exists descricao text not null default '',
  add column if not exists imagens jsonb not null default '[]'::jsonb,
  add column if not exists marca text,
  add column if not exists sku text,
  add column if not exists tag text,
  add column if not exists estoque integer not null default 0,
  add column if not exists vendedor_id uuid,
  add column if not exists vendedor_nome text,
  add column if not exists status_aprovacao text not null default 'aprovado',
  add column if not exists ativo boolean not null default true,
  add column if not exists vendedor_ativo boolean not null default true,
  add column if not exists monetizacao jsonb not null default '{}'::jsonb,
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists atualizado_em timestamptz not null default now(),
  add column if not exists custo text not null default '',
  add column if not exists video text not null default '',
  add column if not exists especificacoes jsonb not null default '{}'::jsonb,
  add column if not exists selo text not null default '',
  add column if not exists destaques jsonb not null default '[]'::jsonb;

-- Compatibilidade com tabelas criadas sem as constraints da versão atual.
create index if not exists idx_produtos_ordem on public.produtos(ordem);
create index if not exists idx_produtos_vendedor on public.produtos(vendedor_id);
create index if not exists idx_produtos_publicado on public.produtos(ativo, vendedor_ativo, status_aprovacao);

-- Produtos de administração (sem vendedor) são publicados por defeito.
update public.produtos
set
  status_aprovacao = coalesce(nullif(status_aprovacao, ''), 'aprovado'),
  ativo = coalesce(ativo, true),
  vendedor_ativo = coalesce(vendedor_ativo, true),
  ordem = coalesce(ordem, 999999)
where vendedor_id is null;

-- Depois de alterações estruturais, força o PostgREST a recarregar o schema.
notify pgrst, 'reload schema';

commit;
