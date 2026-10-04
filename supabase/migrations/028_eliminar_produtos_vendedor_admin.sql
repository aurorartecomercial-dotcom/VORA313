-- VORA 313 — remoção administrativa segura de anúncios de vendedores.
-- Produtos que já pertencem a pedidos nunca são apagados: a fatura, o
-- pagamento e o histórico da compra precisam continuar íntegros.
begin;

create or replace function public.eliminar_produto_vendedor_admin(
  p_produto_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto public.produtos%rowtype;
  v_pedidos integer := 0;
  v_restantes integer := 0;
begin
  select * into v_produto
    from public.produtos
   where id = p_produto_id
   for update;

  if not found or v_produto.vendedor_id is null then
    raise exception 'Produto de vendedor não encontrado.' using errcode = 'P0002';
  end if;

  select count(*) into v_pedidos
    from public.venda_itens
   where produto_id = v_produto.id;

  if v_pedidos > 0 then
    raise exception 'Este produto já pertence a % pedido(s) e não pode ser apagado. Suspenda a loja ou desative o anúncio para preservar o histórico.', v_pedidos
      using errcode = '23503';
  end if;

  -- A revisão é removida antes do anúncio porque a FK de moderação é RESTRICT.
  delete from public.moderacoes_produtos where produto_id = v_produto.id;
  delete from public.produtos where id = v_produto.id;

  select count(*) into v_restantes
    from public.produtos
   where vendedor_id = v_produto.vendedor_id;

  update public.vendedores
     set total_produtos = v_restantes,
         perfil_publico = case
           when coalesce(perfil_publico ->> 'editorialProdutoId', '') = v_produto.id
             then jsonb_set(coalesce(perfil_publico, '{}'::jsonb), '{editorialProdutoId}', '""'::jsonb, true)
           else perfil_publico
         end,
         atualizado_em = now()
   where id = v_produto.vendedor_id;

  return jsonb_build_object(
    'ok', true,
    'produtoId', v_produto.id,
    'nome', v_produto.nome,
    'vendedorId', v_produto.vendedor_id,
    'restantes', v_restantes
  );
end;
$$;

create or replace function public.eliminar_catalogo_vendedor_admin(
  p_vendedor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_com_pedidos integer := 0;
  v_editorial_id text := '';
begin
  perform 1 from public.vendedores where id = p_vendedor_id for update;
  if not found then
    raise exception 'Vendedor não encontrado.' using errcode = 'P0002';
  end if;

  select count(*) into v_total
    from public.produtos
   where vendedor_id = p_vendedor_id;

  if v_total = 0 then
    return jsonb_build_object('ok', true, 'eliminados', 0, 'vendedorId', p_vendedor_id);
  end if;

  select count(*) into v_com_pedidos
    from public.venda_itens vi
    join public.produtos p on p.id = vi.produto_id
   where p.vendedor_id = p_vendedor_id;

  if v_com_pedidos > 0 then
    raise exception 'O catálogo contém % produto(s) em pedidos. Nada foi apagado para preservar vendas, pagamentos e faturas. Suspenda a loja para ocultar os anúncios.', v_com_pedidos
      using errcode = '23503';
  end if;

  select coalesce(perfil_publico ->> 'editorialProdutoId', '') into v_editorial_id
    from public.vendedores
   where id = p_vendedor_id;

  delete from public.moderacoes_produtos
   where produto_id in (select id from public.produtos where vendedor_id = p_vendedor_id);

  delete from public.produtos where vendedor_id = p_vendedor_id;

  update public.vendedores
     set total_produtos = 0,
         perfil_publico = case
           when v_editorial_id <> '' then jsonb_set(coalesce(perfil_publico, '{}'::jsonb), '{editorialProdutoId}', '""'::jsonb, true)
           else perfil_publico
         end,
         atualizado_em = now()
   where id = p_vendedor_id;

  return jsonb_build_object('ok', true, 'eliminados', v_total, 'vendedorId', p_vendedor_id);
end;
$$;

revoke all on function public.eliminar_produto_vendedor_admin(text) from public, anon, authenticated;
revoke all on function public.eliminar_catalogo_vendedor_admin(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_produto_vendedor_admin(text) to service_role;
grant execute on function public.eliminar_catalogo_vendedor_admin(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
