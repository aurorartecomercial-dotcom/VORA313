-- VORA 313 / Aurora Comercial
-- MIGRAÇÃO: ponte entre Firebase UID (string) e Supabase Auth UUID
-- Seguro para executar DEPOIS de 001_schema.sql e 002_auth_trigger.sql.
-- Não apaga dados, não altera Firebase e não cria utilizadores Auth.

begin;

-- O UID antigo do Firebase precisa ser preservado para que os documentos
-- existentes possam ser relacionados aos novos UUIDs do Supabase Auth.
alter table public.profiles
  add column if not exists firebase_uid text;

alter table public.clientes
  add column if not exists firebase_uid text;

create unique index if not exists uq_profiles_firebase_uid
  on public.profiles(firebase_uid)
  where firebase_uid is not null;

create unique index if not exists uq_clientes_firebase_uid
  on public.clientes(firebase_uid)
  where firebase_uid is not null;

-- Tabela central de correspondência. Ela é usada durante a migração de dados
-- e também permite auditoria/reprocessamento sem perder o UID original.
create table if not exists public.firebase_uid_map (
  firebase_uid text primary key,
  supabase_uid uuid not null unique references auth.users(id) on delete cascade,
  email text,
  role public.user_role,
  origem text not null default 'firebase',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_firebase_uid_map_supabase_uid
  on public.firebase_uid_map(supabase_uid);

alter table public.firebase_uid_map enable row level security;

-- Nenhum cliente deve consultar a ponte. Apenas service-role/backend deve usá-la.
-- Não é criada policy para anon/authenticated de propósito.

-- Mantém firebase_uid do perfil sincronizado quando a tabela de mapeamento
-- for preenchida pelo processo administrativo de migração.
create or replace function public.set_firebase_uid_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set firebase_uid = new.firebase_uid,
         atualizado_em = now()
   where id = new.supabase_uid;

  update public.clientes
     set firebase_uid = new.firebase_uid,
         atualizado_em = now()
   where id = new.supabase_uid;

  return new;
end;
$$;

drop trigger if exists trg_firebase_uid_map_sync on public.firebase_uid_map;
create trigger trg_firebase_uid_map_sync
after insert or update of firebase_uid, supabase_uid
on public.firebase_uid_map
for each row execute function public.set_firebase_uid_on_profile();

-- Função auxiliar para backend/service-role. Não é concedida a utilizadores comuns.
create or replace function public.resolve_supabase_uid(p_firebase_uid text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select supabase_uid
    from public.firebase_uid_map
   where firebase_uid = p_firebase_uid;
$$;

revoke all on function public.resolve_supabase_uid(text) from public, anon, authenticated;

grant execute on function public.resolve_supabase_uid(text) to service_role;

commit;
