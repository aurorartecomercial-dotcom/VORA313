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

## Financeiro do marketplace

Depois das migrations já listadas neste documento, execute também
`011_financeiro_marketplace.sql` e publique novamente a Edge Function `api`.
Essa etapa separa saldo pendente, retido, disponível e já pago; impede a
liberação do vendedor antes da entrega e inclui disputas, reembolsos e
levantamentos auditáveis. Consulte `FINANCEIRO-MARKETPLACE.md` para o fluxo
operacional antes de ativar pagamentos reais.

## Revisão obrigatória de anúncios de vendedores

Execute `014_revisao_produtos_vendedores.sql` depois das migrations anteriores
e publique novamente a Edge Function `api`. A fila administrativa passa a
mostrar imagens, descrição, preço, stock e vendedor antes da decisão. Toda
aprovação ou recusa exige checklist, gera uma nota e grava uma fotografia do
anúncio, do administrador e do momento da decisão. Consulte
`REVISAO-PRODUTOS.md` para a política operacional.

## SQL

Como `001_schema.sql` e `002_auth_trigger.sql` já foram executados no projeto, execute na sequência:

1. `003_firebase_uid_bridge.sql` — apenas para facilitar a importação dos dados antigos;
2. `004_migration_support.sql` — apoio à migração dos dados antigos;
3. `005_supabase_frontend_support.sql` — suporte do frontend, Storage e itens do pedido.

A ponte `firebase_uid` é temporária para a importação. O funcionamento normal do novo sistema usa os UUIDs do Supabase.

## Backend

A Edge Function `supabase/functions/api/index.ts` substitui as Cloud Functions usadas pelo frontend.

Depois de configurar o projeto Supabase, publique a função `api` com a Supabase CLI.
Em projetos Supabase recentes, a função usa automaticamente
`SUPABASE_SECRET_KEYS.default` para operações administrativas seguras e só
usa a variável legada como compatibilidade. Não crie nem coloque chaves
`SUPABASE_*` manualmente no frontend ou na área de Secrets.

## Pagamentos

Execute `015_pagamentos_vora_pay.sql` e publique novamente a Edge Function `api`.
Ela cria a fila de comprovativos, a trilha de auditoria e uma confirmação que só
pode ser feita pelo servidor/administrador; o cliente nunca consegue alterar o
estado de uma venda para pago. A transferência com comprovativo por WhatsApp
continua disponível enquanto o gateway automático é contratado. Leia
`PAGAMENTOS-VORA-PAY.md` antes de ativar Multicaixa Express, referência ou
cartão.

## Dados antigos

Os scripts em `tools/` continuam disponíveis somente como ferramentas de importação única dos dados históricos do Firebase. Eles não fazem parte do runtime da aplicação.

Não é necessário enviar credenciais secretas pelo chat.
