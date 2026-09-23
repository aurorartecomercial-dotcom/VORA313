# VORA 313 — Supabase

Esta pasta contém o backend definitivo do VORA 313.

## Migrations

Ordem completa:

1. `001_schema.sql`
2. `002_auth_trigger.sql`
3. `003_firebase_uid_bridge.sql` — ponte temporária para dados históricos
4. `004_migration_support.sql` — apoio à importação histórica
5. `005_supabase_frontend_support.sql` — suporte do frontend e Storage
6. `006_produtos_admin_fields.sql` — campos adicionais do painel admin
7. `007_security_hardening.sql` — proteção de campos sensíveis
8. `008_vora313_schema_repair.sql` — correção idempotente do schema + reload PostgREST
9. `009_admin_vendedores_vendas.sql` — RLS do painel de vendedores/vendas
10. `010_security_rls_repair.sql` — grants/RLS finais e proteção do primeiro registo de cliente

Se o projeto já tiver 001–009 aplicadas, execute apenas a `010_security_rls_repair.sql`. Se alguma migration anterior faltar, execute-as pela ordem.

## Edge Function

`functions/api/index.ts` contém o backend privilegiado usado pelo frontend.

## Segurança

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca coloque credenciais administrativas no GitHub.
- A chave `anon/publishable` pode ser usada no browser quando o RLS está corretamente configurado.
- A ponte `firebase_uid` existe somente para facilitar a migração de dados antigos; o runtime novo usa UUIDs Supabase.
