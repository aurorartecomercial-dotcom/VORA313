# VORA 313 — Deploy com Supabase

## 1. Supabase

- Authentication → Email/Password ativo.
- Em Authentication → URL Configuration, defina **Site URL** como `https://aurorartecomercial-dotcom.github.io/VORA313/` e inclua `https://aurorartecomercial-dotcom.github.io/VORA313/vendedor.html` em **Redirect URLs**. Isto permite que a recuperação de senha do vendedor abra o formulário correto, inclusive no telefone.
- Se o checkout continuar a permitir sessão anónima, ative Anonymous Sign-ins.
- Execute `supabase/migrations/003_firebase_uid_bridge.sql`, `004_migration_support.sql` e `005_supabase_frontend_support.sql` depois das migrations 001 e 002 já aplicadas.
- Execute a migration `008_vora313_schema_repair.sql` depois das migrations anteriores.
- Execute também `supabase/migrations/009_admin_vendedores_vendas.sql`, `010_production_safety.sql` e `011_vendedor_cadastro_resiliente.sql`, nesta ordem. A 011 mantém o fluxo de candidatura e produtos de vendedor funcional mesmo se a Edge Function estiver indisponível.
- Publique `supabase/functions/api` usando `supabase functions deploy api`.

## 2. Frontend

Configure `js/supabase-config.js` com a URL do projeto e a anon/publishable key.

Nunca coloque `service_role` no browser.

## 3. Admin

O painel usa `public.profiles.role = 'admin'`. A autorização administrativa é validada no backend e também protegida por RLS.

## 4. Vendedor

A autorização de vendedor usa `public.vendedores.status = 'aprovado'` e `ativo = true`.

As contas de Authentication não são, por si só, candidaturas de vendedor. Quando a confirmação de e-mail está ativa, o utilizador deve confirmar o e-mail, entrar e enviar o formulário de candidatura. A candidatura então aparece como `pendente` no painel administrativo.

## 5. Limite de e-mails de autenticação

Não existe limite diário de vendedores implementado no site. No plano de e-mail padrão do Supabase, os e-mails de confirmação e recuperação compartilham um limite baixo de 2 mensagens por hora. Para produção, configure SMTP próprio em **Authentication → Emails → SMTP Settings**; depois ajuste **Authentication → Rate Limits** de acordo com o serviço de e-mail escolhido.

## 6. Pagamentos

As quatro funções de pagamento referenciadas no frontend original não estavam presentes nos exports do backend recebido. A nova Edge Function informa `not_configured` para elas até a integração oficial ser implementada.

## 7. Corte do Firebase

Não é necessário apagar o projeto Firebase para colocar o novo frontend no ar. Primeiro confirme todos os fluxos no Supabase. Depois de validar os dados históricos e o funcionamento em produção, o Firebase pode ser encerrado separadamente.
