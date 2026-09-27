# Financeiro do marketplace — VORA 313

## Regra central

O pagamento do cliente não é dinheiro disponível para o vendedor. Cada venda percorre esta sequência:

```text
Pagamento confirmado → saldo pendente → entrega confirmada + 72 horas → saldo disponível → levantamento pago
```

Uma disputa, reembolso ou levantamento reserva o valor em **saldo retido**. O vendedor só pode pedir levantamento de pelo menos **5.000 Kz**, com dados de recebimento preenchidos e sem saldo em regularização.

## Saldos do vendedor

| Saldo | Significado |
| --- | --- |
| Pendente | Venda paga que ainda aguarda entrega e o prazo de segurança. |
| Disponível | Valor que já pode ser solicitado para levantamento. |
| Retido | Valor reservado para levantamento, disputa ou reembolso. |
| Já pago | Histórico de levantamentos aprovados e pagos. |
| Em regularização | Valor a compensar em vendas futuras quando um reembolso excede o saldo disponível. |

## Operação diária do administrador

1. Confirme o pagamento e atualize o estado do pedido normalmente.
2. Ao confirmar a entrega, aguarde 72 horas sem ocorrência.
3. Na aba **Financeiro marketplace**, use **Liberar saldos vencidos**. Esta ação só libera pedidos elegíveis.
4. Antes de marcar um levantamento como pago, faça a transferência/Multicaixa e registre o comprovativo ou uma nota.
5. Abra uma disputa somente para uma reclamação, devolução ou reembolso comprovado. Durante a disputa, o valor fica reservado.
6. Resolva a disputa como **Reembolsar** ou **Liberar vendedor**. A decisão, o movimento e a comissão ficam no histórico.

## Políticas implementadas

- O navegador não altera saldos diretamente; as alterações passam pelas funções seguras do backend.
- Cada alteração gera um movimento financeiro com data, pedido e motivo.
- Comissões ficam provisionadas no pagamento e são estornadas se houver reembolso aprovado.
- Saldo insuficiente num reembolso vira saldo em regularização, bloqueando novos levantamentos até compensação.
- O administrador não deve marcar um levantamento como pago antes de realizar a transferência real.

## Publicação obrigatória

1. Execute `supabase/migrations/011_financeiro_marketplace.sql` após as migrations anteriores.
2. Publique novamente `supabase/functions/api/index.ts` como Edge Function `api`.
3. Faça um teste completo: pagamento → entrega → liberação → levantamento → disputa → resolução.

Esta implementação organiza a operação do marketplace. Antes de operar pagamentos reais, valide impostos, guarda de fundos, reembolsos e termos de venda com contabilista, jurista e provedor de pagamentos autorizado em Angola.
