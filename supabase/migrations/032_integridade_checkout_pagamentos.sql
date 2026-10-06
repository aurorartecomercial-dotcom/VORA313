-- VORA 313 — integridade adicional do checkout e pagamentos.
-- Esta migration NÃO altera gateway, credenciais ou confirmação automática.
-- Ela centraliza a criação do pagamento, impede pagamentos ativos concorrentes
-- para o mesmo pedido e valida a consistência pedido <-> pagamento.

begin;

-- Um pagamento deve nascer com os mesmos dados financeiros do pedido.
create or replace function public.validar_pagamento_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido public.vendas%rowtype;
begin
  select * into pedido
  from public.vendas
  where id = new.venda_id;

  if not found then
    raise exception 'Pedido do pagamento não encontrado.';
  end if;

  if new.uid_cliente <> pedido.uid_cliente then
    raise exception 'O cliente do pagamento não corresponde ao pedido.';
  end if;

  if new.codigo_rastreio <> pedido.codigo_rastreio then
    raise exception 'O código de rastreio do pagamento não corresponde ao pedido.';
  end if;

  if new.numero_fatura <> pedido.numero_fatura then
    raise exception 'A fatura do pagamento não corresponde ao pedido.';
  end if;

  if new.moeda <> 'AOA' then
    raise exception 'Moeda de pagamento inválida.';
  end if;

  if new.valor <> pedido.valor_total then
    raise exception 'O valor do pagamento não corresponde ao total do pedido.';
  end if;

  return new;
end;
$$;

drop trigger if exists pagamentos_validar_pedido on public.pagamentos;
create trigger pagamentos_validar_pedido
before insert or update of venda_id, uid_cliente, codigo_rastreio, numero_fatura, valor, moeda
on public.pagamentos
for each row execute procedure public.validar_pagamento_pedido();

-- Se um pedido ainda não pago for cancelado, as tentativas de pagamento
-- pendentes também passam a canceladas. Pagamentos já confirmados não são
-- alterados: cancelamento após pagamento exige o fluxo de reembolso existente.
create or replace function public.sincronizar_cancelamento_pagamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelado' and old.status = 'aguardando_pagamento' then
    update public.pagamentos
    set status = 'cancelado',
        atualizado_em = now()
    where venda_id = new.id
      and status in ('criado', 'aguarda_cliente', 'aguarda_comprovativo', 'processando');
  end if;
  return new;
end;
$$;

drop trigger if exists vendas_sincronizar_cancelamento_pagamento on public.vendas;
create trigger vendas_sincronizar_cancelamento_pagamento
after update of status on public.vendas
for each row execute procedure public.sincronizar_cancelamento_pagamento();

