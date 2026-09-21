-- Suporte à migração e auditoria. Executar depois de 003_firebase_uid_bridge.sql.
begin;
create table if not exists public.firebase_legacy_documents (
  id bigserial primary key,
  collection_path text not null,
  document_id text not null,
  document_path text not null unique,
  data jsonb not null,
  migrado_em timestamptz not null default now()
);
create index if not exists idx_firebase_legacy_collection on public.firebase_legacy_documents(collection_path);
alter table public.firebase_legacy_documents enable row level security;
commit;
