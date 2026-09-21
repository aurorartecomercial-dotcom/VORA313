# VORA 313 — migração real Firebase → Supabase

## O que esta etapa faz
- exporta todas as coleções raiz e subcoleções do Firestore;
- exporta todos os utilizadores Firebase Auth;
- cria/associa utilizadores no Supabase Auth por email + `firebase_uid`;
- transforma os documentos conhecidos para o schema VORA 313;
- importa em lotes idempotentes;
- preserva o UID Firebase no mapa de migração.

## Limitação obrigatória
O Firebase Admin SDK não entrega as passwords dos utilizadores. A migração não pode manter a password Firebase. Antes do corte, os utilizadores devem definir uma nova password no Supabase.

## Antes da migração
1. No Supabase, execute `supabase/migrations/004_migration_support.sql`.
2. Não desligue Firebase.
3. Crie uma pasta local `migration-secrets/` e coloque nela o service-account JSON do Firebase. Nunca faça commit.
4. Copie `.env.example` para `.env` e preencha as chaves localmente.
5. Execute primeiro `npm run migrate:dry`.
6. Confira `migration-output/firestore-manifest.json` e `migration-output/firebase_uid_map.json`.
7. Só depois execute `npm run migrate`.

## Pós-migração
- conferir contagens no Supabase;
- conferir clientes, vendedores, produtos, pedidos e avaliações;
- testar Auth com uma conta migrada;
- só depois portar o frontend e as Cloud Functions para Supabase;
- manter Firebase ativo até o teste final.
