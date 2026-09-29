-- VORA 313 — base segura para pagamentos de pedidos.
-- Execute esta migration depois da 014. Ela NÃO ativa cobrança bancária sozinha:
-- as credenciais e o webhook do provedor são configurados na Edge Function.
begin;

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id text not null references public.vendas(id) on delete restrict,
  uid_cliente uuid not null references auth.users(id) on delete restrict,
  codigo_rastreio text not null,
  numero_fatura text not null,
  valor numeric(14,2) not null check (valor > 0),
  moeda text not null default 'AOA' check (moeda = 'AOA'),
  metodo text not null check (metodo in (
    'multicaixa_express', 'multicaixa_referencia', 'cartao', 'transferencia_manual'
  )),
  provedor text not null default 'manual',
  provedor_pagamento_id text,
  entidade text,
  referencia text,
  checkout_url text,
  qr_payload text,
  status text not null default 'aguarda_comprovativo' check (status in (
    'criado', 'aguarda_cliente', 'aguarda_comprovativo', 'processando',
    'pago', 'falhou', 'expirado', 'cancelado', 'reembolsado'
  )),
  expira_em timestamptz,
  idempotency_key text not null,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  pago_em timestamptz
);

create unique index if not exists uq_pagamentos_venda_idempotency
  on public.pagamentos(venda_id, idempotency_key);
create unique index if not exists uq_pagamentos_provedor_id
  on public.pagamentos(provedor, provedor_pagamento_id)
  where provedor_pagamento_id is not null;
create index if not exists idx_pagamentos_cliente_criado
  on public.pagamentos(uid_cliente, criado_em desc);
create index if not exists idx_pagamentos_status_expira
  on public.pagamentos(status, expira_em)
  where status in ('criado', 'aguarda_cliente', 'aguarda_comprovativo', 'processando');

create table if not exists public.pagamentos_eventos (
  id bigint generated always as identity primary key,
  pagamento_id uuid not null references public.pagamentos(id) on delete restrict,
  uid_cliente uuid not null references auth.users(id) on delete restrict,
  origem text not null check (origem in ('cliente', 'administrador', 'provedor', 'sistema')),
  tipo text not null,
  evento_externo_id text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create unique index if not exists uq_pagamentos_evento_externo
  on public.pagamentos_eventos(evento_externo_id)
  where evento_externo_id is not null;
create index if not exists idx_pagamentos_eventos_pagamento
  on public.pagamentos_eventos(pagamento_id, criado_em desc);

create or replace function public.touch_pagamento_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists pagamentos_touch_atualizado_em on public.pagamentos;
create trigger pagamentos_touch_atualizado_em
before update on public.pagamentos
for each row execute procedure public.touch_pagamento_atualizado_em();

alter table public.pagamentos enable row level security;
alter table public.pagamentos_eventos enable row level security;

drop policy if exists pagamentos_cliente_admin_select on public.pagamentos;
create policy pagamentos_cliente_admin_select on public.pagamentos
for select to authenticated
using (uid_cliente = auth.uid() or public.is_admin());

drop policy if exists pagamentos_eventos_cliente_admin_select on public.pagamentos_eventos;
create policy pagamentos_eventos_cliente_admin_select on public.pagamentos_eventos
for select to authenticated
using (uid_cliente = auth.uid() or public.is_admin());

-- Somente o serviço confirma um pagamento. Esta operação também efetua, na
-- mesma transação, a transição do pedido para "pago", que baixa o stock e
-- cria as provisões financeiras dos vendedores.
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

  -- A função existente valida a transição, expiração, stock, cupom,
  -- comissão e saldo do vendedor. Se falhar, tudo acima é revertido.
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
