# Migrations e proteção completa — VORA 313

Não execute migrations antigas uma segunda vez só porque aparecem nesta lista.
No Supabase, confirme o que já foi executado no SQL Editor/histórico e aplique
apenas os ficheiros em falta, pela ordem abaixo.

## Ordem para uma instalação nova

1. `001_schema.sql`
2. `002_auth_trigger.sql`
3. `003_firebase_uid_bridge.sql` e `004_migration_support.sql` somente se houver importação Firebase
4. `005_supabase_frontend_support.sql`
5. `006_produtos_admin_fields.sql`
6. `007_security_hardening.sql`
7. `008_vora313_schema_repair.sql`
8. `009_admin_vendedores_vendas.sql`
9. `010_production_safety.sql`
10. `011_financeiro_marketplace.sql`
11. `011_vendedor_cadastro_resiliente.sql`
12. `012_perfil_publico_loja.sql`
13. `013_central_vendedor_segura.sql`
14. `014_revisao_produtos_vendedores.sql`
15. `015_pagamentos_vora_pay.sql`
16. `016_seguranca_p0_uploads_e_limites.sql`
17. `017_seguranca_p1_privacidade_perfil_loja.sql`
18. `018_seguranca_p2_auditoria.sql`
19. `019_seguranca_p3_manutencao.sql`

## Para o projeto já em funcionamento

1. Confirme que `007_security_hardening.sql` e `010_production_safety.sql`
   foram executadas. Elas impedem promoção de conta, alteração de pontos e
   manipulação de campos financeiros pelo navegador.
2. Execute `016`, `017`, `018` e `019`, uma a uma, e confirme a mensagem de
   sucesso de cada uma antes de continuar.
   A `017` limpa links públicos antigos que não obedecem à política HTTPS; ela
   não remove produtos nem o registo interno de morada do vendedor.
3. Publique a Edge Function `api` e depois o frontend. A ordem é importante
   porque a migration 016 bloqueia o upload antigo direto ao bucket.
4. Faça os testes indicados em `SEGURANCA-P0-DEPLOY.md`.

## Depois das migrations

Configure no painel Supabase a confirmação de e-mail, palavra-passe mínima de
12 caracteres, proteção contra palavras-passe comprometidas, CAPTCHA e MFA
para administradores. Estes itens não podem ser ligados com segurança apenas
por SQL ou por ficheiros publicados no GitHub Pages.

Para a limpeza P3, crie uma tarefa de servidor mensal que chame
`limpar_registos_seguranca(8, 365)` usando a service role. Nunca exponha essa
chave no frontend.
