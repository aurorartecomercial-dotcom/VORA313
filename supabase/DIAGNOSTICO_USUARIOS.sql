-- Leitura apenas: confirma os utilizadores reais do banco atual.
select id, email, email_confirmed_at, created_at
from auth.users
order by created_at desc;
