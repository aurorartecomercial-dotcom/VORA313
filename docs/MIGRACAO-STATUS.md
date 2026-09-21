# VORA 313 — Estado da migração

## O que este pacote entrega

- Projeto original completo preservado.
- Firebase continua sendo o backend de produção atual.
- Estrutura Supabase versionada em `supabase/migrations/`.
- Ponte Firebase UID → Supabase Auth UUID.
- Ferramentas administrativas de export do Firestore/Auth.
- Instruções de segurança para não publicar service-role keys.

## O que NÃO foi falsificado

Não há uma troca automática do frontend para Supabase sem validar os dados reais e os pagamentos. Também não foram inventadas as quatro funções de pagamento que o frontend referencia mas que não estão exportadas pelo `functions/index.js` original.

## Corte para Supabase

A ordem segura é:

1. Executar migrations.
2. Exportar Firebase.
3. Criar/migrar Auth e preencher `firebase_uid_map`.
4. Transformar documentos para o schema relacional.
5. Validar contagens e totais.
6. Migrar Storage.
7. Portar as 15 Cloud Functions para Edge Functions/RPCs.
8. Trocar os imports do frontend.
9. Testar checkout, vendedor, admin, rastreio e pagamentos.
10. Só depois retirar Firebase.
