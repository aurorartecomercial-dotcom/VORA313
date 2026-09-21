# VORA 313 / Aurora Comercial — migração definitiva para Supabase

Este pacote é o projeto original preparado para **deixar de usar Firebase em produção** e operar com Supabase.

## Arquitetura final

- Auth: Supabase Auth
- Banco: Supabase PostgreSQL
- Storage: Supabase Storage (`vora-public`)
- Backend privilegiado: Supabase Edge Function `api`
- Autorização: RLS + validações no backend
- Frontend: API de compatibilidade local em `js/supabase-compat.js`, sem SDK Firebase

## Configuração obrigatória

Edite apenas `js/supabase-config.js` e coloque:

- URL do projeto Supabase
- anon/publishable key

Nunca coloque a `service_role` key no frontend.

## SQL

Como `001_schema.sql` e `002_auth_trigger.sql` já foram executados no projeto, execute na sequência:

1. `003_firebase_uid_bridge.sql` — apenas para facilitar a importação dos dados antigos;
2. `004_migration_support.sql` — apoio à migração dos dados antigos;
3. `005_supabase_frontend_support.sql` — suporte do frontend, Storage e itens do pedido.

A ponte `firebase_uid` é temporária para a importação. O funcionamento normal do novo sistema usa os UUIDs do Supabase.

## Backend

A Edge Function `supabase/functions/api/index.ts` substitui as Cloud Functions usadas pelo frontend.

Depois de configurar o projeto Supabase, publique a função `api` com a Supabase CLI.

## Pagamentos

As funções de pagamento (`criarPagamentoMulticaixa`, `consultarPagamentoMulticaixa`, `criarPagamentoCartao`, `consultarPagamentoCartao`) estavam referenciadas no frontend original, mas não estavam exportadas pelo backend Firebase recebido. Nesta versão elas retornam explicitamente `not_configured` até a integração oficial do provedor ser implementada.

## Dados antigos

Os scripts em `tools/` continuam disponíveis somente como ferramentas de importação única dos dados históricos do Firebase. Eles não fazem parte do runtime da aplicação.

Não é necessário enviar credenciais secretas pelo chat.
