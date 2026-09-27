-- VORA 313 — identidade pública da loja do vendedor.
-- Execute depois de 011_vendedor_cadastro_resiliente.sql.
-- Mantém dados financeiros e de aprovação fora deste perfil público.
begin;

alter table public.vendedores
  add column if not exists perfil_publico jsonb not null default '{}'::jsonb;

alter table public.vendedores
  drop constraint if exists vendedores_perfil_publico_objeto;

alter table public.vendedores
  add constraint vendedores_perfil_publico_objeto
  check (jsonb_typeof(perfil_publico) = 'object');

-- Alternativa segura para gravar apenas a apresentação pública da própria loja
-- caso uma Edge Function antiga ainda não conheça este campo.
create or replace function public.atualizar_perfil_publico_vendedor(p_perfil jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_logo text := left(trim(coalesce(p_perfil ->> 'logoUrl', '')), 1200);
  v_capa text := left(trim(coalesce(p_perfil ->> 'capaUrl', '')), 1200);
  v_horario text := left(trim(coalesce(p_perfil ->> 'horario', '')), 160);
  v_instagram text := left(trim(coalesce(p_perfil ->> 'instagram', '')), 120);
  v_destaque text := left(trim(coalesce(p_perfil ->> 'destaque', '')), 280);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Não existe uma candidatura de vendedor para esta conta.' using errcode = '42501';
  end if;

  update public.vendedores
     set perfil_publico = jsonb_build_object(
       'logoUrl', v_logo,
       'capaUrl', v_capa,
       'horario', v_horario,
       'instagram', v_instagram,
       'destaque', v_destaque
     ),
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_perfil_publico_vendedor(jsonb) from public, anon;
grant execute on function public.atualizar_perfil_publico_vendedor(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
