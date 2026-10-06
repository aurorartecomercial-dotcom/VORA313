-- VORA 313 — Dashboard operacional do vendedor.
-- Usa somente dados reais já existentes no marketplace.
-- Não cria métricas fictícias nem expõe a tabela de tracking diretamente.
begin;

create or replace function public.dashboard_operacional_vendedor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_vendas bigint := 0;
  v_pedidos_total bigint := 0;
  v_pedidos_pendentes bigint := 0;
  v_receita numeric(14,2) := 0;
  v_produtos_total bigint := 0;
  v_produtos_ativos bigint := 0;
  v_produtos_ocultos bigint := 0;
  v_produtos_sem_estoque bigint := 0;
  v_produtos_aprovacao bigint := 0;
  v_avaliacoes_total bigint := 0;
  v_avaliacao_media numeric(5,2) := 0;
  v_visualizacoes bigint := 0;
  v_top_vendidos jsonb := '[]'::jsonb;
  v_top_vistos jsonb := '[]'::jsonb;
  v_pedidos_status jsonb := '[]'::jsonb;
  v_avaliacoes_recentes jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Inicie sessão para consultar o dashboard do vendedor.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Conta de vendedor não encontrada.' using errcode = '42501';
  end if;

  select count(*) into v_produtos_total
  from public.produtos
  where vendedor_id = v_uid;

  select count(*) into v_produtos_ativos
  from public.produtos
  where vendedor_id = v_uid
    and status_aprovacao = 'aprovado'
    and ativo = true;

  select count(*) into v_produtos_ocultos
  from public.produtos
  where vendedor_id = v_uid
    and status_aprovacao = 'aprovado'
    and ativo = false;

  select count(*) into v_produtos_sem_estoque
  from public.produtos
  where vendedor_id = v_uid
    and status_aprovacao = 'aprovado'
    and ativo = true
    and estoque <= 0;

  select count(*) into v_produtos_aprovacao
  from public.produtos
  where vendedor_id = v_uid
    and status_aprovacao = 'aguardando_aprovacao';

  select
    count(*) filter (where vv.status in ('pago','em_preparacao','enviado','entregue')),
    count(*),
    count(*) filter (where vv.status in ('pago','em_preparacao','enviado')),
    coalesce(sum(vv.valor_vendedor) filter (where vv.status in ('pago','em_preparacao','enviado','entregue') and vv.financeiro_status <> 'cancelado'), 0)
  into v_vendas, v_pedidos_total, v_pedidos_pendentes, v_receita
  from public.vendas_vendedor vv
  where vv.uid_vendedor = v_uid;

  select count(*) into v_avaliacoes_total
  from public.avaliacoes_vendedores
  where vendedor_id = v_uid and verificada = true;

  select coalesce(round(avg(nota)::numeric, 2), 0)
  into v_avaliacao_media
  from public.avaliacoes_vendedores
  where vendedor_id = v_uid and verificada = true;

  select count(*) into v_visualizacoes
  from public.produto_visualizacoes_unicas pv
  join public.produtos p on p.id = pv.produto_id
  where p.vendedor_id = v_uid;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.quantidade_vendida desc, x.nome asc), '[]'::jsonb)
  into v_top_vendidos
  from (
    select
      vi.produto_id,
      max(vi.nome) as nome,
      sum(vi.quantidade)::bigint as quantidade_vendida,
      round(sum(vi.valor_vendedor), 2) as receita
    from public.venda_itens vi
    join public.vendas v on v.id = vi.venda_id
    where vi.vendedor_id = v_uid
      and v.status in ('pago','em_preparacao','enviado','entregue')
    group by vi.produto_id
    order by quantidade_vendida desc, max(vi.nome) asc
    limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visualizacoes desc, x.nome asc), '[]'::jsonb)
  into v_top_vistos
  from (
    select
      pv.produto_id,
      p.nome,
      count(*)::bigint as visualizacoes
    from public.produto_visualizacoes_unicas pv
    join public.produtos p on p.id = pv.produto_id
    where p.vendedor_id = v_uid
    group by pv.produto_id, p.nome
    order by visualizacoes desc, p.nome asc
    limit 5
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordem), '[]'::jsonb)
  into v_pedidos_status
  from (
    select 'aguardando_pagamento'::text as status, count(*)::bigint as quantidade, 1 as ordem
    from public.vendas_vendedor where uid_vendedor = v_uid and status = 'aguardando_pagamento'
    union all
    select 'pago', count(*), 2 from public.vendas_vendedor where uid_vendedor = v_uid and status = 'pago'
    union all
    select 'em_preparacao', count(*), 3 from public.vendas_vendedor where uid_vendedor = v_uid and status = 'em_preparacao'
    union all
    select 'enviado', count(*), 4 from public.vendas_vendedor where uid_vendedor = v_uid and status = 'enviado'
    union all
    select 'entregue', count(*), 5 from public.vendas_vendedor where uid_vendedor = v_uid and status = 'entregue'
    union all
    select 'cancelado', count(*), 6 from public.vendas_vendedor where uid_vendedor = v_uid and status = 'cancelado'
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc), '[]'::jsonb)
  into v_avaliacoes_recentes
  from (
    select nota, comentario, data
    from public.avaliacoes_vendedores
    where vendedor_id = v_uid and verificada = true
    order by data desc
    limit 5
  ) x;

  v_alertas := '[]'::jsonb;
  if v_pedidos_pendentes > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo','pedidos','nivel','atencao','titulo','Há pedidos a acompanhar',
      'descricao','Existem pedidos que ainda não foram concluídos.',
      'quantidade',v_pedidos_pendentes,'acao','pedidos'
    ));
  end if;
  if v_produtos_sem_estoque > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo','estoque','nivel','urgente','titulo','Produtos sem estoque',
      'descricao','Produtos publicados estão sem unidades disponíveis.',
      'quantidade',v_produtos_sem_estoque,'acao','produtos'
    ));
  end if;
  if v_produtos_ocultos > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo','catalogo','nivel','atencao','titulo','Produtos ocultos',
      'descricao','Produtos aprovados estão temporariamente fora da loja pública.',
      'quantidade',v_produtos_ocultos,'acao','produtos'
    ));
  end if;
  if v_produtos_aprovacao > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo','aprovacao','nivel','informacao','titulo','Produtos aguardando aprovação',
      'descricao','A equipa VORA 313 ainda precisa concluir a revisão.',
      'quantidade',v_produtos_aprovacao,'acao','produtos'
    ));
  end if;
  if v_avaliacoes_total = 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo','avaliacoes','nivel','informacao','titulo','Ainda sem avaliações',
      'descricao','As avaliações aparecem aqui somente depois de compras verificadas.',
      'quantidade',0,'acao','loja'
    ));
  end if;

  return jsonb_build_object(
    'vendedor_id', v_uid,
    'gerado_em', now(),
    'kpis', jsonb_build_object(
      'vendas', v_vendas,
      'pedidos_total', v_pedidos_total,
      'pedidos_pendentes', v_pedidos_pendentes,
      'receita', round(v_receita, 2),
      'produtos_total', v_produtos_total,
      'produtos_ativos', v_produtos_ativos,
      'produtos_ocultos', v_produtos_ocultos,
      'produtos_sem_estoque', v_produtos_sem_estoque,
      'produtos_aprovacao', v_produtos_aprovacao,
      'avaliacoes_total', v_avaliacoes_total,
      'avaliacao_media', v_avaliacao_media,
      'visualizacoes_produtos', v_visualizacoes
    ),
    'pedidos_por_status', v_pedidos_status,
    'produtos_mais_vendidos', v_top_vendidos,
    'produtos_mais_vistos', v_top_vistos,
    'avaliacoes_recentes', v_avaliacoes_recentes,
    'alertas', v_alertas
  );
end;
$$;

revoke all on function public.dashboard_operacional_vendedor() from public, anon, authenticated;
grant execute on function public.dashboard_operacional_vendedor() to authenticated;

notify pgrst, 'reload schema';
commit;
