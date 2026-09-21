begin;

-- Segurança: utilizadores autenticados podem editar os próprios dados de perfil,
-- mas nunca podem promover/desativar a própria conta por UPDATE direto via API.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.role := old.role;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
before update on public.profiles
for each row execute procedure public.protect_profile_security_fields();

-- Segurança: vendedores podem editar dados da loja, mas os campos de aprovação,
-- plano, saldo e contadores só podem ser alterados pelo backend privilegiado ou admin.
create or replace function public.protect_vendedor_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.status := old.status;
    new.ativo := old.ativo;
    new.plano := old.plano;
    new.saldo_disponivel := old.saldo_disponivel;
    new.saldo_retido := old.saldo_retido;
    new.total_vendas := old.total_vendas;
    new.total_produtos := old.total_produtos;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_vendedor_financial_fields on public.vendedores;
create trigger protect_vendedor_financial_fields
before update on public.vendedores
for each row execute procedure public.protect_vendedor_financial_fields();

-- Segurança: clientes não podem alterar pontos/histórico diretamente.
create or replace function public.protect_cliente_loyalty_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.pontos := old.pontos;
    new.historico := old.historico;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_cliente_loyalty_fields on public.clientes;
create trigger protect_cliente_loyalty_fields
before update on public.clientes
for each row execute procedure public.protect_cliente_loyalty_fields();

commit;
