-- VORA 313 — tema opcional e seguro por categoria da loja.
-- Execute depois da 020_vitrine_editorial_lojas.sql. Não altera produtos,
-- pedidos, pagamentos, saldos ou permissões; apenas permite uma opção visual
-- adicional já controlada pelo frontend e pela Edge Function.
begin;

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
    'editorialProdutoId', v_produto
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
