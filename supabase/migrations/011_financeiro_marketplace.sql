-- VORA 313 — financeiro de marketplace: saldos protegidos, pós-venda e auditoria.
-- Execute depois de 010_production_safety.sql e publique novamente a Edge Function api.
-- Esta migration não move saldo histórico: valores que já estavam disponíveis
-- permanecem disponíveis. Somente novas vendas usam o ciclo pendente > disponível.

begin;

-- 1) Quatro estados explícitos para o dinheiro do vendedor e uma exceção de dívida.
alter table public.vendedores
  add column if not exists saldo_pendente numeric(14,2) not null default 0,
  add column if not exists saldo_pago numeric(14,2) not null default 0,
  add column if not exists saldo_devedor numeric(14,2) not null default 0;

alter table public.vendas
  add column if not exists entregue_em timestamptz,
  add column if not exists pos_venda_status text not null default 'sem_ocorrencia',
  add column if not exists reembolsado_em timestamptz;

alter table public.vendas_vendedor
  add column if not exists financeiro_status text not null default 'pendente',
  add column if not exists liberavel_em timestamptz,
  add column if not exists liberado_em timestamptz,
  add column if not exists disputa_id uuid,
  add column if not exists valor_bloqueado numeric(14,2) not null default 0,
  add column if not exists valor_devedor numeric(14,2) not null default 0;

alter table public.movimentos_vendedores
  add column if not exists detalhes jsonb not null default '{}'::jsonb;

alter table public.levantamentos
  add column if not exists nota_admin text,
  add column if not exists comprovativo_url text,
  add column if not exists processado_por uuid references auth.users(id) on delete set null;

-- A informação de pós-venda não substitui a linha normal de entrega do pedido.
-- Assim o rastreio continua simples e a ocorrência financeira fica auditável.
alter table public.vendas drop constraint if exists vendas_pos_venda_status_check;
alter table public.vendas add constraint vendas_pos_venda_status_check
  check (pos_venda_status in (
    'sem_ocorrencia', 'reembolso_solicitado', 'em_disputa',
    'devolucao_em_transito', 'reembolsado', 'encerrado'
  ));

alter table public.vendas_vendedor drop constraint if exists vendas_vendedor_financeiro_status_check;
alter table public.vendas_vendedor add constraint vendas_vendedor_financeiro_status_check
  check (financeiro_status in ('pendente', 'retido', 'disponivel', 'reembolsado', 'cancelado'));

-- Os pedidos antigos já foram liquidados pela regra anterior. Não devem ser
-- bloqueados de surpresa quando a migration for aplicada.
update public.vendas_vendedor
set financeiro_status = 'disponivel'
where financeiro_status = 'pendente'
  and status in ('pago', 'em_preparacao', 'enviado', 'entregue');

update public.vendas_vendedor
set financeiro_status = 'cancelado'
where financeiro_status = 'pendente'
  and status = 'cancelado';

update public.vendas
set entregue_em = coalesce(entregue_em, atualizado_em, criado_em)
where status = 'entregue' and entregue_em is null;

-- A área administrativa pode continuar a gerir a loja, mas nenhum navegador,
-- nem mesmo uma sessão de admin, consegue alterar saldos diretamente.
create or replace function public.protect_vendedor_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.saldo_disponivel := 0;
      new.saldo_retido := 0;
      new.saldo_pendente := 0;
      new.saldo_pago := 0;
      new.saldo_devedor := 0;
      new.total_vendas := 0;
      new.total_produtos := 0;
      new.dados_recebimento := null;
    else
      new.saldo_disponivel := old.saldo_disponivel;
      new.saldo_retido := old.saldo_retido;
      new.saldo_pendente := old.saldo_pendente;
      new.saldo_pago := old.saldo_pago;
      new.saldo_devedor := old.saldo_devedor;
      new.total_vendas := old.total_vendas;
      new.total_produtos := old.total_produtos;
    end if;
  end if;

  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pendente';
      new.ativo := false;
      new.plano := 'basico';
    else
      new.status := old.status;
      new.ativo := old.ativo;
      new.plano := old.plano;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_vendedor_financial_fields on public.vendedores;
