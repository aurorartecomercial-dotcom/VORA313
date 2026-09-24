-- VORA 313 — proteções de produção: autorização, valores monetários e pedidos atómicos.
-- Execute depois de 009_admin_vendedores_vendas.sql.
begin;

-- O navegador nunca cria uma conta de vendedor diretamente. A Edge Function usa
-- a service role e continua apta a criar pedidos de candidatura pendentes.
drop policy if exists vendedores_insert_self on public.vendedores;

-- A proteção anterior cobria apenas UPDATE. Também normalizamos INSERT para
-- impedir promoção, crédito ou seleção de plano pela API pública.
create or replace function public.protect_vendedor_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pendente';
      new.ativo := false;
      new.plano := 'basico';
      new.saldo_disponivel := 0;
      new.saldo_retido := 0;
      new.total_vendas := 0;
      new.total_produtos := 0;
      new.dados_recebimento := null;
    else
      new.status := old.status;
      new.ativo := old.ativo;
      new.plano := old.plano;
      new.saldo_disponivel := old.saldo_disponivel;
      new.saldo_retido := old.saldo_retido;
      new.total_vendas := old.total_vendas;
      new.total_produtos := old.total_produtos;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_vendedor_financial_fields on public.vendedores;
create trigger protect_vendedor_financial_fields
before insert or update on public.vendedores
for each row execute procedure public.protect_vendedor_financial_fields();

-- Mesmo se um registo de cliente precisar ser recriado, pontos e histórico só
-- podem ser definidos pelo backend administrativo.
create or replace function public.protect_cliente_loyalty_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.pontos := 0;
      new.historico := '[]'::jsonb;
    else
      new.pontos := old.pontos;
      new.historico := old.historico;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_cliente_loyalty_fields on public.clientes;
create trigger protect_cliente_loyalty_fields
before insert or update on public.clientes
for each row execute procedure public.protect_cliente_loyalty_fields();

-- Valor numérico é a fonte de verdade para novos produtos. O campo textual é
-- mantido temporariamente para não quebrar a interface legada.
alter table public.produtos
  add column if not exists preco_valor numeric(14,2);

create or replace function public.parse_preco_kz(p_preco text)
returns numeric
language plpgsql
immutable
as $$
declare
  valor text;
begin
  valor := regexp_replace(coalesce(p_preco, ''), '[^0-9.,]', '', 'g');
  if valor !~ '^(?:[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)$' then
    return null;
  end if;
  return replace(replace(valor, '.', ''), ',', '.')::numeric;
end;
$$;

update public.produtos
set preco_valor = public.parse_preco_kz(preco)
where preco_valor is null;

create index if not exists idx_produtos_preco_valor on public.produtos(preco_valor);

grant select on public.produto_avaliacoes_resumo to anon, authenticated;

-- A mesma tentativa de checkout, repetida por uma falha de rede, precisa
-- devolver o mesmo pedido em vez de criar nova fatura.
alter table public.vendas
  add column if not exists idempotency_key text;

create unique index if not exists uq_vendas_cliente_idempotency
on public.vendas(uid_cliente, idempotency_key)
where idempotency_key is not null;

-- Inserir a venda, os itens e o rastreio no mesmo commit evita pedidos órfãos.
create or replace function public.criar_pedido_atomico(
  p_venda jsonb,
  p_itens jsonb,
  p_rastreio jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id text := p_venda ->> 'id';
begin
  if v_pedido_id is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido inválido.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as i(venda_id text)
    where i.venda_id is distinct from v_pedido_id
  ) then
    raise exception 'Itens não pertencem ao pedido.';
  end if;

  insert into public.vendas
  select * from jsonb_populate_record(null::public.vendas, p_venda);

  insert into public.venda_itens
  select * from jsonb_populate_recordset(null::public.venda_itens, p_itens);

  insert into public.rastreios_publicos
  select * from jsonb_populate_record(null::public.rastreios_publicos, p_rastreio)
  on conflict (codigo) do update
  set status = excluded.status,
      atualizado_em = excluded.atualizado_em;
end;
$$;

