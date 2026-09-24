-- Uso emergencial: aprova a candidatura já criada para vora313e@gmail.com.
-- Execute somente se tiver confirmado que esta é a conta de vendedor correta.
begin;

update public.vendedores
set status = 'aprovado',
    ativo = true,
    atualizado_em = now()
where lower(email) = lower('vora313e@gmail.com')
returning id, email, nome_loja, status, ativo;

-- Mantém produtos futuros desta loja disponíveis para publicação após aprovação.
update public.produtos
set vendedor_ativo = true,
    atualizado_em = now()
where vendedor_id in (
  select id from public.vendedores where lower(email) = lower('vora313e@gmail.com')
);

commit;
