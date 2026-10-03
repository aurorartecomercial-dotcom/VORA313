-- VORA 313 — verificação segura da configuração de vídeos.
-- Execute esta consulta no SQL Editor depois das migrations 016 e 024.
-- Ela não altera nem apaga dados.

select
  to_regclass('public.videos_vendedores') is not null as tabela_videos_existe,
  to_regprocedure('public.consumir_limite_api(text,text,integer,integer)') as limite_api;

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'vora-public';
