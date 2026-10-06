# VORA 313 — melhoria segura do painel administrativo

## Áreas
- `admin-vendas.html` / `js/admin-vendas.js`: pedidos, produtos, vendedores e financeiro.
- `admin-vendedores.html` / `js/admin-vendedores.js`: gestão dedicada de vendedores, produtos e vídeos.

## Autoridade
- Alterações administrativas continuam a passar pela Edge Function `api`.
- `requireAdmin()` valida sessão e consulta `profiles.role/ativo` no servidor.
- `gerirVendedor` agora usa também o cliente autenticado da Edge Function para que as políticas RLS participem da atualização.
- Nova operação `administrarProdutoVendedor` é autorizada novamente no PostgreSQL por `public.is_admin()`.

## Produtos
- Pesquisa por produto/ID/vendedor e filtro por estado foram adicionados à área de produtos de vendedores.
- Produto aprovado pode ser ocultado ou reativado.
- Reativação exige produto aprovado e vendedor aprovado/ativo.
- Eliminação física continua na migration `028_eliminar_produtos_vendedor_admin.sql`. Se o produto já pertence a `venda_itens`, a eliminação é bloqueada para preservar histórico.

## Histórico e auditoria
- Não existe exclusão de pedidos, pagamentos ou histórico nesta melhoria.
- Ações importantes continuam registadas em `eventos_seguranca`.
- A nova migration `035_admin_produtos_operacao_segura.sql` regista ocultação/reativação.

## UX
- Confirmação para ações destrutivas.
- Mensagens de sucesso/erro mais claras.
- Botões mostram estado de processamento para reduzir duplo clique.
- Filtros de pedidos existentes foram preservados.

## Limitação de teste
A validação local cobre sintaxe e invariantes de segurança. Testes contra o projeto Supabase real dependem de acesso ao ambiente/DNS do projeto.
