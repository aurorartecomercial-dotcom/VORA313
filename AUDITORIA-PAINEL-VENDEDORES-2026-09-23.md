# Correção do painel de vendedores — 2026-09-23

## Problema observado
O painel autenticava o administrador, mas mostrava `0 vendedor(es) listado(s)`.

## Causa técnica provável
O frontend fazia leitura direta de `public.vendedores` e `public.vendas_vendedor` através do PostgREST/RLS. Quando a policy/grant de produção não correspondia ao código, a administração podia ver uma lista vazia mesmo existindo vendedores.

## Correção
A listagem administrativa foi movida para a Edge Function `listarVendedoresAdmin`, protegida por `requireAdmin()` e executada com `service_role`. O frontend deixa de depender das policies de leitura dessas duas tabelas para montar o painel.

Também foi adicionado tratamento explícito de erro, para que uma falha de backend não seja apresentada falsamente como `0 vendedores`.

## Importante
A nova função precisa ser publicada no Supabase antes de testar o novo frontend. O cache do HTML também foi atualizado para `admin-vendedores.js?v=20260923-03`.
