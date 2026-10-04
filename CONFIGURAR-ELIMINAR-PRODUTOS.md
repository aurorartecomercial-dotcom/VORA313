# Eliminar produtos de vendedores — configuração obrigatória

O painel administrativo agora permite:

- **Eliminar** um produto específico;
- **Limpar catálogo** para apagar todos os produtos sem vendas de uma loja.

A ação exige que o administrador escreva `ELIMINAR`. Ela é definitiva.

## Proteção dos pedidos antigos

Um produto que já faz parte de um pedido **não é apagado**. O sistema bloqueia a ação para não quebrar a fatura, o pagamento, a comissão ou o histórico do cliente. Se a loja não estiver mais ativa, use **Suspender**: os anúncios deixam de aparecer aos clientes, mas os registos antigos continuam seguros.

## Publicar no Supabase

1. No **Supabase > SQL Editor**, abra o ficheiro `supabase/migrations/028_eliminar_produtos_vendedor_admin.sql` deste projeto, copie todo o conteúdo e clique em **Run** uma única vez.
2. No **Supabase > Edge Functions > api > Code**, substitua o conteúdo pelo ficheiro `supabase/functions/api/index.ts` deste projeto e clique em **Deploy updates**.
3. Publique o projeto no GitHub Pages e faça uma atualização forçada no navegador (`Ctrl + F5`).

Depois disso, em `admin-vendas.html` na aba **Vendedores**, cada produto terá o botão **Eliminar** e cada loja com produtos terá **Limpar catálogo**. A página alternativa `admin-vendedores.html` traz as mesmas ações.

> Apenas o backend com sessão administrativa pode executar a eliminação. A chave `service_role` nunca deve ser colocada no site ou no GitHub.
