-- VORA 313 — segurança P1: privacidade pública e perfil de loja validado.
-- Execute depois de 012_perfil_publico_loja.sql, 013_central_vendedor_segura
-- e 016_seguranca_p0_uploads_e_limites.sql.
-- Não altera pedidos, produtos, saldos ou dados de recebimento existentes.
begin;

-- O perfil público permite somente imagens HTTPS e um identificador/link válido
-- de Instagram. Isto impede que URLs executáveis ou esquemas não esperados
-- sejam guardados e depois usados na vitrine da loja.
create or replace function public.normalizar_perfil_publico_vendedor(p_perfil jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_perfil jsonb := coalesce(p_perfil, '{}'::jsonb);
  v_logo text := left(trim(coalesce(v_perfil ->> 'logoUrl', '')), 1200);
  v_capa text := left(trim(coalesce(v_perfil ->> 'capaUrl', '')), 1200);
  v_horario text := left(trim(coalesce(v_perfil ->> 'horario', '')), 160);
  v_instagram text := left(trim(coalesce(v_perfil ->> 'instagram', '')), 120);
  v_destaque text := left(trim(coalesce(v_perfil ->> 'destaque', '')), 280);
  v_utilizador_instagram text;
begin
  if jsonb_typeof(v_perfil) <> 'object' then
    raise exception 'O perfil público da loja é inválido.' using errcode = '22023';
  end if;

  if (v_logo <> '' and v_logo !~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$')
     or (v_capa <> '' and v_capa !~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$') then
    raise exception 'Logótipo e capa devem usar uma URL HTTPS válida.' using errcode = '22023';
  end if;

  if v_instagram ~* '^@?[a-z0-9._]{1,30}$' then
    v_utilizador_instagram := lower(regexp_replace(v_instagram, '^@', ''));
    v_instagram := case when v_utilizador_instagram = '' then '' else 'https://instagram.com/' || v_utilizador_instagram end;
  elsif v_instagram <> '' and v_instagram !~* '^https://(www\.)?instagram\.com/[a-z0-9._]{1,30}/?$' then
    raise exception 'Instagram inválido. Use @utilizador ou um link HTTPS do Instagram.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'logoUrl', v_logo,
    'capaUrl', v_capa,
    'horario', v_horario,
    'instagram', v_instagram,
    'destaque', v_destaque
  );
end;
$$;

revoke all on function public.normalizar_perfil_publico_vendedor(jsonb)
  from public, anon, authenticated;

-- A mesma regra vale para atualizações via Edge Function, SQL administrativo
-- e funções antigas que ainda estejam em cache no navegador.
create or replace function public.validar_perfil_publico_vendedor_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.perfil_publico := public.normalizar_perfil_publico_vendedor(new.perfil_publico);
  return new;
end;
$$;

drop trigger if exists validar_perfil_publico_vendedor on public.vendedores;
create trigger validar_perfil_publico_vendedor
before insert or update of perfil_publico on public.vendedores
for each row execute procedure public.validar_perfil_publico_vendedor_trigger();

-- Perfis criados antes desta migration também são reduzidos aos cinco campos
-- públicos permitidos. Valores antigos inválidos são removidos, em vez de
-- deixar um link não confiável na vitrine ou interromper a migration inteira.
with perfis as (
  select
    id,
    case when jsonb_typeof(perfil_publico) = 'object' then perfil_publico else '{}'::jsonb end as perfil
  from public.vendedores
)
update public.vendedores as vendedor
set perfil_publico = jsonb_build_object(
  'logoUrl', case
    when left(trim(coalesce(perfis.perfil ->> 'logoUrl', '')), 1200) ~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$'
      then left(trim(coalesce(perfis.perfil ->> 'logoUrl', '')), 1200)
    else '' end,
  'capaUrl', case
    when left(trim(coalesce(perfis.perfil ->> 'capaUrl', '')), 1200) ~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$'
      then left(trim(coalesce(perfis.perfil ->> 'capaUrl', '')), 1200)
    else '' end,
  'horario', left(trim(coalesce(perfis.perfil ->> 'horario', '')), 160),
  'instagram', case
    when left(trim(coalesce(perfis.perfil ->> 'instagram', '')), 120) ~* '^@?[a-z0-9._]{1,30}$'
      then 'https://instagram.com/' || lower(regexp_replace(left(trim(coalesce(perfis.perfil ->> 'instagram', '')), 120), '^@', ''))
    when left(trim(coalesce(perfis.perfil ->> 'instagram', '')), 120) ~* '^https://(www\.)?instagram\.com/[a-z0-9._]{1,30}/?$'
      then left(trim(coalesce(perfis.perfil ->> 'instagram', '')), 120)
    else '' end,
  'destaque', left(trim(coalesce(perfis.perfil ->> 'destaque', '')), 280)
)
from perfis
where vendedor.id = perfis.id;

-- Atualiza a função legada sem reabrir campos financeiros ou de aprovação.
create or replace function public.atualizar_perfil_publico_vendedor(p_perfil jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil jsonb := public.normalizar_perfil_publico_vendedor(p_perfil);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Não existe uma candidatura de vendedor para esta conta.' using errcode = '42501';
  end if;

  update public.vendedores
     set perfil_publico = v_perfil,
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_perfil_publico_vendedor(jsonb) from public, anon;
grant execute on function public.atualizar_perfil_publico_vendedor(jsonb) to authenticated;

-- A função da Central também passa pela normalização. Campos internos como
-- saldo, plano, estado e recebimento continuam fora do alcance do vendedor.
create or replace function public.atualizar_perfil_central_vendedor(
  p_nome text,
  p_nome_loja text,
  p_telefone text,
  p_morada text,
  p_categoria text,
  p_descricao text,
  p_perfil_publico jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text := trim(coalesce(p_nome, ''));
  v_loja text := trim(coalesce(p_nome_loja, ''));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_morada text := left(trim(coalesce(p_morada, '')), 300);
  v_categoria text := trim(coalesce(p_categoria, ''));
  v_descricao text := left(trim(coalesce(p_descricao, '')), 1000);
  v_perfil jsonb := public.normalizar_perfil_publico_vendedor(p_perfil_publico);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;
  if char_length(v_nome) not between 2 and 120
     or char_length(v_loja) not between 2 and 120
     or char_length(v_telefone) not between 5 and 20
     or char_length(v_categoria) not between 2 and 80 then
    raise exception 'Dados do perfil da loja inválidos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Não existe uma candidatura de vendedor para esta conta.' using errcode = '42501';
  end if;

  update public.vendedores
     set nome = v_nome,
         nome_loja = v_loja,
         telefone = v_telefone,
         morada = v_morada,
         categoria = v_categoria,
         descricao = v_descricao,
         perfil_publico = v_perfil,
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb)
  to authenticated;

-- A vitrine pública não deve revelar a morada completa da loja. O telefone é
-- mantido apenas para o botão explícito "Contactar no WhatsApp".
drop view if exists public.lojas_publicas;
create view public.lojas_publicas
with (security_barrier = true)
as
select
  id,
  nome_loja,
  telefone,
  categoria,
  descricao,
  perfil_publico,
  total_vendas,
  total_produtos,
  criado_em
from public.vendedores
where status = 'aprovado' and ativo = true;

revoke all on public.lojas_publicas from public;
grant select on public.lojas_publicas to anon, authenticated;

notify pgrst, 'reload schema';
commit;
