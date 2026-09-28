# Revisão de produtos de vendedores

## O que mudou

O administrador não aprova mais apenas pelo nome do produto. A fila mostra
uma miniatura e abre uma tela de revisão com todas as imagens, descrição,
categoria, marca, SKU, preço, stock, loja e e-mail do vendedor.

Para publicar ou recusar, o administrador deve confirmar quatro pontos:

1. Viu todas as imagens e não encontrou conteúdo proibido ou inadequado.
2. O produto e a categoria podem ser anunciados.
3. Nome, preço, stock e descrição não parecem enganosos.
4. Assume a decisão segundo a política do marketplace.

Na recusa, o motivo é obrigatório. O vendedor recebe esse motivo no estado do
produto e, depois de corrigir o anúncio, ele volta para `aguardando_aprovacao`.
O banco também bloqueia a aprovação de um produto sem pelo menos uma imagem
válida enviada pelo vendedor.

## Registo e segurança

Cada decisão cria uma linha em `moderacoes_produtos` com:

- produto e vendedor;
- administrador, e-mail e data/hora;
- decisão, checklist e nota;
- cópia do anúncio exatamente como estava no momento da decisão.

Os campos de publicação e revisão de produtos de vendedores são protegidos no
banco. A alteração só é aceite pelo fluxo da Edge Function `api`, depois da
validação de uma conta administradora. Se a API ou a migration não estiverem
publicadas, a decisão falha e o produto continua inalterado.

## Política mínima recomendada

Recuse imediatamente produtos ou imagens com conteúdo ilegal, sexual ou
explícito, violência gráfica, armas ou produtos proibidos, contrafação,
medicamentos/alegações de saúde sem autorização, dados pessoais, fraude ou
descrição/preço que induza o cliente ao erro. Peça sempre uma explicação curta
e prática da correção, por exemplo: “Substitua a foto que mostra conteúdo
proibido e envie uma descrição real do produto.”

Este controlo apoia a revisão humana; ele não substitui análise jurídica nem
uma ferramenta automática de deteção de imagens. Produtos de alto risco devem
ser revistos por uma segunda pessoa antes de publicar.

## Publicação obrigatória

1. Execute `supabase/migrations/014_revisao_produtos_vendedores.sql` no
   projeto Supabase, depois das migrations já aplicadas.
2. Publique novamente `supabase/functions/api/index.ts` como Edge Function
   `api`.
3. Como administrador, abra **Vendedores → Rever e decidir**, marque o
   checklist e faça um teste de aprovação e de recusa.
