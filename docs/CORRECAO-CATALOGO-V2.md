# Correção de catálogo e vitrines — V2

Esta correção elimina o ponto único de falha introduzido na V2: se a pesquisa avançada do catálogo, a view pública de lojas ou a policy de produtos do vendedor ainda não estiverem atualizadas no Supabase, o site mantém uma alternativa segura para continuar a apresentar os dados públicos.

## Publicação necessária

1. No Supabase, aplique as migrations pendentes pela ordem numérica. Se o projeto já estiver atualizado até à `036`, execute a nova `supabase/migrations/037_recuperacao_catalogo_e_vitrines.sql` no SQL Editor.
2. Publique novamente a Edge Function `api`. A função inclui `listarProdutosVendedor`, usada somente quando a policy direta ainda não estiver disponível.
3. Publique os ficheiros do site e faça uma atualização completa no navegador (`Ctrl+F5`).

## Resultado esperado

- A página inicial volta a mostrar os produtos aprovados que já existem em `public.produtos`.
- A Central do Vendedor volta a listar os produtos do utilizador autenticado, inclusive pendentes e recusados.
- `loja.html?id=...` mostra nome, logótipo, descrição e produtos. Se a view estiver temporariamente indisponível, os produtos públicos e o nome guardado no produto ainda ficam visíveis.

Nenhuma policy foi aberta para visitantes além do catálogo público. A tabela completa de vendedores continua inacessível pelo navegador.