create trigger protect_vendedor_financial_fields
before insert or update on public.vendedores
for each row execute procedure public.protect_vendedor_financial_fields();

-- Uma disputa guarda a decisão e as provas sem apagar a história do pedido.
create table if not exists public.disputas_vendas (
  id uuid primary key default gen_random_uuid(),
  venda_id text not null references public.vendas(id) on delete restrict,
  codigo_rastreio text not null,
  uid_cliente uuid not null references auth.users(id) on delete restrict,
  status text not null default 'aberta'
    check (status in ('aberta', 'aguardando_provas', 'resolvida_cliente', 'resolvida_vendedor', 'cancelada')),
  motivo text not null,
  descricao text,
  decisao text,
  resolvida_por uuid references auth.users(id) on delete set null,
  resolvida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists uq_disputa_ativa_por_venda
on public.disputas_vendas(venda_id)
where status in ('aberta', 'aguardando_provas');

create index if not exists idx_disputas_venda on public.disputas_vendas(venda_id);
create index if not exists idx_vendas_vendedor_liberacao
on public.vendas_vendedor(financeiro_status, liberavel_em)
where financeiro_status = 'pendente';

alter table public.disputas_vendas enable row level security;

drop policy if exists disputas_cliente_vendedor_admin_select on public.disputas_vendas;
create policy disputas_cliente_vendedor_admin_select on public.disputas_vendas
for select to authenticated
using (
  uid_cliente = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.venda_itens i
    where i.venda_id = disputas_vendas.venda_id and i.vendedor_id = auth.uid()
  )
);

