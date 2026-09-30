-- VORA 313 — opção de vitrine editorial para Moda, Beleza e Livros.
-- Execute após 017_seguranca_p1_privacidade_perfil_loja.sql.
-- Não altera produtos, pedidos, pagamentos, saldos nem permissões.
begin;

-- Mantém o perfil público com uma lista fechada de campos. Desta forma, o
-- vendedor pode escolher a apresentação, mas não injeta HTML/CSS/JavaScript
-- nem associa a vitrine a dados privados.
create or replace function public.normalizar_perfil_publico_vendedor(p_perfil jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_perfil jsonb := coalesce(p_perfil, '{}'::jsonb);
  v_logo text := left(trim(coalesce(v_perfil ->> 'logoUrl', '')), 1200);
  v_capa text := left(trim(coalesce(v_perfil ->> 'capaUrl', '')), 1200);
  v_horario text := left(trim(coalesce(v_perfil ->> 'horario', '')), 160);
  v_instagram text := left(trim(coalesce(v_perfil ->> 'instagram', '')), 120);
  v_destaque text := left(trim(coalesce(v_perfil ->> 'destaque', '')), 280);
  v_estilo text := lower(left(trim(coalesce(v_perfil ->> 'estiloVitrine', 'padrao')), 40));
  v_colecao text := left(trim(coalesce(v_perfil ->> 'editorialColecao', '')), 80);
  v_titulo text := left(trim(coalesce(v_perfil ->> 'editorialTitulo', '')), 120);
  v_chamada text := left(trim(coalesce(v_perfil ->> 'editorialChamada', '')), 320);
  v_produto text := left(trim(coalesce(v_perfil ->> 'editorialProdutoId', '')), 128);
  v_utilizador_instagram text;
begin
  if jsonb_typeof(v_perfil) <> 'object' then
    raise exception 'O perfil público da loja é inválido.' using errcode = '22023';
  end if;

  if (v_logo <> '' and v_logo !~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$')
     or (v_capa <> '' and v_capa !~* '^https://[^[:space:]@/?#]+(/[^[:space:]]*)?$') then
    raise exception 'Logótipo e capa devem usar uma URL HTTPS válida.' using errcode = '22023';
  end if;

  if v_instagram ~* '^@?[a-z0-9._]{1,30}$' then
    v_utilizador_instagram := lower(regexp_replace(v_instagram, '^@', ''));
    v_instagram := case when v_utilizador_instagram = '' then '' else 'https://instagram.com/' || v_utilizador_instagram end;
  elsif v_instagram <> '' and v_instagram !~* '^https://(www\.)?instagram\.com/[a-z0-9._]{1,30}/?$' then
    raise exception 'Instagram inválido. Use @utilizador ou um link HTTPS do Instagram.' using errcode = '22023';
  end if;

  if v_estilo = '' then v_estilo := 'padrao'; end if;
  if v_estilo not in ('padrao', 'editorial_moda', 'editorial_beleza', 'editorial_livros') then
    raise exception 'Estilo da vitrine inválido.' using errcode = '22023';
  end if;
  if v_produto <> '' and v_produto !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Produto editorial inválido.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'logoUrl', v_logo,
    'capaUrl', v_capa,
    'horario', v_horario,
    'instagram', v_instagram,
    'destaque', v_destaque,
    'estiloVitrine', v_estilo,
    'editorialColecao', v_colecao,
    'editorialTitulo', v_titulo,
    'editorialChamada', v_chamada,
    'editorialProdutoId', v_produto
  );
end;
$$;

-- A escolha do produto principal não pode referir produtos de outro vendedor
-- nem anúncios pendentes, recusados ou desativados. Esta função só é usada
-- por funções de atualização da própria loja.
create or replace function public.validar_produto_editorial_vendedor(
  p_vendedor uuid,
  p_perfil jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto text := coalesce(p_perfil ->> 'editorialProdutoId', '');
begin
  if v_produto <> '' and not exists (
    select 1
    from public.produtos
    where id::text = v_produto
      and vendedor_id = p_vendedor
      and status_aprovacao = 'aprovado'
      and ativo = true
  ) then
    raise exception 'O produto editorial deve ser um produto publicado da sua própria loja.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.validar_produto_editorial_vendedor(uuid, jsonb)
  from public, anon, authenticated;

-- Reaplica as funções de atualização para validar a propriedade do produto
-- também quando o frontend usa RPC diretamente (em vez da Edge Function).
create or replace function public.atualizar_perfil_publico_vendedor(p_perfil jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil jsonb := public.normalizar_perfil_publico_vendedor(p_perfil);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Não existe uma candidatura de vendedor para esta conta.' using errcode = '42501';
  end if;
  perform public.validar_produto_editorial_vendedor(v_uid, v_perfil);
  update public.vendedores
     set perfil_publico = v_perfil,
         atualizado_em = now()
   where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.atualizar_perfil_central_vendedor(
  p_nome text,
  p_nome_loja text,
  p_telefone text,
  p_morada text,
  p_categoria text,
  p_descricao text,
  p_perfil_publico jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text := trim(coalesce(p_nome, ''));
  v_loja text := trim(coalesce(p_nome_loja, ''));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_morada text := left(trim(coalesce(p_morada, '')), 300);
  v_categoria text := trim(coalesce(p_categoria, ''));
  v_descricao text := left(trim(coalesce(p_descricao, '')), 1000);
  v_perfil jsonb := public.normalizar_perfil_publico_vendedor(p_perfil_publico);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a loja.' using errcode = '42501';
  end if;
  if char_length(v_nome) not between 2 and 120
     or char_length(v_loja) not between 2 and 120
     or char_length(v_telefone) not between 5 and 20
     or char_length(v_categoria) not between 2 and 80 then
    raise exception 'Dados do perfil da loja inválidos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vendedores where id = v_uid) then
    raise exception 'Não existe uma candidatura de vendedor para esta conta.' using errcode = '42501';
  end if;
  perform public.validar_produto_editorial_vendedor(v_uid, v_perfil);
  update public.vendedores
     set nome = v_nome,
         nome_loja = v_loja,
         telefone = v_telefone,
         morada = v_morada,
         categoria = v_categoria,
         descricao = v_descricao,
         perfil_publico = v_perfil,
         atualizado_em = now()
   where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.atualizar_perfil_publico_vendedor(jsonb) from public, anon;
grant execute on function public.atualizar_perfil_publico_vendedor(jsonb) to authenticated;
revoke all on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.atualizar_perfil_central_vendedor(text, text, text, text, text, text, jsonb)
  to authenticated;

-- Perfis existentes recebem os novos campos com valores seguros padrão.
-- A função continua a remover quaisquer chaves não autorizadas.
update public.vendedores
set perfil_publico = public.normalizar_perfil_publico_vendedor(perfil_publico);

notify pgrst, 'reload schema';
commit;
