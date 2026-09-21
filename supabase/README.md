# VORA 313 — Supabase

Esta pasta contém o backend definitivo do VORA 313.

## Migrations

Ordem completa:

1. `001_schema.sql`
2. `002_auth_trigger.sql`
3. `003_firebase_uid_bridge.sql` — ponte temporária para dados históricos
4. `004_migration_support.sql` — apoio à importação histórica
5. `005_supabase_frontend_support.sql` — suporte do frontend e Storage

Como 001 e 002 já foram executadas no projeto atual, a próxima execução deve começar em 003.

## Edge Function

`functions/api/index.ts` contém o backend privilegiado usado pelo frontend.

## Segurança

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca coloque credenciais administrativas no GitHub.
- A chave `anon/publishable` pode ser usada no browser quando o RLS está corretamente configurado.
- A ponte `firebase_uid` existe somente para facilitar a migração de dados antigos; o runtime novo usa UUIDs Supabase.
