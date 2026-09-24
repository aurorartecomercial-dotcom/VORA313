-- Uso emergencial: aprova a candidatura já criada para vora313e@gmail.com.
-- Execute somente se tiver confirmado que esta é a conta de vendedor correta.
begin;

-- O SQL Editor não envia o JWT do administrador. Esta identidade vale apenas
-- até ao COMMIT e permite que o gatilho de proteção aceite esta aprovação.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

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
