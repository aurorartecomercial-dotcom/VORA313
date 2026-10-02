# Operação de compras 1–5 — VORA 313

Este pacote fecha cinco pontos sem afirmar que existe uma cobrança bancária
automática antes de ela ter sido contratada e testada.

## 1. Imagens sem pedido quebrado

Imagens antigas que têm apenas um nome de ficheiro, como `PS4_PRETA22.jpg`, não
são usadas como URL pública. O site mostra o estado “sem imagem” em vez de fazer
um pedido 404 repetido. A correção definitiva de cada produto é enviar a imagem
para o Storage VORA pelo formulário do vendedor e guardar a URL HTTPS recebida.

## 2. Pagamento

- O fluxo real disponível é transferência com comprovativo.
- A tentativa entra em `pagamentos`; só administrador/servidor confirma o
  pagamento e muda o pedido para pago.
- Visa, Multicaixa, BAI, BFA e BIC aparecem apenas como canais em preparação.
  Não há formulário de cartão no site e nenhuma chave bancária é publicada.

Para ligar um gateway: contrato do parceiro, credenciais em **Edge Function
Secrets**, criação de cobrança no servidor e webhook assinado que confira ID,
valor, moeda e estado antes de chamar `confirmar_pagamento_vora`.

## 3. Meus pedidos

`meus-pedidos.html` é privado. Mostra pedidos da conta autenticada, estado,
itens, opções escolhidas e fatura. O rastreio público continua sem dados de
cliente.

## 4. Tamanho, cor e opções

O vendedor escreve uma linha por tipo no editor do produto:

```text
Tamanho: P | M | G
Cor: Preto | Branco | Azul
```

O cliente precisa escolher as opções obrigatórias antes de adicionar. O servidor
valida cada opção contra o produto e grava a cópia em `venda_itens.variacao`.
O estoque atual continua único por produto; estoque separado por tamanho/cor é
uma evolução posterior, pois exige uma tabela e reposição própria por variante.

## 5. Avaliações

O botão de avaliar só é apresentado a uma conta que comprou aquele produto e
tem um pedido entregue. A mesma regra é aplicada novamente na Edge Function;
alterar o navegador não permite burlar a entrega.

## Publicação

1. Execute `supabase/migrations/021_operacao_compras_variacoes.sql` no SQL
   Editor, uma vez.
2. Publique `supabase/functions/api/index.ts` como atualização da função `api`.
3. Publique todos os ficheiros web juntos no GitHub Pages.
4. Teste: criar produto com tamanho/cor, adicionar duas opções diferentes,
   finalizar em transferência, abrir **Meus pedidos**, e marcar como entregue
   pelo fluxo administrativo antes de avaliar.
