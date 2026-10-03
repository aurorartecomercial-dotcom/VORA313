-- VORA 313 — vídeos curtos dos vendedores.
-- Compatível com o catálogo existente: não altera produtos nem vendedores.
begin;

create table if not exists public.videos_vendedores (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  produto_id text references public.produtos(id) on delete set null,
  titulo text not null,
  descricao text not null default '',
  caminho_storage text not null,
  video_url text not null,
  mime_type text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  duracao_segundos integer check (duracao_segundos is null or duracao_segundos between 1 and 60),
  visualizacoes bigint not null default 0 check (visualizacoes >= 0),
  curtidas bigint not null default 0 check (curtidas >= 0),
  status text not null default 'publicado' check (status in ('publicado','oculto')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists videos_vendedores_vendedor_idx
  on public.videos_vendedores(vendedor_id, criado_em desc);

create index if not exists videos_vendedores_produto_idx
  on public.videos_vendedores(produto_id);

alter table public.videos_vendedores enable row level security;

-- O catálogo público só pode ver vídeos publicados de lojas aprovadas e ativas.
drop policy if exists videos_vendedores_public_read on public.videos_vendedores;
create policy videos_vendedores_public_read
on public.videos_vendedores for select
to anon, authenticated
using (
  status = 'publicado'
  and exists (
    select 1 from public.vendedores v
    where v.id = vendedor_id
      and v.status = 'aprovado'
      and v.ativo = true
  )
);

-- O vendedor lê os próprios vídeos no painel. Escritas e exclusões passam pela Edge Function.
drop policy if exists videos_vendedores_owner_read on public.videos_vendedores;
create policy videos_vendedores_owner_read
on public.videos_vendedores for select
to authenticated
using (vendedor_id = auth.uid());

revoke all on table public.videos_vendedores from anon, authenticated;
grant select on table public.videos_vendedores to anon, authenticated;

-- O bucket existente continua público para leitura. A escrita permanece fechada
-- ao browser e é feita com URL temporária emitida pela Edge Function.
update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 104857600),
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm'
    ]::text[]
where id = 'vora-public';

notify pgrst, 'reload schema';
commit;
