-- VORA 313 — segurança P2: auditoria mínima de ações sensíveis.
-- Execute depois de 011_financeiro_marketplace.sql, 014, 015, 016 e 017.
-- Não guarda palavras-passe, NIF, telefone, morada, valores bancários ou dados
-- completos de pagamento nos eventos de segurança.
begin;

create table if not exists public.eventos_seguranca (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('autorizacao', 'vendedor', 'pagamento', 'limite', 'sistema')),
  evento text not null check (char_length(evento) between 3 and 80),
  actor_id uuid references auth.users(id) on delete set null,
  alvo text,
  detalhes jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhes) = 'object'),
  criado_em timestamptz not null default now()
);

create index if not exists idx_eventos_seguranca_criado_em
  on public.eventos_seguranca(criado_em desc);
create index if not exists idx_eventos_seguranca_categoria_criado_em
  on public.eventos_seguranca(categoria, criado_em desc);

alter table public.eventos_seguranca enable row level security;
revoke all on table public.eventos_seguranca from public, anon, authenticated;
grant select on table public.eventos_seguranca to authenticated;

drop policy if exists eventos_seguranca_admin_select on public.eventos_seguranca;
create policy eventos_seguranca_admin_select on public.eventos_seguranca
for select to authenticated
using (public.is_admin());

create or replace function public.registrar_evento_seguranca(
  p_categoria text,
  p_evento text,
  p_alvo text default null,
  p_detalhes jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text := lower(trim(coalesce(p_categoria, '')));
  v_evento text := left(trim(coalesce(p_evento, '')), 80);
  v_alvo text := nullif(left(trim(coalesce(p_alvo, '')), 160), '');
  v_detalhes jsonb := coalesce(p_detalhes, '{}'::jsonb);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'O registo de segurança é exclusivo do serviço.' using errcode = '42501';
  end if;
  if v_categoria not in ('autorizacao', 'vendedor', 'pagamento', 'limite', 'sistema')
     or char_length(v_evento) < 3
     or jsonb_typeof(v_detalhes) <> 'object' then
    raise exception 'Evento de segurança inválido.' using errcode = '22023';
  end if;

  insert into public.eventos_seguranca (categoria, evento, actor_id, alvo, detalhes)
  values (v_categoria, v_evento, coalesce(p_actor_id, auth.uid()), v_alvo, v_detalhes);
end;
$$;

revoke all on function public.registrar_evento_seguranca(text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_evento_seguranca(text, text, text, jsonb, uuid)
  to service_role;

create or replace function public.auditar_perfil_critico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role or old.ativo is distinct from new.ativo then
    insert into public.eventos_seguranca (categoria, evento, actor_id, alvo, detalhes)
    values (
      'autorizacao', 'perfil_privilegiado_alterado', auth.uid(), new.id::text,
      jsonb_build_object('roleAnterior', old.role, 'roleNovo', new.role, 'ativoAnterior', old.ativo, 'ativoNovo', new.ativo)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists auditoria_perfil_critico on public.profiles;
create trigger auditoria_perfil_critico
after update of role, ativo on public.profiles
for each row execute procedure public.auditar_perfil_critico();

create or replace function public.auditar_vendedor_critico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     or old.ativo is distinct from new.ativo
     or old.plano is distinct from new.plano
     or old.dados_recebimento is distinct from new.dados_recebimento then
    insert into public.eventos_seguranca (categoria, evento, actor_id, alvo, detalhes)
    values (
      'vendedor', 'estado_vendedor_alterado', auth.uid(), new.id::text,
      jsonb_build_object(
        'statusAnterior', old.status, 'statusNovo', new.status,
        'ativoAnterior', old.ativo, 'ativoNovo', new.ativo,
        'planoAnterior', old.plano, 'planoNovo', new.plano,
        'dadosRecebimentoAlterados', old.dados_recebimento is distinct from new.dados_recebimento
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists auditoria_vendedor_critico on public.vendedores;
create trigger auditoria_vendedor_critico
after update of status, ativo, plano, dados_recebimento on public.vendedores
for each row execute procedure public.auditar_vendedor_critico();

create or replace function public.auditar_pagamento_critico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.eventos_seguranca (categoria, evento, actor_id, alvo, detalhes)
    values (
      'pagamento', 'estado_pagamento_alterado', auth.uid(), new.id::text,
      jsonb_build_object('statusAnterior', old.status, 'statusNovo', new.status, 'vendaId', new.venda_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists auditoria_pagamento_critico on public.pagamentos;
create trigger auditoria_pagamento_critico
after update of status on public.pagamentos
for each row execute procedure public.auditar_pagamento_critico();

notify pgrst, 'reload schema';
commit;
