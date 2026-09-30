# Vitrine Editorial de lojas

Esta opção cria uma apresentação de revista dentro da página pública de cada vendedor. Não cria outra loja, não duplica produtos e não muda o carrinho.

## Antes de publicar

1. Execute `supabase/migrations/020_vitrine_editorial_lojas.sql` no SQL Editor do Supabase.
2. Publique os arquivos do site e faça o deploy da Edge Function `api`.
3. Na Central do Vendedor, abra **Minha Loja** e escolha um dos estilos editoriais.
4. Escolha uma imagem de capa vertical, uma coleção e um produto já publicado.

## Proteções aplicadas

- Apenas quatro estilos são aceites: padrão, Moda, Beleza e Livros.
- Título, chamada e coleção são texto simples com limites curtos; HTML livre não é permitido.
- A capa continua a exigir URL HTTPS.
- O produto editorial só é mostrado se ele já vier do catálogo público daquela loja.
- O botão de compra usa a mesma sacola já existente; não há um checkout paralelo.

## Imagem recomendada

Use uma fotografia vertical em proporção 4:5. Para moda, mostre o look completo; para beleza, uma rotina ou produtos; para livros, uma capa ou pilha de livros. Toda imagem continua sujeita à revisão de conteúdo da VORA 313.
