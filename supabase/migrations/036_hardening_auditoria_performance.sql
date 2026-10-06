-- VORA 313 — hardening técnico 036
-- Correções aditivas e não destrutivas:
-- 1) permite que a auditoria registe avaliações (categoria já usada pela API);
-- 2) documenta/fecha a integridade da tabela de auditoria sem abrir escrita ao cliente.
-- Não apaga nem altera pedidos, pagamentos, produtos ou utilizadores.
begin;

-- A Edge Function regista eventos de avaliação com categoria "avaliacao".
-- Antes desta migration esses eventos eram rejeitados pela validação da função
-- e acabavam apenas no log privado, deixando uma lacuna de auditoria.
alter table public.eventos_seguranca
  drop constraint if exists eventos_seguranca_categoria_check;

alter table public.eventos_seguranca
  add constraint eventos_seguranca_categoria_check
  check (categoria in ('autorizacao', 'vendedor', 'pagamento', 'limite', 'sistema', 'avaliacao'));

create index if not exists idx_eventos_seguranca_alvo_criado_em
  on public.eventos_seguranca(alvo, criado_em desc)
  where alvo is not null;

-- Reafirma a regra: apenas o serviço pode gravar auditoria.
revoke all on function public.registrar_evento_seguranca(text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_evento_seguranca(text, text, text, jsonb, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