-- Cria ou reutiliza a tentativa de pagamento dentro de uma única transação.
-- O bloqueio FOR UPDATE no pedido é a proteção principal contra dois cliques
-- simultâneos com chaves de idempotência diferentes.
create or replace function public.iniciar_pagamento_vora(
  p_venda_id text,
  p_uid_cliente uuid,
  p_metodo text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido public.vendas%rowtype;
  pagamento public.pagamentos%rowtype;
  agora timestamptz := now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Criação de pagamento restrita ao serviço.';
  end if;

  if p_metodo not in ('multicaixa_express', 'multicaixa_referencia', 'cartao', 'transferencia_manual') then
    raise exception 'Método de pagamento inválido.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16
     or length(trim(p_idempotency_key)) > 128
     or trim(p_idempotency_key) !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Chave de pagamento inválida.';
  end if;

  select * into pedido
  from public.vendas
  where id = p_venda_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if pedido.uid_cliente <> p_uid_cliente then
    raise exception 'O pedido não pertence ao cliente informado.';
  end if;

  if pedido.status <> 'aguardando_pagamento' then
    raise exception 'Este pedido já não está disponível para pagamento.';
  end if;

  if pedido.expira_em is not null and pedido.expira_em < agora then
    raise exception 'Este pedido expirou. Crie um novo pedido.';
  end if;

  -- Primeiro respeita exatamente a chave recebida: repetir a mesma operação
  -- devolve o mesmo registo, sem criar outro pagamento.
  select * into pagamento
  from public.pagamentos
  where venda_id = pedido.id
    and idempotency_key = trim(p_idempotency_key)
  order by criado_em desc
  limit 1
  for update;

  if found then
    return jsonb_build_object('ok', true, 'idempotente', true, 'pagamento', to_jsonb(pagamento));
  end if;

  -- Depois procura uma tentativa ainda ativa do mesmo pedido. Assim, dois
  -- cliques com chaves diferentes não criam duas cobranças/tentativas ativas.
  select * into pagamento
  from public.pagamentos
  where venda_id = pedido.id
    and status in ('criado', 'aguarda_cliente', 'aguarda_comprovativo', 'processando')
  order by criado_em desc
  limit 1
  for update;

  if found then
    if pagamento.metodo <> p_metodo then
      raise exception 'Já existe uma tentativa de pagamento ativa para este pedido.';
    end if;
    return jsonb_build_object('ok', true, 'idempotente', true, 'pagamento', to_jsonb(pagamento));
  end if;

  insert into public.pagamentos (
    venda_id, uid_cliente, codigo_rastreio, numero_fatura, valor, moeda,
    metodo, provedor, referencia, status, expira_em, idempotency_key, metadados
  ) values (
    pedido.id, pedido.uid_cliente, pedido.codigo_rastreio, pedido.numero_fatura,
    pedido.valor_total, 'AOA', p_metodo, 'manual', pedido.numero_fatura,
    'aguarda_comprovativo', pedido.expira_em, trim(p_idempotency_key),
    jsonb_build_object('criadoVia', 'checkout_web', 'criadoEm', agora)
  )
  returning * into pagamento;

  insert into public.pagamentos_eventos (
    pagamento_id, uid_cliente, origem, tipo, detalhes
  ) values (
    pagamento.id, pedido.uid_cliente, 'cliente', 'comprovativo_solicitado',
    jsonb_build_object('metodo', p_metodo, 'referencia', pedido.numero_fatura)
  );

  update public.vendas as v
  set pagamento = coalesce(v.pagamento, '{}'::jsonb) || jsonb_build_object(
        'metodo', p_metodo,
        'status', 'aguarda_comprovativo',
        'pagamentoId', pagamento.id,
        'referencia', pedido.numero_fatura,
        'atualizadoEm', agora
      ),
      atualizado_em = agora
  where v.id = pedido.id;

  return jsonb_build_object('ok', true, 'idempotente', false, 'pagamento', to_jsonb(pagamento));
end;
$$;

revoke all on function public.validar_pagamento_pedido() from public, anon, authenticated;
revoke all on function public.sincronizar_cancelamento_pagamento() from public, anon, authenticated;
revoke all on function public.iniciar_pagamento_vora(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.iniciar_pagamento_vora(text, uuid, text, text) to service_role;

-- A confirmação deve sempre comparar o valor congelado do pagamento com o
-- total histórico do pedido antes de mudar o pedido para pago.
create or replace function public.confirmar_pagamento_vora(
  p_pagamento_id uuid,
  p_evento_externo_id text default null,
  p_provedor_pagamento_id text default null,
  p_origem text default 'sistema',
  p_detalhes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pagamento public.pagamentos%rowtype;
  pedido public.vendas%rowtype;
  resultado jsonb;
  evento_id text;
  pagamento_evento_existente uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Confirmação de pagamento restrita ao serviço.';
  end if;
  if p_origem not in ('administrador', 'provedor', 'sistema') then
    raise exception 'Origem de confirmação inválida.';
  end if;

  select * into pagamento from public.pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;

  if pagamento.status = 'pago' then
    return jsonb_build_object(
      'ok', true, 'idempotente', true, 'pagamentoId', pagamento.id,
      'codigoRastreio', pagamento.codigo_rastreio, 'status', 'pago'
    );
  end if;
  if pagamento.status in ('falhou', 'expirado', 'cancelado', 'reembolsado') then
    raise exception 'Este pagamento não pode mais ser confirmado.';
  end if;

  select * into pedido from public.vendas where id = pagamento.venda_id for update;
  if not found then raise exception 'Pedido do pagamento não encontrado.'; end if;
  if pedido.uid_cliente <> pagamento.uid_cliente then
    raise exception 'Inconsistência entre pagamento e pedido.';
  end if;
  if pagamento.valor <> pedido.valor_total then
    raise exception 'O valor do pagamento não corresponde ao total do pedido.';
  end if;
  if pagamento.moeda <> 'AOA' then
    raise exception 'Moeda do pagamento incompatível.';
  end if;

  evento_id := nullif(trim(coalesce(p_evento_externo_id, '')), '');
  if evento_id is not null then
    select pagamento_id into pagamento_evento_existente
    from public.pagamentos_eventos
    where evento_externo_id = evento_id;
    if pagamento_evento_existente is not null then
      if pagamento_evento_existente = pagamento.id then
        return jsonb_build_object(
          'ok', true, 'idempotente', true, 'pagamentoId', pagamento.id,
          'codigoRastreio', pagamento.codigo_rastreio, 'status', pagamento.status
        );
      end if;
      raise exception 'O evento de pagamento já pertence a outro pedido.';
    end if;
  end if;

  resultado := public.atualizar_estado_pedido(pagamento.codigo_rastreio, 'pago');

  update public.pagamentos
  set status = 'pago',
      provedor_pagamento_id = coalesce(nullif(trim(coalesce(p_provedor_pagamento_id, '')), ''), provedor_pagamento_id),
      pago_em = now(),
      metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object('confirmadoEm', now())
  where id = pagamento.id;

  update public.vendas as v
  set pagamento = coalesce(v.pagamento, '{}'::jsonb) || jsonb_build_object(
        'metodo', pagamento.metodo,
        'status', 'pago',
        'pagamentoId', pagamento.id,
        'confirmadoEm', now()
      ),
      atualizado_em = now()
  where v.id = pagamento.venda_id;

  insert into public.pagamentos_eventos (
    pagamento_id, uid_cliente, origem, tipo, evento_externo_id, detalhes
  ) values (
    pagamento.id, pagamento.uid_cliente, p_origem, 'pagamento_confirmado',
    evento_id, coalesce(p_detalhes, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true, 'pagamentoId', pagamento.id,
    'codigoRastreio', pagamento.codigo_rastreio, 'status', 'pago',
    'pedido', resultado
  );
end;
$$;

revoke all on function public.confirmar_pagamento_vora(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_vora(uuid, text, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
