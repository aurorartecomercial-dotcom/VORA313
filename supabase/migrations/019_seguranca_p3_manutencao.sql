-- VORA 313 — segurança P3: manutenção de registos técnicos.
-- Execute depois de 016 e 018. Esta migration não elimina nada por si só.
-- A limpeza só ocorre se a função for chamada pelo serviço agendado.
begin;

create or replace function public.limpar_registos_seguranca(
  p_dias_limites integer default 8,
  p_dias_auditoria integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limites integer := 0;
  v_eventos integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'A manutenção de segurança é exclusiva do serviço.' using errcode = '42501';
  end if;
  if p_dias_limites not between 1 and 90 or p_dias_auditoria not between 365 and 3650 then
    raise exception 'Período de retenção inválido.' using errcode = '22023';
  end if;

  delete from public.limites_api
   where atualizado_em < now() - make_interval(days => p_dias_limites);
  get diagnostics v_limites = row_count;

  delete from public.eventos_seguranca
   where criado_em < now() - make_interval(days => p_dias_auditoria);
  get diagnostics v_eventos = row_count;

  return jsonb_build_object('limitesRemovidos', v_limites, 'eventosRemovidos', v_eventos);
end;
$$;

revoke all on function public.limpar_registos_seguranca(integer, integer)
  from public, anon, authenticated;
grant execute on function public.limpar_registos_seguranca(integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
