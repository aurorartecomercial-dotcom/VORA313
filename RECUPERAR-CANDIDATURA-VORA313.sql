-- Execute no SQL Editor do projeto Supabase correto.
-- Cria somente a candidatura pendente da conta indicada; não aprova a loja.
begin;

do $$
declare
  conta auth.users%rowtype;
begin
  select * into conta
  from auth.users
  where lower(email) = lower('vora313@gmail.com');

  if not found then
    raise exception 'A conta vora313@gmail.com não foi encontrada em Authentication.';
  end if;

  insert into public.vendedores (
    id, uid, nome, nome_loja, telefone, email, morada, categoria,
    descricao, status, ativo, plano
  ) values (
    conta.id,
    conta.id::text,
    coalesce(nullif(conta.raw_user_meta_data ->> 'full_name', ''), 'Candidatura recuperada'),
    coalesce(nullif(conta.raw_user_meta_data ->> 'store_name', ''), 'Loja pendente de aprovação'),
    null,
    conta.email,
    null,
    'Outros',
    'Candidatura recuperada a partir de Authentication. Complete os dados após a aprovação.',
    'pendente',
    false,
    'basico'
  )
  on conflict (id) do update
    set uid = excluded.uid,
        email = excluded.email,
        atualizado_em = now();
end $$;

select id, email, nome, nome_loja, status, ativo, criado_em
from public.vendedores
where lower(email) = lower('vora313@gmail.com');

commit;
