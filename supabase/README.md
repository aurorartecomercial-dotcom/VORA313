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
9. `009_admin_vendedores_vendas.sql` — gestão administrativa de vendedores e vendas
10. `010_production_safety.sql` — proteções de produção
11. `011_vendedor_cadastro_resiliente.sql` — candidatura e produtos de vendedor resilientes
12. `012_perfil_publico_loja.sql` — dados públicos e visuais da loja
13. `013_central_vendedor_segura.sql` — Central do Vendedor, view pública segura e RPCs de perfil/recebimento

Como 001 e 002 já foram executadas no projeto atual, a próxima execução deve começar em 003.

## Edge Function

`functions/api/index.ts` contém o backend privilegiado usado pelo frontend.

## Segurança

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca coloque credenciais administrativas no GitHub.
- A chave `anon/publishable` pode ser usada no browser quando o RLS está corretamente configurado.
- A ponte `firebase_uid` existe somente para facilitar a migração de dados antigos; o runtime novo usa UUIDs Supabase.
- Dados públicos de lojas devem ser lidos por `public.lojas_publicas`; não exponha a tabela `public.vendedores` diretamente ao público.