revoke all on function public.criar_pedido_atomico(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido_atomico(jsonb, jsonb, jsonb) to service_role;

-- Transição idempotente do pedido. O bloqueio da venda torna a confirmação de
-- pagamento, baixa de estoque, cupom, comissão e pontos uma única transação.
create or replace function public.atualizar_estado_pedido(p_codigo text, p_novo_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido public.vendas%rowtype;
  item public.venda_itens%rowtype;
  vendedor record;
  produto_atualizado text;
  cupom_atualizado text;
  pontos_ganhos integer;
  monetizacao_atualizada jsonb;
  agora timestamptz := now();
begin
  select * into pedido
  from public.vendas
  where codigo_rastreio = upper(trim(p_codigo))
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if p_novo_status not in ('aguardando_pagamento', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado') then
    raise exception 'Estado inválido.';
  end if;

  if pedido.status = p_novo_status then
    return jsonb_build_object('codigoRastreio', pedido.codigo_rastreio, 'status', pedido.status, 'idempotente', true);
  end if;

  if not (
    (pedido.status = 'aguardando_pagamento' and p_novo_status in ('pago', 'cancelado')) or
    (pedido.status = 'pago' and p_novo_status in ('em_preparacao', 'enviado')) or
    (pedido.status = 'em_preparacao' and p_novo_status in ('enviado', 'cancelado')) or
    (pedido.status = 'enviado' and p_novo_status = 'entregue')
  ) then
    raise exception 'Não é permitido mudar de % para %.', pedido.status, p_novo_status;
  end if;

  if p_novo_status = 'pago' then
    if pedido.expira_em is not null and pedido.expira_em < agora then
      raise exception 'Este pedido expirou. Crie um novo pedido.';
    end if;

    if not exists (select 1 from public.venda_itens where venda_id = pedido.id) then
      raise exception 'Pedido sem itens não pode ser confirmado.';
    end if;

    for item in select * from public.venda_itens where venda_id = pedido.id loop
      produto_atualizado := null;
      update public.produtos
      set estoque = estoque - item.quantidade,
          atualizado_em = agora
      where id = item.produto_id
        and estoque >= item.quantidade
      returning id into produto_atualizado;

      if produto_atualizado is null then
        raise exception 'Estoque insuficiente para %.', item.nome;
      end if;
    end loop;

    if coalesce(pedido.cupom_aplicado ->> 'codigo', '') <> '' then
      cupom_atualizado := null;
      update public.cupons
      set usos = usos + 1,
          atualizado_em = agora
      where codigo = pedido.cupom_aplicado ->> 'codigo'
        and ativo = true
        and (validade is null or validade >= agora)
        and (max_usos is null or usos < max_usos)
      returning id into cupom_atualizado;

      if cupom_atualizado is null then
        raise exception 'O cupom do pedido não está disponível.';
      end if;
    end if;

    insert into public.comissoes (
      id, pedido_id, codigo_rastreio, numero_fatura, uid_cliente, modelo,
      valor_venda_produtos, comissao_vora, receita_frete_vora, receita_total_vora, status
    ) values (
      pedido.id, pedido.id, pedido.codigo_rastreio, pedido.numero_fatura, pedido.uid_cliente,
      'comissao_por_venda', pedido.subtotal,
      coalesce((pedido.monetizacao ->> 'comissaoProdutos')::numeric, 0),
      pedido.frete,
      coalesce((pedido.monetizacao ->> 'receitaVora')::numeric, pedido.frete),
      'gerada'
    ) on conflict (pedido_id) do nothing;

    for vendedor in
      select vendedor_id,
             string_agg(nome || ' (x' || quantidade || ')', ', ') as produtos_resumo,
             sum(valor_bruto) as valor_venda,
             sum(comissao_vora) as comissao_vora,
             sum(valor_vendedor) as valor_vendedor
      from public.venda_itens
      where venda_id = pedido.id and vendedor_id is not null
      group by vendedor_id
    loop
      insert into public.movimentos_vendedores (
        uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_venda,
        comissao_vora, valor_vendedor, status
      ) values (
        vendedor.vendedor_id, pedido.id, pedido.codigo_rastreio, 'venda_paga',
        vendedor.valor_venda, vendedor.comissao_vora, vendedor.valor_vendedor, 'disponivel'
      );

      insert into public.vendas_vendedor (
        id, uid_vendedor, pedido_id, codigo_rastreio, status, valor_venda,
        comissao_vora, valor_vendedor, produtos_resumo, atualizado_em
      ) values (
        vendedor.vendedor_id::text || '_' || pedido.id, vendedor.vendedor_id, pedido.id,
        pedido.codigo_rastreio, 'pago', vendedor.valor_venda, vendedor.comissao_vora,
        vendedor.valor_vendedor, vendedor.produtos_resumo, agora
      ) on conflict (id) do update
      set status = excluded.status,
          valor_venda = excluded.valor_venda,
          comissao_vora = excluded.comissao_vora,
          valor_vendedor = excluded.valor_vendedor,
          produtos_resumo = excluded.produtos_resumo,
          atualizado_em = excluded.atualizado_em;

      update public.vendedores
      set saldo_disponivel = saldo_disponivel + vendedor.valor_vendedor,
          total_vendas = total_vendas + 1,
          atualizado_em = agora
      where id = vendedor.vendedor_id;
    end loop;

    pontos_ganhos := floor(coalesce(pedido.valor_total, 0) / 1000);
    if pontos_ganhos > 0 then
      insert into public.fidelidade_movimentos (uid_cliente, tipo, pontos, descricao, pedido_id)
      values (
        pedido.uid_cliente, 'ganho', pontos_ganhos,
        'Compra ' || coalesce(pedido.numero_fatura, pedido.codigo_rastreio), pedido.id
      );

      update public.clientes
      set pontos = pontos + pontos_ganhos,
          historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'data', agora,
            'tipo', 'ganho',
            'pontos', pontos_ganhos,
            'descricao', 'Compra ' || coalesce(pedido.numero_fatura, pedido.codigo_rastreio)
          )),
          atualizado_em = agora
      where id = pedido.uid_cliente;
    end if;
  end if;

  monetizacao_atualizada := coalesce(pedido.monetizacao, '{}'::jsonb);
  if p_novo_status = 'pago' then
    monetizacao_atualizada := monetizacao_atualizada || jsonb_build_object(
      'comissaoGerada', true,
      'comissaoGeradaEm', agora
    );
  end if;

  update public.vendas
  set status = p_novo_status,
      pagamento = coalesce(pagamento, '{}'::jsonb) || jsonb_build_object(
        'status', case when p_novo_status = 'pago' then 'confirmado' else coalesce(pagamento ->> 'status', 'pendente') end
      ),
      monetizacao = monetizacao_atualizada,
      atualizado_em = agora
  where id = pedido.id;

  insert into public.rastreios_publicos (codigo, status, atualizado_em)
  values (pedido.codigo_rastreio, p_novo_status, agora)
  on conflict (codigo) do update
  set status = excluded.status,
      atualizado_em = excluded.atualizado_em;

  return jsonb_build_object('codigoRastreio', pedido.codigo_rastreio, 'status', p_novo_status);
end;
$$;

revoke all on function public.atualizar_estado_pedido(text, text) from public, anon, authenticated;
grant execute on function public.atualizar_estado_pedido(text, text) to service_role;

-- Levantamentos também precisam reservar saldo numa transação para impedir que
-- dois pedidos concorrentes usem o mesmo montante disponível.
create or replace function public.solicitar_levantamento_atomico(p_vendedor uuid, p_valor numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  vendedor public.vendedores%rowtype;
  valor_final numeric(14,2);
  levantamento_id uuid;
begin
  select * into vendedor from public.vendedores where id = p_vendedor for update;
  if not found then raise exception 'Vendedor não encontrado.'; end if;
  if coalesce(vendedor.dados_recebimento ->> 'metodo', '') = ''
     or coalesce(vendedor.dados_recebimento ->> 'titular', '') = ''
     or coalesce(vendedor.dados_recebimento ->> 'referencia', '') = '' then
    raise exception 'Configure os dados de recebimento antes de solicitar um levantamento.';
  end if;

  valor_final := coalesce(p_valor, vendedor.saldo_disponivel);
  if valor_final <= 0 or valor_final > vendedor.saldo_disponivel then
    raise exception 'Valor de levantamento inválido ou superior ao saldo disponível.';
  end if;

  update public.vendedores
  set saldo_disponivel = saldo_disponivel - valor_final,
      saldo_retido = saldo_retido + valor_final,
      atualizado_em = now()
  where id = p_vendedor;

  insert into public.levantamentos (uid_vendedor, valor, status, dados_recebimento)
  values (p_vendedor, valor_final, 'pendente', vendedor.dados_recebimento)
  returning id into levantamento_id;

  return jsonb_build_object('ok', true, 'levantamentoId', levantamento_id, 'valor', valor_final);
end;
$$;

revoke all on function public.solicitar_levantamento_atomico(uuid, numeric) from public, anon, authenticated;
grant execute on function public.solicitar_levantamento_atomico(uuid, numeric) to service_role;

create or replace function public.processar_levantamento_atomico(p_levantamento_id uuid, p_acao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  levantamento public.levantamentos%rowtype;
  agora timestamptz := now();
begin
  select * into levantamento from public.levantamentos where id = p_levantamento_id for update;
  if not found then raise exception 'Levantamento não encontrado.'; end if;
  if levantamento.status <> 'pendente' then raise exception 'Levantamento já processado.'; end if;
  if p_acao not in ('aprovar', 'recusar') then raise exception 'Ação inválida.'; end if;

  if p_acao = 'aprovar' then
    update public.vendedores
    set saldo_retido = greatest(0, saldo_retido - levantamento.valor), atualizado_em = agora
    where id = levantamento.uid_vendedor;
    update public.levantamentos
    set status = 'pago', processado_em = agora, atualizado_em = agora
    where id = levantamento.id;
  else
    update public.vendedores
    set saldo_retido = greatest(0, saldo_retido - levantamento.valor),
        saldo_disponivel = saldo_disponivel + levantamento.valor,
        atualizado_em = agora
    where id = levantamento.uid_vendedor;
    update public.levantamentos
    set status = 'recusado', processado_em = agora, atualizado_em = agora
    where id = levantamento.id;
  end if;

  return jsonb_build_object('ok', true, 'status', case when p_acao = 'aprovar' then 'pago' else 'recusado' end);
end;
$$;

revoke all on function public.processar_levantamento_atomico(uuid, text) from public, anon, authenticated;
grant execute on function public.processar_levantamento_atomico(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
