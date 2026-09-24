-- VORA 313 — cadastro de vendedores resiliente.
-- Execute depois de 010_production_safety.sql.
-- Estas RPCs são alternativas seguras quando a Edge Function "api" ainda não
-- foi publicada ou está temporariamente indisponível. Cada utilizador só pode
-- criar a candidatura e os produtos associados ao seu próprio auth.uid().
begin;

create or replace function public.solicitar_candidatura_vendedor(
  p_nome text,
  p_nome_loja text,
  p_telefone text,
  p_morada text,
  p_categoria text,
  p_descricao text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_status text;
  v_nome text := trim(coalesce(p_nome, ''));
  v_nome_loja text := trim(coalesce(p_nome_loja, ''));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_morada text := trim(coalesce(p_morada, ''));
  v_categoria text := trim(coalesce(p_categoria, ''));
  v_descricao text := trim(coalesce(p_descricao, ''));
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de enviar a candidatura.' using errcode = '42501';
  end if;

  if char_length(v_nome) not between 2 and 120
     or char_length(v_nome_loja) not between 2 and 120
     or char_length(v_telefone) not between 5 and 20
     or char_length(v_categoria) not between 2 and 80
     or char_length(v_morada) > 300
     or char_length(v_descricao) > 1000 then
    raise exception 'Dados da candidatura inválidos.' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if coalesce(trim(v_email), '') = '' then
    raise exception 'Não foi possível identificar o e-mail da conta.' using errcode = '22023';
  end if;

  select status into v_status
  from public.vendedores
  where id = v_uid
  for update;

  if found then
    if v_status = 'aprovado' then
      return jsonb_build_object('ok', true, 'status', 'aprovado', 'message', 'A sua loja já está aprovada.');
    end if;
    if v_status = 'suspenso' then
      raise exception 'A sua loja está suspensa. Contacte a VORA 313.' using errcode = '42501';
    end if;
    if v_status = 'recusado' then
      raise exception 'A candidatura foi recusada. Contacte a VORA 313 antes de tentar novamente.' using errcode = '42501';
    end if;

    -- A candidatura pendente pode ter os dados de contacto corrigidos, mas o
    -- trigger de produção mantém status, plano e valores financeiros protegidos.
    update public.vendedores
    set nome = v_nome,
        nome_loja = v_nome_loja,
        telefone = v_telefone,
        email = v_email,
        morada = v_morada,
        categoria = v_categoria,
        descricao = v_descricao,
        atualizado_em = now()
    where id = v_uid;

    return jsonb_build_object('ok', true, 'status', 'pendente', 'message', 'Candidatura já enviada e atualizada.');
  end if;

  insert into public.vendedores (
    id, uid, nome, nome_loja, telefone, email, morada, categoria, descricao,
    status, ativo, plano
  ) values (
    v_uid, v_uid::text, v_nome, v_nome_loja, v_telefone, v_email, v_morada,
    v_categoria, v_descricao, 'pendente', false, 'basico'
  );

  return jsonb_build_object('ok', true, 'status', 'pendente', 'message', 'Candidatura enviada para aprovação.');
end;
$$;

revoke all on function public.solicitar_candidatura_vendedor(text, text, text, text, text, text) from public, anon;
grant execute on function public.solicitar_candidatura_vendedor(text, text, text, text, text, text) to authenticated;

create or replace function public.guardar_produto_vendedor(
  p_produto jsonb,
  p_produto_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_vendedor public.vendedores%rowtype;
  v_id text := nullif(trim(coalesce(p_produto_id, '')), '');
  v_nome text := trim(coalesce(p_produto ->> 'nome', ''));
  v_categoria text := trim(coalesce(p_produto ->> 'categoria', ''));
  v_preco text := trim(coalesce(p_produto ->> 'preco', ''));
  v_preco_antigo text := trim(coalesce(p_produto ->> 'precoAntigo', ''));
  v_desconto text := trim(coalesce(p_produto ->> 'desconto', ''));
  v_parcelas text := trim(coalesce(p_produto ->> 'parcelas', ''));
  v_marca text := trim(coalesce(p_produto ->> 'marca', ''));
  v_sku text := trim(coalesce(p_produto ->> 'sku', ''));
  v_tag text := trim(coalesce(p_produto ->> 'tag', ''));
  v_descricao text := trim(coalesce(p_produto ->> 'descricao', ''));
  v_estoque integer;
  v_preco_valor numeric(14,2);
  v_imagens jsonb := coalesce(p_produto -> 'imagens', '[]'::jsonb);
  v_frete_gratis boolean := coalesce(lower(p_produto ->> 'freteGratis') in ('true', 't', '1'), false);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de guardar um produto.' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_produto), '') <> 'object' then
    raise exception 'Produto inválido.' using errcode = '22023';
  end if;

  select * into v_vendedor
  from public.vendedores
  where id = v_uid and status = 'aprovado' and ativo = true
  for update;
  if not found then
    raise exception 'A loja precisa estar aprovada e ativa para criar produtos.' using errcode = '42501';
  end if;

  if char_length(v_nome) not between 2 and 160
     or char_length(v_categoria) not between 2 and 80
     or char_length(v_descricao) not between 1 and 3000
     or char_length(v_preco) > 60
     or char_length(v_preco_antigo) > 60
     or char_length(v_desconto) > 30
     or char_length(v_parcelas) > 80
     or char_length(v_marca) > 120
     or char_length(v_sku) > 80
     or char_length(v_tag) > 80 then
    raise exception 'Dados do produto inválidos.' using errcode = '22023';
  end if;

  if coalesce(p_produto ->> 'estoque', '') !~ '^(0|[1-9][0-9]{0,5})$' then
    raise exception 'Estoque inválido.' using errcode = '22023';
  end if;
  v_estoque := (p_produto ->> 'estoque')::integer;
  v_preco_valor := public.parse_preco_kz(v_preco);
  if v_preco_valor is null then
    raise exception 'Preço inválido. Use, por exemplo, KZ 12.500,00.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_imagens) <> 'array' or jsonb_array_length(v_imagens) > 8
     or exists (
       select 1 from jsonb_array_elements(v_imagens) as imagem(valor)
       where jsonb_typeof(imagem.valor) <> 'string'
          or char_length(imagem.valor #>> '{}') > 2000
     ) then
    raise exception 'Imagens inválidas. Envie até 8 URLs de imagem.' using errcode = '22023';
  end if;

  if v_id is null then
    v_id := 'vprod_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.produtos (
      id, ordem, nome, categoria, preco, preco_valor, preco_antigo, desconto,
      parcelas, frete_gratis, descricao, imagens, marca, sku, tag, estoque,
      vendedor_id, vendedor_nome, status_aprovacao, ativo, vendedor_ativo,
      monetizacao
    ) values (
      v_id, 999999, v_nome, v_categoria, v_preco, v_preco_valor, v_preco_antigo,
      v_desconto, v_parcelas, v_frete_gratis, v_descricao, v_imagens, v_marca,
      v_sku, coalesce(nullif(v_tag, ''), v_categoria), v_estoque, v_uid,
      v_vendedor.nome_loja, 'aguardando_aprovacao', false, true, '{}'::jsonb
    );
  else
    if not exists (
      select 1 from public.produtos
      where id = v_id and vendedor_id = v_uid
      for update
    ) then
      raise exception 'Produto não encontrado ou sem permissão.' using errcode = '42501';
    end if;

    update public.produtos
    set nome = v_nome,
        categoria = v_categoria,
        preco = v_preco,
        preco_valor = v_preco_valor,
        preco_antigo = v_preco_antigo,
        desconto = v_desconto,
        parcelas = v_parcelas,
        frete_gratis = v_frete_gratis,
        descricao = v_descricao,
        imagens = v_imagens,
        marca = v_marca,
        sku = v_sku,
        tag = coalesce(nullif(v_tag, ''), v_categoria),
        estoque = v_estoque,
        vendedor_nome = v_vendedor.nome_loja,
        status_aprovacao = 'aguardando_aprovacao',
        ativo = false,
        vendedor_ativo = true,
        atualizado_em = now()
    where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'produtoId', v_id, 'status', 'aguardando_aprovacao');
end;
$$;

revoke all on function public.guardar_produto_vendedor(jsonb, text) from public, anon;
grant execute on function public.guardar_produto_vendedor(jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;