-- O pedido pago cria uma provisão, não dinheiro disponível. A entrega cria a
-- data de liberação; um job/admin libera somente após 72 horas sem ocorrência.
create or replace function public.atualizar_estado_pedido(p_codigo text, p_novo_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido public.vendas%rowtype;
  item public.venda_itens%rowtype;
  vendedor_linha record;
  vendedor_conta public.vendedores%rowtype;
  produto_atualizado text;
  cupom_atualizado text;
  pontos_ganhos integer;
  monetizacao_atualizada jsonb;
  valor_bloqueado numeric(14,2);
  valor_debito numeric(14,2);
  agora timestamptz := now();
begin
  select * into pedido
  from public.vendas
  where codigo_rastreio = upper(trim(p_codigo))
  for update;

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_novo_status not in ('aguardando_pagamento', 'pago', 'em_preparacao', 'enviado', 'entregue', 'cancelado') then
    raise exception 'Estado inválido.';
  end if;
  if pedido.status = p_novo_status then
    return jsonb_build_object('codigoRastreio', pedido.codigo_rastreio, 'status', pedido.status, 'idempotente', true);
  end if;
  if not (
    (pedido.status = 'aguardando_pagamento' and p_novo_status in ('pago', 'cancelado')) or
    (pedido.status = 'pago' and p_novo_status in ('em_preparacao', 'enviado', 'cancelado')) or
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
      set estoque = estoque - item.quantidade, atualizado_em = agora
      where id = item.produto_id and estoque >= item.quantidade
      returning id into produto_atualizado;
      if produto_atualizado is null then raise exception 'Estoque insuficiente para %.', item.nome; end if;
    end loop;

    if coalesce(pedido.cupom_aplicado ->> 'codigo', '') <> '' then
      cupom_atualizado := null;
      update public.cupons
      set usos = usos + 1, atualizado_em = agora
      where codigo = pedido.cupom_aplicado ->> 'codigo'
        and ativo = true and (validade is null or validade >= agora)
        and (max_usos is null or usos < max_usos)
      returning id into cupom_atualizado;
      if cupom_atualizado is null then raise exception 'O cupom do pedido não está disponível.'; end if;
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
      'provisionada'
    ) on conflict (pedido_id) do nothing;

    for vendedor_linha in
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
        comissao_vora, valor_vendedor, status, detalhes
      ) values (
        vendedor_linha.vendedor_id, pedido.id, pedido.codigo_rastreio, 'venda_pendente',
        vendedor_linha.valor_venda, vendedor_linha.comissao_vora, vendedor_linha.valor_vendedor,
        'pendente', jsonb_build_object('motivo', 'Pagamento confirmado; aguarda entrega e prazo de segurança.')
      );

      insert into public.vendas_vendedor (
        id, uid_vendedor, pedido_id, codigo_rastreio, status, financeiro_status,
        valor_venda, comissao_vora, valor_vendedor, produtos_resumo, atualizado_em
      ) values (
        vendedor_linha.vendedor_id::text || '_' || pedido.id, vendedor_linha.vendedor_id, pedido.id,
        pedido.codigo_rastreio, 'pago', 'pendente', vendedor_linha.valor_venda,
        vendedor_linha.comissao_vora, vendedor_linha.valor_vendedor,
        vendedor_linha.produtos_resumo, agora
      ) on conflict (id) do nothing;

      update public.vendedores
      set saldo_pendente = saldo_pendente + vendedor_linha.valor_vendedor,
          total_vendas = total_vendas + 1,
          atualizado_em = agora
      where id = vendedor_linha.vendedor_id;
    end loop;

    pontos_ganhos := floor(coalesce(pedido.valor_total, 0) / 1000);
    if pontos_ganhos > 0 then
      insert into public.fidelidade_movimentos (uid_cliente, tipo, pontos, descricao, pedido_id)
      values (pedido.uid_cliente, 'ganho', pontos_ganhos,
        'Compra ' || coalesce(pedido.numero_fatura, pedido.codigo_rastreio), pedido.id);
      update public.clientes
      set pontos = pontos + pontos_ganhos,
          historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'data', agora, 'tipo', 'ganho', 'pontos', pontos_ganhos,
            'descricao', 'Compra ' || coalesce(pedido.numero_fatura, pedido.codigo_rastreio)
          )), atualizado_em = agora
      where id = pedido.uid_cliente;
    end if;
  end if;

  if p_novo_status in ('em_preparacao', 'enviado') then
    update public.vendas_vendedor
    set status = p_novo_status, atualizado_em = agora
    where pedido_id = pedido.id and financeiro_status in ('pendente', 'retido');
  end if;

  if p_novo_status = 'entregue' then
    update public.vendas_vendedor
    set status = 'entregue',
        liberavel_em = coalesce(liberavel_em, agora + interval '72 hours'),
        atualizado_em = agora
    where pedido_id = pedido.id and financeiro_status = 'pendente';

    insert into public.movimentos_vendedores (
      uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
    )
    select uid_vendedor, pedido_id, codigo_rastreio, 'entrega_confirmada', 0, 'pendente',
      jsonb_build_object('liberavelEm', agora + interval '72 hours')
    from public.vendas_vendedor
    where pedido_id = pedido.id and financeiro_status = 'pendente';
  end if;

  -- Cancelamento antes da entrega devolve a provisão. Se existir saldo já
  -- liberado de legado, a diferença vira dívida e bloqueia novo levantamento.
  if p_novo_status = 'cancelado' and pedido.status in ('pago', 'em_preparacao') then
    for vendedor_linha in
      select * from public.vendas_vendedor
      where pedido_id = pedido.id and financeiro_status in ('pendente', 'disponivel')
      for update
    loop
      valor_bloqueado := 0;
      valor_debito := 0;
      if vendedor_linha.financeiro_status = 'pendente' then
        update public.vendedores
        set saldo_pendente = greatest(0, saldo_pendente - vendedor_linha.valor_vendedor), atualizado_em = agora
        where id = vendedor_linha.uid_vendedor;
      else
        select * into vendedor_conta from public.vendedores where id = vendedor_linha.uid_vendedor for update;
        valor_bloqueado := least(vendedor_linha.valor_vendedor, vendedor_conta.saldo_disponivel);
        valor_debito := vendedor_linha.valor_vendedor - valor_bloqueado;
        update public.vendedores
        set saldo_disponivel = saldo_disponivel - valor_bloqueado,
            saldo_devedor = saldo_devedor + valor_debito,
            atualizado_em = agora
        where id = vendedor_linha.uid_vendedor;
      end if;
      update public.vendas_vendedor
      set status = 'cancelado', financeiro_status = 'cancelado', atualizado_em = agora
      where id = vendedor_linha.id;
      insert into public.movimentos_vendedores (
        uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
      ) values (
        vendedor_linha.uid_vendedor, pedido.id, pedido.codigo_rastreio, 'cancelamento_reembolso',
        -vendedor_linha.valor_vendedor, 'concluido',
        jsonb_build_object('saldoRecuperado', valor_bloqueado, 'saldoDevedor', valor_debito)
      );
    end loop;
    update public.comissoes set status = 'estornada' where pedido_id = pedido.id;
  end if;

  monetizacao_atualizada := coalesce(pedido.monetizacao, '{}'::jsonb);
  if p_novo_status = 'pago' then
    monetizacao_atualizada := monetizacao_atualizada || jsonb_build_object(
      'comissaoGerada', true, 'comissaoGeradaEm', agora, 'financeiroStatus', 'provisionado'
    );
  end if;

  update public.vendas
  set status = p_novo_status,
      entregue_em = case when p_novo_status = 'entregue' then agora else entregue_em end,
      pagamento = coalesce(pagamento, '{}'::jsonb) || jsonb_build_object(
        'status', case when p_novo_status = 'pago' then 'confirmado' else coalesce(pagamento ->> 'status', 'pendente') end
      ),
      monetizacao = monetizacao_atualizada,
      atualizado_em = agora
  where id = pedido.id;

  insert into public.rastreios_publicos (codigo, status, atualizado_em)
  values (pedido.codigo_rastreio, p_novo_status, agora)
  on conflict (codigo) do update set status = excluded.status, atualizado_em = excluded.atualizado_em;

  return jsonb_build_object('codigoRastreio', pedido.codigo_rastreio, 'status', p_novo_status);
