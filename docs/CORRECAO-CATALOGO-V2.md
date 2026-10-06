# Correção de catálogo e vitrines — V2

Esta correção elimina o ponto único de falha introduzido na V2: se a pesquisa avançada do catálogo, a view pública de lojas ou a policy de produtos do vendedor ainda não estiverem atualizadas no Supabase, o site mantém uma alternativa segura para continuar a apresentar os dados públicos.

## Publicação necessária

1. No Supabase, aplique as migrations pendentes pela ordem numérica. Se o projeto já estiver atualizado até à `037`, execute a nova `supabase/migrations/038_reparar_publicacao_produtos_admin.sql` no SQL Editor. Ela publica apenas os produtos do painel administrativo (sem vendedor) que ficaram sem os campos obrigatórios da V2.
2. Publique novamente a Edge Function `api`. A função inclui `listarProdutosVendedor`, usada somente quando a policy direta ainda não estiver disponível.
3. Publique os ficheiros do site e faça uma atualização completa no navegador (`Ctrl+F5`).

## Resultado esperado

- A página inicial volta a mostrar os produtos aprovados que já existem em `public.produtos`.
- A Central do Vendedor volta a listar os produtos do utilizador autenticado, inclusive pendentes e recusados.
- `loja.html?id=...` mostra nome, logótipo, descrição e produtos. Se a view estiver temporariamente indisponível, os produtos públicos e o nome guardado no produto ainda ficam visíveis.

Produtos enviados por vendedores continuam em `aguardando_aprovacao` até a aprovação no painel administrativo. Isso é normal: só depois ficam visíveis tanto na loja do vendedor como no marketplace principal.

Nenhuma policy foi aberta para visitantes além do catálogo público. A tabela completa de vendedores continua inacessível pelo navegador.
