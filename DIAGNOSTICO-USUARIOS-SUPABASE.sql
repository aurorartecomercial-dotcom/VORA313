-- Consulta somente de leitura. Execute se o script de recuperação por UID
-- disser que o UID não existe. Ela mostra os utilizadores reais deste banco.

select id, email, email_confirmed_at, created_at
from auth.users
order by created_at desc;

-- O frontend do pacote corrigido está configurado para este projeto Supabase:
-- https://xeuthybpiphiejfvjrtu.supabase.co
