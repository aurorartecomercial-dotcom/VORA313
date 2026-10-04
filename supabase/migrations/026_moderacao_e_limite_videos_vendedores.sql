-- VORA 313 — moderação obrigatória e limites para vídeos de vendedores.
-- Execute depois das migrations 016, 024 e 025.
-- Não concede escrita direta ao browser: o envio e a decisão passam pela API.
begin;

alter table public.videos_vendedores
  add column if not exists revisado_em timestamptz,
  add column if not exists revisado_por uuid references auth.users(id) on delete set null,
  add column if not exists revisado_por_email text,
  add column if not exists motivo_recusa text;

-- Preserva os vídeos antigos que já estavam publicados. Os próximos entram
-- obrigatoriamente como pendentes até que um administrador os aprove.
alter table public.videos_vendedores
  drop constraint if exists videos_vendedores_status_check;
alter table public.videos_vendedores
  add constraint videos_vendedores_status_check
  check (status in ('pendente', 'publicado', 'recusado', 'oculto'));
alter table public.videos_vendedores
  alter column status set default 'pendente';

-- Defesa em profundidade: além da validação na Edge Function, o banco rejeita
-- ficheiros acima de 100 MB mesmo se um pedido for forjado fora da interface.
alter table public.videos_vendedores
  drop constraint if exists videos_vendedores_tamanho_bytes_check;
alter table public.videos_vendedores
  add constraint videos_vendedores_tamanho_bytes_check
  check (tamanho_bytes between 1 and 104857600);

create index if not exists videos_vendedores_moderacao_idx
  on public.videos_vendedores(status, criado_em asc);

-- Impede um oitavo vídeo em revisão/publicado/oculto. O lock por vendedor
-- também protege contra dois envios simultâneos passarem no mesmo instante.
create or replace function public.limitar_videos_vendedor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  total_videos integer;
begin
  if new.status not in ('pendente', 'publicado', 'oculto') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.vendedor_id = new.vendedor_id
     and old.status in ('pendente', 'publicado', 'oculto') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.vendedor_id::text));
  select count(*)
    into total_videos
    from public.videos_vendedores
   where vendedor_id = new.vendedor_id
     and status in ('pendente', 'publicado', 'oculto');

  if total_videos >= 7 then
    raise exception 'limite de 7 vídeos por vendedor atingido'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists limitar_videos_vendedor_trigger on public.videos_vendedores;
create trigger limitar_videos_vendedor_trigger
before insert or update of vendedor_id, status on public.videos_vendedores
for each row execute function public.limitar_videos_vendedor();

-- O bucket continua público somente para leitura, pois também entrega imagens
-- existentes do marketplace. O registo do vídeo fica invisível na loja até o
-- estado "publicado"; pendente, recusado e oculto não passam pela política
-- pública da tabela.
update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'video/mp4', 'video/webm'
       ]::text[]
 where id = 'vora-public';

grant usage on schema public to service_role;
grant all privileges on table public.videos_vendedores to service_role;

notify pgrst, 'reload schema';
commit;
