-- Recupera a candidatura pendente para o UID confirmado no Authentication.
-- Não aprova a loja.
begin;

do $$
declare
  conta auth.users%rowtype;
begin
  select * into conta
  from auth.users
  where id = 'e5d38ecd-afd9-42b4-884c-8c2c3e4275f7'::uuid;

  if not found then
    raise exception 'O UID não existe neste banco. Authentication e SQL Editor estão em projetos ou branches diferentes.';
  end if;

  insert into public.vendedores (
    id, uid, nome, nome_loja, telefone, email, morada, categoria,
    descricao, status, ativo, plano
  ) values (
    conta.id, conta.id::text,
    coalesce(nullif(conta.raw_user_meta_data ->> 'full_name', ''), 'Candidatura recuperada'),
    coalesce(nullif(conta.raw_user_meta_data ->> 'store_name', ''), 'Loja pendente de aprovação'),
    null, conta.email, null, 'Outros',
    'Candidatura recuperada a partir de Authentication. Complete os dados após a aprovação.',
    'pendente', false, 'basico'
  )
  on conflict (id) do update
    set uid = excluded.uid,
        email = excluded.email,
        atualizado_em = now();
end $$;

select id, email, nome, nome_loja, status, ativo, criado_em
from public.vendedores
where id = 'e5d38ecd-afd9-42b4-884c-8c2c3e4275f7'::uuid;

commit;
