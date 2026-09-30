-- VORA 313 — segurança P0: uploads controlados e limitação da API.
-- Execute esta migration ANTES de publicar a versão da Edge Function que a usa.
-- Não altera produtos, pedidos, vendedores ou pagamentos existentes.
begin;

-- O bucket continua público somente para leitura das imagens já aprovadas.
-- A escrita direta pelo browser é removida: novos envios usam URL temporária
-- assinada pela Edge Function depois da validação da conta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vora-public',
  'vora-public',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

drop policy if exists vora_public_images_insert on storage.objects;
drop policy if exists vora_public_images_update on storage.objects;
drop policy if exists vora_public_images_delete on storage.objects;

-- Leitura pública é necessária para as imagens dos produtos e lojas.
drop policy if exists vora_public_images_read on storage.objects;
create policy vora_public_images_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'vora-public');

-- Registo atómico de limites por utilizador e ação. A função é exclusiva da
-- service_role; o browser nunca escolhe o seu próprio limite.
create table if not exists public.limites_api (
  chave text not null,
  acao text not null,
  inicio_janela timestamptz not null default now(),
  tentativas integer not null default 0 check (tentativas >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (chave, acao)
);

alter table public.limites_api enable row level security;
revoke all on table public.limites_api from anon, authenticated;

create or replace function public.consumir_limite_api(
  p_chave text,
  p_acao text,
  p_maximo integer,
  p_janela_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_tentativas integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'O controlo de limite é exclusivo do serviço.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_chave, ''))) < 8
     or char_length(trim(coalesce(p_acao, ''))) < 2
     or p_maximo not between 1 and 1000
     or p_janela_segundos not between 1 and 604800 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  insert into public.limites_api as limite (chave, acao, inicio_janela, tentativas, atualizado_em)
  values (trim(p_chave), trim(p_acao), now(), 1, now())
  on conflict (chave, acao) do update
  set inicio_janela = case
        when limite.inicio_janela + make_interval(secs => p_janela_segundos) <= now() then now()
        else limite.inicio_janela
      end,
      tentativas = case
        when limite.inicio_janela + make_interval(secs => p_janela_segundos) <= now() then 1
        else limite.tentativas + 1
      end,
      atualizado_em = now()
  returning inicio_janela, tentativas into v_inicio, v_tentativas;

  return v_tentativas <= p_maximo;
end;
$$;

revoke all on function public.consumir_limite_api(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consumir_limite_api(text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
