begin;

-- Campos usados pelo painel administrativo. Todos são opcionais para manter
-- compatibilidade com produtos já existentes.
alter table public.produtos
  add column if not exists custo text not null default '',
  add column if not exists video text not null default '',
  add column if not exists especificacoes jsonb not null default '{}'::jsonb,
  add column if not exists selo text not null default '',
  add column if not exists destaques jsonb not null default '[]'::jsonb;

-- Garante que produtos criados pelo painel admin continuam publicados
-- por defeito, sem interferir nos produtos de vendedores.
update public.produtos
set
  vendedor_ativo = coalesce(vendedor_ativo, true),
  status_aprovacao = coalesce(status_aprovacao, 'aprovado'),
  ativo = coalesce(ativo, true)
where vendedor_id is null;

commit;
