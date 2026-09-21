# Deploy no GitHub Pages

O frontend estático original continua compatível com GitHub Pages.

**Não envie:** `.env`, service-account JSON, `SUPABASE_SERVICE_ROLE_KEY` ou qualquer segredo de pagamento.

As Cloud Functions Firebase continuam a ser implantadas pelo ambiente Firebase, não pelo GitHub Pages.

Para a migração Supabase, o GitHub Pages só deve receber o frontend e a chave pública `anon` quando o frontend estiver efetivamente preparado para Supabase.