end;
$$;

revoke all on function public.atualizar_estado_pedido(text, text) from public, anon, authenticated;
grant execute on function public.atualizar_estado_pedido(text, text) to service_role;

-- Libera o saldo somente depois da data de segurança. Também compensa uma
-- eventual dívida antes de devolver dinheiro ao vendedor.
create or replace function public.liberar_saldos_vencidos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linha public.vendas_vendedor%rowtype;
  conta public.vendedores%rowtype;
  compensacao numeric(14,2);
  disponivel_liquido numeric(14,2);
  quantidade integer := 0;
  valor_liberado numeric(14,2) := 0;
  agora timestamptz := now();
begin
  for linha in
    select vv.*
    from public.vendas_vendedor vv
    join public.vendas v on v.id = vv.pedido_id
    where vv.financeiro_status = 'pendente'
      and vv.status = 'entregue'
      and vv.liberavel_em is not null
      and vv.liberavel_em <= agora
      and v.pos_venda_status in ('sem_ocorrencia', 'encerrado')
    for update of vv skip locked
  loop
    select * into conta from public.vendedores where id = linha.uid_vendedor for update;
    compensacao := least(linha.valor_vendedor, conta.saldo_devedor);
    disponivel_liquido := linha.valor_vendedor - compensacao;
    update public.vendedores
    set saldo_pendente = greatest(0, saldo_pendente - linha.valor_vendedor),
        saldo_devedor = greatest(0, saldo_devedor - compensacao),
        saldo_disponivel = saldo_disponivel + disponivel_liquido,
        atualizado_em = agora
    where id = linha.uid_vendedor;
    update public.vendas_vendedor
    set financeiro_status = 'disponivel', liberado_em = agora, atualizado_em = agora
    where id = linha.id;
    if not exists (
      select 1 from public.vendas_vendedor
      where pedido_id = linha.pedido_id and financeiro_status in ('pendente', 'retido')
    ) then
      update public.comissoes set status = 'gerada' where pedido_id = linha.pedido_id;
    end if;
    insert into public.movimentos_vendedores (
      uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_venda,
      comissao_vora, valor_vendedor, status, detalhes
    ) values (
      linha.uid_vendedor, linha.pedido_id, linha.codigo_rastreio, 'venda_liberada',
      linha.valor_venda, linha.comissao_vora, disponivel_liquido, 'disponivel',
      jsonb_build_object('valorOriginal', linha.valor_vendedor, 'compensacaoDivida', compensacao)
    );
    if compensacao > 0 then
      insert into public.movimentos_vendedores (
        uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
      ) values (
        linha.uid_vendedor, linha.pedido_id, linha.codigo_rastreio, 'compensacao_divida',
        -compensacao, 'concluido', jsonb_build_object('origem', 'saldo pendente liberado')
      );
    end if;
    quantidade := quantidade + 1;
    valor_liberado := valor_liberado + disponivel_liquido;
  end loop;
  return jsonb_build_object('ok', true, 'quantidade', quantidade, 'valorLiberado', valor_liberado);
