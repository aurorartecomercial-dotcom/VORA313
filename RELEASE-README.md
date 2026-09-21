# VORA 313 / Aurora Comercial — Release Supabase

## O que foi alterado

- Removidas as dependências Firebase do runtime do frontend.
- Criada configuração Supabase em `js/supabase-config.js`.
- Criada camada `js/supabase-compat.js` para preservar a API existente enquanto os módulos são migrados.
- Criado backend Supabase Edge Function `api`.
- Adicionado suporte Supabase Storage.
- Removidos Firebase Functions, Firebase Messaging e arquivos de configuração Firebase do runtime.
- Mantidas as ferramentas de importação histórica em `tools/` separadas do runtime.

## Antes de publicar

1. Configure `js/supabase-config.js`.
2. Execute as migrations 003, 004 e 005 no Supabase.
3. Publique `supabase/functions/api`.
4. Confirme Email/Password no Supabase Auth.
5. Se quiser checkout sem conta, ative Anonymous Sign-ins no Supabase Auth.
6. Teste catálogo, login, vendedor, admin, checkout, rastreio, avaliações e Storage.

## Segurança

A `anon/publishable key` pode ficar no frontend. A `service_role` key nunca deve ser publicada ou colocada em `js/`.
