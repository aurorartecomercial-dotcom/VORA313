-- VORA 313 — Central do vendedor: acesso público mínimo e escrita protegida.
-- Execute depois de 012_perfil_publico_loja.sql.
-- Esta migration não cria dados de demonstração nem altera produtos existentes.
begin;

-- A página pública da loja não deve ler a tabela completa de vendedores:
-- nela existem e-mail, dados de recebimento e saldos. A view expõe somente
-- os campos que o vendedor decidiu tornar públicos.
drop policy if exists vendedores_public_select_active on public.vendedores;

create or replace view public.lojas_publicas
with (security_barrier = true)
as
select
  id,
  nome_loja,
  telefone,
  morada,
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

-- Um vendedor precisa ver os próprios produtos pendentes e recusados na sua
-- Central, mas continua sem poder alterá-los diretamente pelo navegador.
drop policy if exists produtos_vendedor_select_proprio on public.produtos;
create policy produtos_vendedor_select_proprio on public.produtos
for select to authenticated
using (vendedor_id = auth.uid());

-- A escrita direta em vendedores abria espaço para um cliente autenticado
-- tentar enviar campos que não pertencem ao seu perfil. O administrador mantém
-- o acesso necessário; o vendedor passa pelas funções limitadas abaixo.
drop policy if exists vendedores_update_self_or_admin on public.vendedores;
drop policy if exists vendedores_admin_update on public.vendedores;
create policy vendedores_admin_update on public.vendedores
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

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
  v_perfil jsonb := coalesce(p_perfil_publico, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;
  if char_length(v_nome) not between 2 and 120
     or char_length(v_loja) not between 2 and 120
     or char_length(v_telefone) not between 5 and 20
     or char_length(v_categoria) not between 2 and 80
     or jsonb_typeof(v_perfil) <> 'object' then
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
         perfil_publico = jsonb_build_object(
           'logoUrl', left(trim(coalesce(v_perfil ->> 'logoUrl', '')), 1200),
           'capaUrl', left(trim(coalesce(v_perfil ->> 'capaUrl', '')), 1200),
           'horario', left(trim(coalesce(v_perfil ->> 'horario', '')), 160),
           'instagram', left(trim(coalesce(v_perfil ->> 'instagram', '')), 120),
           'destaque', left(trim(coalesce(v_perfil ->> 'destaque', '')), 280)
         ),
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb) to authenticated;

create or replace function public.atualizar_recebimento_central_vendedor(
  p_metodo text,
  p_titular text,
  p_referencia text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_metodo text := trim(coalesce(p_metodo, ''));
  v_titular text := trim(coalesce(p_titular, ''));
  v_referencia text := trim(coalesce(p_referencia, ''));
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de guardar os dados de recebimento.' using errcode = '42501';
  end if;
  if v_metodo not in ('transferencia_bancaria', 'multicaixa_express', 'outro')
     or char_length(v_titular) not between 2 and 160
     or char_length(v_referencia) not between 3 and 160 then
    raise exception 'Dados de recebimento inválidos.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vendedores
    where id = v_uid and status = 'aprovado' and ativo = true
  ) then
    raise exception 'A loja precisa estar aprovada e ativa para gerir recebimentos.' using errcode = '42501';
  end if;

  update public.vendedores
     set dados_recebimento = jsonb_build_object(
           'metodo', v_metodo,
           'titular', v_titular,
           'referencia', v_referencia,
           'atualizadoEm', now()
         ),
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_recebimento_central_vendedor(text, text, text) from public, anon;
grant execute on function public.atualizar_recebimento_central_vendedor(text, text, text) to authenticated;

-- Motivos tornam uma recusa acionável para o vendedor e para o administrador.
alter table public.vendedores
  add column if not exists motivo_recusa text;

alter table public.produtos
  add column if not exists motivo_recusa text;

-- O vendedor pode ocultar temporariamente um produto já aprovado, mas não
-- consegue alterar a aprovação, o proprietário ou qualquer valor financeiro.
create or replace function public.definir_disponibilidade_produto_vendedor(
  p_produto_id text,
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_produto_id text := trim(coalesce(p_produto_id, ''));
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de gerir produtos.' using errcode = '42501';
  end if;
  if v_produto_id = '' then
    raise exception 'Produto inválido.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vendedores
    where id = v_uid and status = 'aprovado' and ativo = true
  ) then
    raise exception 'A loja precisa estar aprovada e ativa para gerir produtos.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.produtos
    where id = v_produto_id and vendedor_id = v_uid and status_aprovacao = 'aprovado'
  ) then
    raise exception 'Produto não encontrado, não aprovado ou sem permissão.' using errcode = '42501';
  end if;

  update public.produtos
     set ativo = coalesce(p_ativo, false),
         atualizado_em = now()
   where id = v_produto_id and vendedor_id = v_uid;

  return jsonb_build_object('ok', true, 'ativo', coalesce(p_ativo, false));
end;
$$;

revoke all on function public.definir_disponibilidade_produto_vendedor(text, boolean) from public, anon;
grant execute on function public.definir_disponibilidade_produto_vendedor(text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
