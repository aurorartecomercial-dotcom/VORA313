# Ativar o cadastro de produtos pelo Admin

O painel administrativo já grava os produtos no Supabase. Antes de usar os novos
campos do formulário, execute uma única vez a migration:

`supabase/migrations/006_produtos_admin_fields.sql`

Depois disso, os produtos devem ser cadastrados em **Admin > Novo Produto**.
Não é necessário abrir o Supabase para cada produto.

## Fluxo

1. Entrar no Admin com uma conta cujo perfil tenha `role = admin` e `ativo = true`.
2. Abrir **Novo Produto**.
3. Preencher nome, categoria, preço, custo e estoque.
4. Enviar as imagens pelo botão **Supabase Storage** ou colar URLs.
5. Marcar **Produto ativo**.
6. Guardar.
7. Atualizar a loja.

## Imagens

O bucket usado é `vora-public`. A migration 005 já cria as regras de leitura pública
e upload autenticado para administradores.

## Se a loja continuar vazia

Abra o Console do navegador. O projeto agora registra erros como **Supabase**.
Confirme também que a migration 006 foi aplicada e que a conta usada no Admin
tem perfil de administrador.
