# Ferramentas de migração VORA 313

Estas ferramentas executam a migração controlada do Firebase para Supabase.

## Requisitos
- Node.js 20+
- service account do Firebase Admin guardado apenas localmente
- Supabase `service_role` guardada apenas localmente
- migrations 001–004 aplicadas no Supabase

## Comandos

```bash
npm install
npm run migrate:dry
npm run migrate
```

O `migrate:dry` exporta e transforma sem escrever no Supabase. O `migrate` cria/associa Auth e importa os dados modelados.

**Nunca faça commit do `.env`, do service account ou da pasta `migration-output`.**
