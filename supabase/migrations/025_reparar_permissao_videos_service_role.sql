-- VORA 313 — reparação de permissão do servidor para vídeos.
-- Execute uma única vez em projetos onde a migration 024 já foi aplicada.
-- Não concede escrita ao browser, a clientes nem a vendedores.
begin;

grant usage on schema public to service_role;
grant all privileges on table public.videos_vendedores to service_role;

notify pgrst, 'reload schema';
commit;
