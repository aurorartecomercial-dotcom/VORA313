-- VORA 313 — verificação segura da configuração de vídeos.
-- Execute esta consulta no SQL Editor depois das migrations 016, 024, 025 e 026.
-- Ela não altera nem apaga dados.

select
  to_regclass('public.videos_vendedores') is not null as tabela_videos_existe,
  to_regprocedure('public.consumir_limite_api(text,text,integer,integer)') as limite_api,
  to_regprocedure('public.limitar_videos_vendedor()') as limite_sete_videos;

select
  column_default as estado_padrao,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.videos_vendedores'::regclass
      and conname = 'videos_vendedores_status_check'
  ) as regra_estado_existe
from information_schema.columns
where table_schema = 'public'
  and table_name = 'videos_vendedores'
  and column_name = 'status';

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'vora-public';
