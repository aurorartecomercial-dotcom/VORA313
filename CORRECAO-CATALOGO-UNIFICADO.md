# Correção do catálogo público — VORA 313

## O que foi corrigido

- A página inicial passa a usar a consulta pública directa como contingência
  quando a RPC de catálogo responder vazia. A consulta mantém os três critérios
  de segurança: produto activo, vendedor activo e produto aprovado.
- As categorias permanecem visíveis na página inicial mesmo durante uma falha
  temporária de catálogo.
- A página de categoria deixou de depender de uma correspondência exacta de
  texto. Por exemplo, a área **Games & Consolas** encontra produtos gravados
  como `Games`, `games` e `Consolas`; uma subcategoria como `Consolas` mantém
  o seu recorte próprio.
- Todas as páginas públicas passam a carregar a mesma versão do módulo de
  catálogo e o cache do Service Worker foi renovado.

## Publicar esta correção

1. Publique o conteúdo desta pasta no repositório/hosting da VORA 313,
   substituindo os ficheiros existentes.
2. Aguarde o deploy do GitHub Pages terminar.
3. Abra o site uma vez com Internet. O cache `v63-catalogo-unificado` substitui
   automaticamente o cache anterior; se o navegador continuar antigo, faça
   uma atualização forçada (`Ctrl+F5`).

## Regra que continua protegida

Produtos de vendedores só entram no marketplace depois de serem aprovados na
área administrativa. Esta correção **não** publica automaticamente produtos
pendentes, recusados, inactivos ou de lojas suspensas.

Se um produto aprovado continuar invisível depois do deploy, aplique no
Supabase as migrations pendentes `030_catalogo_pesquisa_supabase.sql`,
`037_recuperacao_catalogo_e_vitrines.sql` e
`038_reparar_publicacao_produtos_admin.sql`, nessa ordem, e atualize a página.
