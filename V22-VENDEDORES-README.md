# VORA 313 V22 — vendedores e marketplace

V22 revisa o fluxo de vendedores, produtos, aprovação, destaques, lojas e levantamentos.

## Correções principais
- Conta existente: candidatura pode usar a conta Firebase já autenticada; email duplicado direciona para login/recuperação de palavra-passe.
- Produtos de vendedores carregam `vendedorAtivo` e deixam de aparecer quando a loja é suspensa.
- Aprovação de produto confirma que o vendedor está aprovado e ativo.
- Destaques impedem duplicação enquanto houver pedido pendente ou destaque ativo e respeitam 7/15/30 dias.
- Administração de destaque usa Cloud Function, respeitando as regras do Firestore.
- Vendedor pode editar produtos; a edição volta para aprovação.
- Perfil da loja pode ser atualizado pelo vendedor aprovado.
- Dados de recebimento são guardados no perfil e copiados para cada solicitação de levantamento.
- Levantamento só pode ser solicitado com dados de recebimento configurados; o valor é retido em transação.
- Suspensão/reativação sincroniza o estado público dos produtos do vendedor.

## Pagamentos
O destaque e o levantamento continuam com confirmação/processamento administrativo. Nenhum gateway ou pagamento automático é inventado nesta versão.
