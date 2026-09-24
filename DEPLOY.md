# VORA 313 — Deploy com Supabase

## 1. Supabase

- Authentication → Email/Password ativo.
- Em Authentication → URL Configuration, defina **Site URL** como `https://aurorartecomercial-dotcom.github.io/VORA313/` e inclua `https://aurorartecomercial-dotcom.github.io/VORA313/vendedor.html` em **Redirect URLs**. Isto permite que a recuperação de senha do vendedor abra o formulário correto, inclusive no telefone.
- Se o checkout continuar a permitir sessão anónima, ative Anonymous Sign-ins.
- Execute `supabase/migrations/003_firebase_uid_bridge.sql`, `004_migration_support.sql` e `005_supabase_frontend_support.sql` depois das migrations 001 e 002 já aplicadas.
- Execute a migration `008_vora313_schema_repair.sql` depois das migrations anteriores.
- Publique `supabase/functions/api` usando `supabase functions deploy api`.

## 2. Frontend

Configure `js/supabase-config.js` com a URL do projeto e a anon/publishable key.

Nunca coloque `service_role` no browser.

## 3. Admin

O painel usa `public.profiles.role = 'admin'`. A autorização administrativa é validada no backend e também protegida por RLS.

## 4. Vendedor

A autorização de vendedor usa `public.vendedores.status = 'aprovado'` e `ativo = true`.

## 5. Pagamentos

As quatro funções de pagamento referenciadas no frontend original não estavam presentes nos exports do backend recebido. A nova Edge Function informa `not_configured` para elas até a integração oficial ser implementada.

## 6. Corte do Firebase

Não é necessário apagar o projeto Firebase para colocar o novo frontend no ar. Primeiro confirme todos os fluxos no Supabase. Depois de validar os dados históricos e o funcionamento em produção, o Firebase pode ser encerrado separadamente.
