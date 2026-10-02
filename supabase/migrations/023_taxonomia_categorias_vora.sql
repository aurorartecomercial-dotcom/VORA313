-- VORA 313 — taxonomia hierárquica de categorias.
-- Compatível com os dados existentes: não altera o valor da categoria principal.
-- A subcategoria é opcional e pode ser preenchida gradualmente.
begin;

alter table public.vendedores
  add column if not exists categoria_subcategoria text;

alter table public.produtos
  add column if not exists subcategoria text;

create or replace function public.guardar_taxonomia_vendedor(p_subcategoria text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_subcategoria text := left(trim(coalesce(p_subcategoria, '')), 100);
  v_categoria text;
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a categoria.' using errcode = '42501';
  end if;

  select categoria into v_categoria from public.vendedores where id = v_uid;
  if v_categoria is null then
    raise exception 'Vendedor não encontrado.' using errcode = '42501';
  end if;

  update public.vendedores
     set categoria_subcategoria = nullif(v_subcategoria, ''),
         perfil_publico = jsonb_set(
           coalesce(perfil_publico, '{}'::jsonb),
           '{categoriaSubcategoria}',
           to_jsonb(v_subcategoria),
           true
         ),
         atualizado_em = now()
   where id = v_uid;

  return jsonb_build_object('ok', true, 'categoria', v_categoria, 'subcategoria', v_subcategoria);
end;
$$;

revoke all on function public.guardar_taxonomia_vendedor(text) from public, anon;
grant execute on function public.guardar_taxonomia_vendedor(text) to authenticated;

create or replace function public.guardar_subcategoria_produto_vendedor(p_produto_id text, p_subcategoria text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id text := trim(coalesce(p_produto_id, ''));
  v_subcategoria text := left(trim(coalesce(p_subcategoria, '')), 100);
begin
  if v_uid is null then
    raise exception 'Inicie sessão antes de atualizar a subcategoria.' using errcode = '42501';
  end if;
  if v_id = '' then
    raise exception 'Produto inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.produtos where id = v_id and vendedor_id = v_uid) then
    raise exception 'Produto não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  update public.produtos
     set subcategoria = nullif(v_subcategoria, ''),
         atualizado_em = now()
   where id = v_id and vendedor_id = v_uid;

  return jsonb_build_object('ok', true, 'subcategoria', v_subcategoria);
end;
$$;

revoke all on function public.guardar_subcategoria_produto_vendedor(text, text) from public, anon;
grant execute on function public.guardar_subcategoria_produto_vendedor(text, text) to authenticated;

-- A normalização final do perfil passa a conservar apenas mais um campo simples:
-- a subcategoria escolhida pelo próprio vendedor. Os restantes campos continuam
-- com as mesmas validações da migration 022.
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
  v_subcategoria text := left(trim(coalesce(v_perfil ->> 'categoriaSubcategoria', '')), 100);
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
  if v_estilo not in ('padrao', 'tema_categoria', 'editorial_moda', 'editorial_beleza', 'editorial_livros') then
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
    'editorialProdutoId', v_produto,
    'categoriaSubcategoria', v_subcategoria
  );
end;
$$;

-- Normaliza os perfis já existentes sem apagar os campos conhecidos.
update public.vendedores
set categoria_subcategoria = nullif(trim(perfil_publico ->> 'categoriaSubcategoria'), '')
where perfil_publico is not null;

notify pgrst, 'reload schema';
commit;
