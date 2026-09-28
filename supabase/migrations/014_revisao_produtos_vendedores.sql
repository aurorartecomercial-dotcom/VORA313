-- VORA 313 — revisão obrigatória de produtos de vendedores.
-- A decisão fica auditável: quem decidiu, quando, o checklist, a nota e uma
-- fotografia dos dados que estavam no anúncio naquele momento.
begin;

alter table public.produtos
  add column if not exists revisado_em timestamptz,
  add column if not exists revisado_por uuid references auth.users(id) on delete set null,
  add column if not exists revisado_por_email text,
  add column if not exists revisao_notas text,
  add column if not exists revisao_checklist jsonb;

create table if not exists public.moderacoes_produtos (
  id uuid primary key default gen_random_uuid(),
  produto_id text not null references public.produtos(id) on delete restrict,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  administrador_id uuid references auth.users(id) on delete set null,
  administrador_email text,
  acao text not null check (acao in ('aprovar', 'recusar')),
  motivo text,
  checklist jsonb not null default '{}'::jsonb,
  anuncio_snapshot jsonb not null,
  criado_em timestamptz not null default now()
);

create index if not exists moderacoes_produtos_produto_criado_em_idx
  on public.moderacoes_produtos (produto_id, criado_em desc);

alter table public.moderacoes_produtos enable row level security;
revoke all on table public.moderacoes_produtos from anon;
revoke insert, update, delete on table public.moderacoes_produtos from authenticated;
grant select on table public.moderacoes_produtos to authenticated;

drop policy if exists moderacoes_produtos_admin_select on public.moderacoes_produtos;
create policy moderacoes_produtos_admin_select on public.moderacoes_produtos
for select to authenticated
using (public.is_admin());

-- A interface não é a única proteção. Mesmo um administrador autenticado no
-- browser não consegue mudar a publicação ou forjar campos de revisão por SQL
-- direto: essas alterações só passam pela Edge Function (service role).
create or replace function public.proteger_decisao_produto_vendedor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role'
     and new.vendedor_id is not null then
    if new.status_aprovacao is distinct from old.status_aprovacao
       or new.ativo is distinct from old.ativo
       or new.motivo_recusa is distinct from old.motivo_recusa
       or new.revisado_em is distinct from old.revisado_em
       or new.revisado_por is distinct from old.revisado_por
       or new.revisado_por_email is distinct from old.revisado_por_email
       or new.revisao_notas is distinct from old.revisao_notas
       or new.revisao_checklist is distinct from old.revisao_checklist then
      raise exception 'A revisão de produto de vendedor só pode ser decidida pelo fluxo seguro de moderação.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_decisao_produto_vendedor on public.produtos;
create trigger proteger_decisao_produto_vendedor
before update on public.produtos
for each row execute procedure public.proteger_decisao_produto_vendedor();

create or replace function public.moderar_produto_vendedor(
  p_produto_id text,
  p_acao text,
  p_motivo text,
  p_checklist jsonb,
  p_administrador_id uuid,
  p_administrador_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto public.produtos%rowtype;
  v_vendedor public.vendedores%rowtype;
  v_motivo text := left(trim(coalesce(p_motivo, '')), 600);
  v_agora timestamptz := now();
  v_moderacao_id uuid;
  v_snapshot jsonb;
begin
  if trim(coalesce(p_produto_id, '')) = '' then
    raise exception 'Produto inválido.' using errcode = '22023';
  end if;
  if p_acao not in ('aprovar', 'recusar') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if p_administrador_id is null then
    raise exception 'Administrador inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_checklist) is distinct from 'object'
     or not (p_checklist @> '{"imagens":true,"produto":true,"descricao":true,"politica":true}'::jsonb) then
    raise exception 'Conclua a revisão obrigatória antes de decidir.' using errcode = '22023';
  end if;
  if p_acao = 'recusar' and char_length(v_motivo) < 5 then
    raise exception 'Explique ao vendedor o motivo da recusa.' using errcode = '22023';
  end if;

  select * into v_produto
    from public.produtos
   where id = p_produto_id
   for update;
  if not found or v_produto.vendedor_id is null then
    raise exception 'Produto de vendedor não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_vendedor
    from public.vendedores
   where id = v_produto.vendedor_id;
  if p_acao = 'aprovar' and (not found or v_vendedor.status <> 'aprovado' or v_vendedor.ativo is not true) then
    raise exception 'O vendedor precisa estar aprovado e ativo antes da publicação.' using errcode = '23514';
  end if;
  if p_acao = 'aprovar' and jsonb_typeof(v_produto.imagens) is distinct from 'array' then
    raise exception 'O produto precisa ter pelo menos uma imagem válida antes da publicação.' using errcode = '23514';
  end if;
  if p_acao = 'aprovar' and not exists (
    select 1
      from jsonb_array_elements_text(v_produto.imagens) as imagem(url)
     where imagem.url ~* '^(https?://|data:image/(jpeg|png|webp|gif);base64,)'
  ) then
    raise exception 'O produto precisa ter pelo menos uma imagem válida antes da publicação.' using errcode = '23514';
  end if;

  v_snapshot := jsonb_build_object(
    'id', v_produto.id,
    'nome', v_produto.nome,
    'categoria', v_produto.categoria,
    'preco', v_produto.preco,
    'precoValor', v_produto.preco_valor,
    'estoque', v_produto.estoque,
    'descricao', v_produto.descricao,
    'marca', v_produto.marca,
    'sku', v_produto.sku,
    'tag', v_produto.tag,
    'imagens', v_produto.imagens,
    'vendedorId', v_produto.vendedor_id,
    'vendedorNome', coalesce(v_vendedor.nome_loja, v_vendedor.nome, v_produto.vendedor_nome),
    'estadoAntes', v_produto.status_aprovacao,
    'ativoAntes', v_produto.ativo
  );

  insert into public.moderacoes_produtos (
    produto_id, vendedor_id, administrador_id, administrador_email,
    acao, motivo, checklist, anuncio_snapshot, criado_em
  ) values (
    v_produto.id, v_produto.vendedor_id, p_administrador_id, nullif(left(trim(coalesce(p_administrador_email, '')), 160), ''),
    p_acao, nullif(v_motivo, ''), p_checklist, v_snapshot, v_agora
  ) returning id into v_moderacao_id;

  update public.produtos
     set status_aprovacao = case when p_acao = 'aprovar' then 'aprovado' else 'recusado' end,
         ativo = p_acao = 'aprovar',
         vendedor_ativo = case when p_acao = 'aprovar' then true else coalesce(v_vendedor.ativo, false) end,
         motivo_recusa = case when p_acao = 'recusar' then v_motivo else null end,
         revisado_em = v_agora,
         revisado_por = p_administrador_id,
         revisado_por_email = nullif(left(trim(coalesce(p_administrador_email, '')), 160), ''),
         revisao_notas = nullif(v_motivo, ''),
         revisao_checklist = p_checklist,
         atualizado_em = v_agora
   where id = v_produto.id;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_acao = 'aprovar' then 'aprovado' else 'recusado' end,
    'moderacaoId', v_moderacao_id,
    'revisadoEm', v_agora
  );
end;
$$;

revoke all on function public.moderar_produto_vendedor(text, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.moderar_produto_vendedor(text, text, text, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
