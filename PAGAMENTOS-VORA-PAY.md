# Pagamentos VORA Pay — fase 1

Esta fase cria uma base auditável de pagamentos, sem alegar que um pagamento foi cobrado antes da integração bancária estar ativa.

## O que já fica preparado

- Cada tentativa de pagamento recebe um registo em `pagamentos`.
- O cliente só consegue ver os pagamentos dos seus próprios pedidos.
- O navegador não consegue alterar uma venda para `pago`.
- A confirmação protegida chama a transição existente do pedido: baixa stock, valida cupom e cria a provisão financeira do vendedor na mesma transação.
- O método atual de transferência e envio de comprovativo por WhatsApp continua disponível, para que nenhuma venda fique bloqueada.

## Publicação obrigatória

1. No Supabase, abra **SQL Editor** e execute por inteiro o ficheiro `supabase/migrations/015_pagamentos_vora_pay.sql`.
2. Na Edge Function `api`, substitua o código por `supabase/functions/api/index.ts` e clique **Deploy updates**.
3. Publique os ficheiros do site no GitHub Pages normalmente.

Sem os passos 1 e 2, o checkout continua a enviar para WhatsApp como antes. Isto foi intencional para não interromper vendas durante a publicação.

## Como confirmar um comprovativo manualmente

Depois de a área administrativa ganhar o botão de confirmação, ela deve chamar a Edge Function:

```js
confirmarPagamentoManual({ pagamentoId, nota: 'Comprovativo conferido' })
```

Essa função só aceita um administrador autenticado e não aceita que o cliente marque a própria compra como paga.

## Ativação de Multicaixa Express, referência ou cartão

Para ativar cobrança automática ainda é necessário contratar/configurar um gateway pelo banco ou parceiro de pagamentos. Não coloque chaves de banco, chaves de cartão ou `service_role` no frontend, GitHub ou WhatsApp.

Quando a VORA tiver o contrato, a próxima fase é:

1. Criar a cobrança no provedor dentro da Edge Function usando somente secrets.
2. Guardar o identificador do provedor em `pagamentos.provedor_pagamento_id`.
3. Receber um webhook assinado do provedor.
4. Validar assinatura, valor, moeda e estado.
5. Chamar `confirmar_pagamento_vora` uma única vez para marcar o pedido como pago.

O webhook é a única confirmação automática confiável. O regresso do cliente à página de sucesso não prova que o banco recebeu o dinheiro.
