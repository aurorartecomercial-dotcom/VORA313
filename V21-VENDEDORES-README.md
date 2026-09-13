# VORA 313 V21 — Marketplace de vendedores

## O que foi implementado
- Cadastro e login de vendedor com Firebase Authentication.
- Candidatura de vendedor criada por Cloud Function.
- Aprovação, recusa, suspensão e reativação pelo administrador.
- Claim `seller` para proteger funções de vendedor.
- Painel do vendedor.
- Cadastro/edição de produtos pelo vendedor via Cloud Functions.
- Aprovação de produtos pelo administrador antes de publicação.
- Upload de imagens do vendedor em Firebase Storage.
- Página pública da loja (`loja.html?id=UID`).
- Solicitação de produto patrocinado: 7/15/30 dias.
- Ativação do destaque pelo administrador após confirmação manual do pagamento.
- Expiração do destaque considerada no catálogo público.
- Registo de vendas por vendedor e saldo disponível para novas vendas pagas.
- Solicitação de levantamento e aprovação/recusa pelo administrador.
- Planos Básico, Profissional e Premium administráveis.
- Regras Firestore/Storage separadas para administrador, vendedor e público.

## Fluxo comercial
1. Cliente cria conta de vendedor.
2. VORA analisa e aprova.
3. Vendedor adiciona produto.
4. Administrador aprova produto.
5. Produto fica público.
6. Vendedor pode solicitar destaque.
7. Administrador confirma o pagamento do destaque e ativa o período.
8. Quando uma venda é confirmada como paga, a comissão é calculada no servidor e o saldo do vendedor é registado.
9. Vendedor solicita levantamento; administrador processa.

## Importante
O gateway de pagamento automático e o pagamento automático aos vendedores ainda não estão ativos. O levantamento é uma solicitação administrativa. A V21 não deve ser apresentada como se tivesse pagamentos/payouts automáticos.

## Deploy
Depois de publicar as Cloud Functions, Firestore Rules e Storage Rules, o vendedor aprovado pode precisar sair/entrar novamente para receber o claim `seller` atualizado.
