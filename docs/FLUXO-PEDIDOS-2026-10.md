# VORA 313 — Fluxo de acompanhamento de pedidos

## Estados reais do pedido

A tabela `public.vendas` já possui a estrutura necessária e não foram criados novos estados:

- `aguardando_pagamento` → Pedido realizado / pagamento pendente
- `pago` → Pagamento confirmado
- `em_preparacao` → Em preparação
- `enviado` → Enviado / em entrega
- `entregue` → Entregue
- `cancelado` → Cancelado

“Pedido realizado” é uma etapa visual derivada de `criado_em`; não é um novo valor de `vendas.status`.

## Permissões

- Comprador: lê apenas os próprios pedidos e o respetivo histórico. Não possui permissão para alterar o estado.
- Vendedor: pode avançar `pago → em_preparacao → enviado → entregue` somente quando todos os itens do pedido pertencem à sua loja. Pedidos com várias lojas ficam sob supervisão administrativa porque o banco possui um estado global por pedido, não um estado por item.
- Administrador: mantém supervisão e pode usar as transições já existentes, incluindo cancelamento quando permitido pela máquina de estados.
- Pagamento/sistema: a confirmação do pagamento continua passando pela função financeira existente e muda `aguardando_pagamento → pago` de forma transacional.

## Histórico

A migration `032_historico_fluxo_pedidos.sql` cria `pedido_status_historico` e um trigger que regista criação e cada alteração de estado dentro da mesma transação do pedido. O histórico não recebe operações de apagar/editar por compradores ou vendedores.

## Linha do tempo

`meus-pedidos.html` / `js/meus-pedidos.js` apresentam:

1. Pedido realizado
2. Pagamento pendente
3. Pagamento confirmado
4. Em preparação
5. Enviado
6. Entregue
7. Cancelado, quando aplicável

As etapas continuam ligadas aos estados reais do banco; a etapa inicial “Pedido realizado” não cria um novo status.
