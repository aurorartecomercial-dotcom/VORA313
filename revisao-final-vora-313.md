# Revisão final — VORA 313

O código foi revisado e uma cópia corrigida foi incluída no ZIP entregue. Não houve alteração no Supabase de produção.

## Corrigido no pacote

- Escalada de privilégios na criação de vendedor.
- Transações de pedido, estoque, cupom, comissão, saldo e pontos.
- Duplicação de pedidos causada por repetição de checkout.
- Leitura ambígua de valores em Kz.
- Avaliação sem compra entregue e gravação bloqueada por RLS.
- Corrida em pedidos de levantamento.
- Escrita de fidelidade pelo navegador.
- Service worker duplicado e pré-cache excessivo de banners.
- Links externos abertos sem `noopener`.

## Validações concluídas

- Testes de preço: 2 aprovados.
- Sintaxe de todos os ficheiros JavaScript/MJS: aprovada.
- Recursos locais referenciados pelo HTML: existentes.
- Página inicial testada localmente em desktop e telemóvel de 375 px: sem overflow horizontal e sem erros de console.

## Antes de colocar no ar

1. Faça backup e aplique as migrations, inclusive `010_production_safety.sql`.
2. Publique novamente a Edge Function `api`.
3. Teste o fluxo em homologação: pagamento repetido, produto sem estoque, cupom esgotado e levantamento simultâneo.
4. Importe/publique o catálogo real no Supabase. O ambiente testado não mostrou produtos publicados no banco.
5. Para automatizar pagamentos, integre o gateway e aceite mudança para `pago` somente via webhook assinado.

O ZIP contém `REVISED-README.md` e `REVISAO-FINAL-2026-09.md` com detalhes de deploy e alterações.
