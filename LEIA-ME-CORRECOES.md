# VORA 313 — correções prontas

O pacote `aurora-comercial-corrigido.zip` contém o site corrigido.

## Correções incluídas

- Página inicial, categoria e detalhe usam o mesmo catálogo e os mesmos IDs.
- Produtos-base de `produtos.json` permanecem visíveis durante a migração do Supabase.
- A página de detalhe deixa de mostrar “Produto não encontrado” para produtos abertos a partir da página inicial.
- O cadastro de vendedor mostra a conta em uso, permite trocar de e-mail e orienta a confirmação de e-mail antes de enviar a candidatura.
- A aprovação de vendedor usa a Edge Function, atualizando também a disponibilidade dos produtos da loja.
- O painel `admin-vendas.html` deixa de falhar com `Unexpected reserved word`.
- O cache do service worker foi renovado.

## Para publicar

1. Extraia o ZIP e publique os ficheiros no repositório do GitHub Pages.
2. No projeto Supabase correspondente, execute as migrations `009_admin_vendedores_vendas.sql` e `010_production_safety.sql` apenas se ainda não foram aplicadas.
3. Publique a Edge Function atualizada:

```powershell
supabase functions deploy api
```

4. Abra o site e faça `Ctrl+F5` uma vez.

## Teste rápido

1. Abra um produto diretamente da página inicial.
2. Crie uma candidatura de vendedor. Se a confirmação de e-mail estiver ativa, confirme o e-mail, entre e envie a candidatura.
3. Abra `admin-vendedores.html` ou o separador **Vendedores** no painel de vendas; a candidatura deve aparecer como pendente para aprovação.

Não atribuí stock fictício aos 28 produtos-base. Para concluir o checkout desses itens, importe para o Supabase as quantidades reais de stock.