end;
$$;

revoke all on function public.liberar_saldos_vencidos() from public, anon, authenticated;
grant execute on function public.liberar_saldos_vencidos() to service_role;

-- Reserva o saldo de cada vendedor para que uma reclamação nunca concorra com
-- levantamentos. Quando não houver saldo suficiente, registra uma dívida clara.
create or replace function public.abrir_disputa_financeira(
  p_codigo text,
  p_motivo text,
  p_descricao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido public.vendas%rowtype;
  linha public.vendas_vendedor%rowtype;
  conta public.vendedores%rowtype;
  nova_disputa_id uuid;
  valor_bloqueado numeric(14,2);
  valor_debito numeric(14,2);
  agora timestamptz := now();
begin
  select * into pedido from public.vendas
  where codigo_rastreio = upper(trim(p_codigo)) for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if pedido.status not in ('pago', 'em_preparacao', 'enviado', 'entregue') then
    raise exception 'Este pedido não possui pagamento elegível para disputa.';
  end if;
  if pedido.pos_venda_status <> 'sem_ocorrencia' then
    raise exception 'Este pedido já possui uma ocorrência de pós-venda.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo da disputa.'; end if;

  insert into public.disputas_vendas (venda_id, codigo_rastreio, uid_cliente, motivo, descricao)
  values (pedido.id, pedido.codigo_rastreio, pedido.uid_cliente, trim(p_motivo), nullif(trim(coalesce(p_descricao, '')), ''))
  returning id into nova_disputa_id;

  for linha in
    select * from public.vendas_vendedor
    where pedido_id = pedido.id and financeiro_status in ('pendente', 'disponivel')
    for update
  loop
    select * into conta from public.vendedores where id = linha.uid_vendedor for update;
    valor_bloqueado := 0;
    valor_debito := 0;
    if linha.financeiro_status = 'pendente' then
      valor_bloqueado := linha.valor_vendedor;
      update public.vendedores
      set saldo_pendente = greatest(0, saldo_pendente - valor_bloqueado),
          saldo_retido = saldo_retido + valor_bloqueado,
          atualizado_em = agora
      where id = linha.uid_vendedor;
    else
      valor_bloqueado := least(linha.valor_vendedor, conta.saldo_disponivel);
      valor_debito := linha.valor_vendedor - valor_bloqueado;
      update public.vendedores
      set saldo_disponivel = saldo_disponivel - valor_bloqueado,
          saldo_retido = saldo_retido + valor_bloqueado,
          saldo_devedor = saldo_devedor + valor_debito,
          atualizado_em = agora
      where id = linha.uid_vendedor;
    end if;
    update public.vendas_vendedor
    set financeiro_status = 'retido', disputa_id = nova_disputa_id,
        valor_bloqueado = valor_bloqueado, valor_devedor = valor_debito,
        atualizado_em = agora
    where id = linha.id;
    insert into public.movimentos_vendedores (
      uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
    ) values (
      linha.uid_vendedor, pedido.id, pedido.codigo_rastreio, 'disputa_aberta',
      -valor_bloqueado, 'retido', jsonb_build_object(
        'disputaId', nova_disputa_id, 'motivo', p_motivo,
        'valorBloqueado', valor_bloqueado, 'saldoDevedor', valor_debito
      )
    );
  end loop;

  update public.vendas
  set pos_venda_status = 'em_disputa', atualizado_em = agora
  where id = pedido.id;
  update public.comissoes set status = 'em_disputa' where pedido_id = pedido.id;
  return jsonb_build_object('ok', true, 'disputaId', nova_disputa_id);
end;
$$;

revoke all on function public.abrir_disputa_financeira(text, text, text) from public, anon, authenticated;
grant execute on function public.abrir_disputa_financeira(text, text, text) to service_role;

create or replace function public.resolver_disputa_financeira(
  p_disputa_id uuid,
  p_decisao text,
  p_resolvida_por uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  disputa public.disputas_vendas%rowtype;
  pedido public.vendas%rowtype;
  linha public.vendas_vendedor%rowtype;
  agora timestamptz := now();
begin
  if p_decisao not in ('reembolsar', 'liberar') then raise exception 'Decisão inválida.'; end if;
  select * into disputa from public.disputas_vendas where id = p_disputa_id for update;
  if not found then raise exception 'Disputa não encontrada.'; end if;
  if disputa.status not in ('aberta', 'aguardando_provas') then raise exception 'Esta disputa já foi resolvida.'; end if;
  select * into pedido from public.vendas where id = disputa.venda_id for update;

  for linha in
    select * from public.vendas_vendedor where disputa_id = disputa.id for update
  loop
    if p_decisao = 'liberar' then
      update public.vendedores
      set saldo_retido = greatest(0, saldo_retido - linha.valor_bloqueado),
          saldo_pendente = saldo_pendente + linha.valor_bloqueado,
          saldo_devedor = greatest(0, saldo_devedor - linha.valor_devedor),
          atualizado_em = agora
      where id = linha.uid_vendedor;
      update public.vendas_vendedor
      set financeiro_status = 'pendente', disputa_id = null,
          valor_bloqueado = 0, valor_devedor = 0, atualizado_em = agora
      where id = linha.id;
      insert into public.movimentos_vendedores (
        uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
      ) values (
        linha.uid_vendedor, linha.pedido_id, linha.codigo_rastreio, 'disputa_liberada',
        linha.valor_bloqueado, 'pendente', jsonb_build_object('disputaId', disputa.id, 'dividaPerdoada', linha.valor_devedor)
      );
    else
      update public.vendedores
      set saldo_retido = greatest(0, saldo_retido - linha.valor_bloqueado), atualizado_em = agora
      where id = linha.uid_vendedor;
      update public.vendas_vendedor
      set financeiro_status = 'reembolsado', atualizado_em = agora
      where id = linha.id;
      insert into public.movimentos_vendedores (
        uid_vendedor, pedido_id, codigo_rastreio, tipo, valor_vendedor, status, detalhes
      ) values (
        linha.uid_vendedor, linha.pedido_id, linha.codigo_rastreio, 'reembolso_aprovado',
        -linha.valor_vendedor, 'concluido', jsonb_build_object('disputaId', disputa.id, 'saldoDevedor', linha.valor_devedor)
      );
    end if;
  end loop;

  update public.disputas_vendas
  set status = case when p_decisao = 'reembolsar' then 'resolvida_cliente' else 'resolvida_vendedor' end,
      decisao = p_decisao, resolvida_por = p_resolvida_por, resolvida_em = agora, atualizado_em = agora
  where id = disputa.id;
  update public.vendas
  set pos_venda_status = case when p_decisao = 'reembolsar' then 'reembolsado' else 'encerrado' end,
      reembolsado_em = case when p_decisao = 'reembolsar' then agora else reembolsado_em end,
      atualizado_em = agora
  where id = pedido.id;
  update public.comissoes
  set status = case when p_decisao = 'reembolsar' then 'estornada' else 'gerada' end
  where pedido_id = pedido.id;
  return jsonb_build_object('ok', true, 'decisao', p_decisao);
end;
$$;

revoke all on function public.resolver_disputa_financeira(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.resolver_disputa_financeira(uuid, text, uuid) to service_role;

-- Levantamentos reservam saldo e deixam o recibo/nota anexados ao histórico.
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
  agora timestamptz := now();
begin
  select * into vendedor from public.vendedores where id = p_vendedor for update;
  if not found then raise exception 'Vendedor não encontrado.'; end if;
  if coalesce(vendedor.dados_recebimento ->> 'metodo', '') = ''
     or coalesce(vendedor.dados_recebimento ->> 'titular', '') = ''
     or coalesce(vendedor.dados_recebimento ->> 'referencia', '') = '' then
    raise exception 'Configure os dados de recebimento antes de solicitar um levantamento.';
  end if;
  if vendedor.saldo_devedor > 0 then
    raise exception 'Existe um saldo em regularização. Ele será compensado nas próximas vendas antes de um novo levantamento.';
  end if;
  valor_final := coalesce(p_valor, vendedor.saldo_disponivel);
  if valor_final < 5000 then raise exception 'O valor mínimo para levantamento é 5.000,00 Kz.'; end if;
  if valor_final > vendedor.saldo_disponivel then raise exception 'Valor de levantamento superior ao saldo disponível.'; end if;

  update public.vendedores
  set saldo_disponivel = saldo_disponivel - valor_final,
      saldo_retido = saldo_retido + valor_final,
      atualizado_em = agora
  where id = p_vendedor;
  insert into public.levantamentos (uid_vendedor, valor, status, dados_recebimento)
  values (p_vendedor, valor_final, 'pendente', vendedor.dados_recebimento)
  returning id into levantamento_id;
  insert into public.movimentos_vendedores (uid_vendedor, tipo, valor_vendedor, status, detalhes)
  values (p_vendedor, 'levantamento_solicitado', -valor_final, 'retido', jsonb_build_object('levantamentoId', levantamento_id));
  return jsonb_build_object('ok', true, 'levantamentoId', levantamento_id, 'valor', valor_final);
end;
$$;

revoke all on function public.solicitar_levantamento_atomico(uuid, numeric) from public, anon, authenticated;
grant execute on function public.solicitar_levantamento_atomico(uuid, numeric) to service_role;

-- Remove a assinatura anterior para chamadas com dois argumentos continuarem a
-- usar os parâmetros opcionais abaixo, sem ambiguidade no PostgreSQL.
drop function if exists public.processar_levantamento_atomico(uuid, text);
drop function if exists public.processar_levantamento_atomico(uuid, text, text, text);

create or replace function public.processar_levantamento_atomico(
  p_levantamento_id uuid,
  p_acao text,
  p_nota text default null,
  p_comprovativo_url text default null,
  p_processado_por uuid default null
)
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
    set saldo_retido = greatest(0, saldo_retido - levantamento.valor),
        saldo_pago = saldo_pago + levantamento.valor, atualizado_em = agora
    where id = levantamento.uid_vendedor;
    update public.levantamentos
    set status = 'pago', processado_em = agora, processado_por = p_processado_por,
        nota_admin = nullif(trim(coalesce(p_nota, '')), ''),
        comprovativo_url = nullif(trim(coalesce(p_comprovativo_url, '')), ''), atualizado_em = agora
    where id = levantamento.id;
    insert into public.movimentos_vendedores (uid_vendedor, tipo, valor_vendedor, status, detalhes)
    values (levantamento.uid_vendedor, 'levantamento_pago', -levantamento.valor, 'concluido',
      jsonb_build_object('levantamentoId', levantamento.id, 'comprovativoUrl', p_comprovativo_url));
  else
    update public.vendedores
    set saldo_retido = greatest(0, saldo_retido - levantamento.valor),
        saldo_disponivel = saldo_disponivel + levantamento.valor, atualizado_em = agora
    where id = levantamento.uid_vendedor;
    update public.levantamentos
    set status = 'recusado', processado_em = agora, processado_por = p_processado_por,
        nota_admin = nullif(trim(coalesce(p_nota, '')), ''), atualizado_em = agora
    where id = levantamento.id;
    insert into public.movimentos_vendedores (uid_vendedor, tipo, valor_vendedor, status, detalhes)
    values (levantamento.uid_vendedor, 'levantamento_recusado', levantamento.valor, 'disponivel',
      jsonb_build_object('levantamentoId', levantamento.id, 'nota', p_nota));
  end if;
  return jsonb_build_object('ok', true, 'status', case when p_acao = 'aprovar' then 'pago' else 'recusado' end);
end;
$$;

revoke all on function public.processar_levantamento_atomico(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.processar_levantamento_atomico(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
