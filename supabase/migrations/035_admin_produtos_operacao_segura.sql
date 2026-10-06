-- VORA 313 — operações administrativas seguras sobre produtos de vendedores.
-- Ocultar/reativar preserva histórico; eliminação física continua centralizada
-- na migration 028 e é bloqueada quando o produto já pertence a pedidos.
begin;

create or replace function public.administrar_produto_vendedor(
  p_produto_id text,
  p_acao text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto public.produtos%rowtype;
  v_vendedor public.vendedores%rowtype;
  v_acao text := lower(trim(coalesce(p_acao, '')));
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  if v_acao not in ('ocultar', 'reativar') then
    raise exception 'Ação administrativa de produto inválida.' using errcode = '22023';
  end if;

  select * into v_produto
    from public.produtos
   where id = p_produto_id
     and vendedor_id is not null
   for update;

  if not found then
    raise exception 'Produto de vendedor não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_vendedor
    from public.vendedores
   where id = v_produto.vendedor_id;

  if v_acao = 'reativar' then
    if v_produto.status_aprovacao <> 'aprovado' then
      raise exception 'O produto precisa estar aprovado antes de ser reativado.' using errcode = '23514';
    end if;
    if not found or v_vendedor.status <> 'aprovado' or v_vendedor.ativo is not true then
      raise exception 'O vendedor precisa estar aprovado e ativo antes de reativar o produto.' using errcode = '23514';
    end if;
  end if;

  update public.produtos
     set ativo = (v_acao = 'reativar'),
         vendedor_ativo = case when v_acao = 'reativar' then coalesce(v_vendedor.ativo, false) else false end,
         atualizado_em = now()
   where id = v_produto.id;

  if to_regclass('public.eventos_seguranca') is not null then
    insert into public.eventos_seguranca (categoria, evento, actor_id, alvo, detalhes)
    values (
      'vendedor',
      case when v_acao = 'ocultar' then 'produto_ocultado_admin' else 'produto_reativado_admin' end,
      auth.uid(),
      v_produto.id,
      jsonb_build_object('acao', v_acao, 'vendedorId', v_produto.vendedor_id)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'produtoId', v_produto.id,
    'acao', v_acao,
    'ativo', v_acao = 'reativar'
  );
end;
$$;

revoke all on function public.administrar_produto_vendedor(text, text) from public, anon, authenticated;
grant execute on function public.administrar_produto_vendedor(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
