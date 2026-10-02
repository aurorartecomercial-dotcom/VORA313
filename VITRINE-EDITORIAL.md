# Vitrine Editorial e temas de categoria

Esta opção cria uma apresentação de revista dentro da página pública de cada vendedor. Também permite um tema de cor automático para Tecnologia, Automotivo, Games, Moda, Beleza, Casa e Livros. Não cria outra loja, não duplica produtos e não muda o carrinho.

## Antes de publicar

1. Execute `supabase/migrations/020_vitrine_editorial_lojas.sql` e depois `supabase/migrations/022_temas_categoria_lojas.sql` no SQL Editor do Supabase.
2. Publique os arquivos do site e faça o deploy da Edge Function `api`.
3. Na Central do Vendedor, abra **Minha Loja** e escolha **Tema da categoria** ou um dos estilos editoriais.
4. Escolha uma imagem de capa vertical, uma coleção e um produto já publicado.

## Proteções aplicadas

- Apenas cinco estilos são aceites: padrão, tema da categoria, Moda, Beleza e Livros.
- O tema da categoria usa uma paleta interna da VORA; o vendedor não envia cor, CSS, HTML ou JavaScript.
- Título, chamada e coleção são texto simples com limites curtos; HTML livre não é permitido.
- A capa continua a exigir URL HTTPS.
- A vitrine mostra até cinco produtos já publicados da própria loja. O produto escolhido pelo vendedor aparece primeiro; os restantes são completados por destaques e pelo catálogo público.
- Ao tocar num produto da coleção, a imagem grande à esquerda muda para esse produto. A capa guardada da loja não é alterada.
- O botão de compra usa a mesma sacola já existente; não há um checkout paralelo.

## Quando usar cada opção

- **Padrão VORA:** loja que prefere o visual clássico do marketplace.
- **Tema da categoria:** muda a cor da capa, botões e destaques de modo controlado. Automotivo usa grafite/vermelho, Games usa azul/roxo, Eletrónicos usa azul, Moda usa vinho/creme e assim por diante.
- **Editorial:** ideal para Moda, Beleza e Livros. Mostra capa grande e até cinco produtos publicados da própria loja.

## Imagem recomendada

Use uma fotografia vertical em proporção 4:5. Para moda, mostre o look completo; para beleza, uma rotina ou produtos; para livros, uma capa ou pilha de livros. Toda imagem continua sujeita à revisão de conteúdo da VORA 313.

## Pré-visualização sem Supabase

Para testar as vitrines sem criar vendedor nem gravar dados, abra `loja.html?demo=1`.
Também existem três exemplos visuais:

- `loja.html?demo=1&estilo=editorial_moda`
- `loja.html?demo=1&estilo=editorial_beleza`
- `loja.html?demo=1&estilo=editorial_livros`

Esses links servem apenas para apresentação local; não são lojas reais nem alteram o catálogo.
