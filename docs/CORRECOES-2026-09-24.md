# Correções aplicadas — 24/09/2026

## O que foi corrigido

| Área | Causa encontrada | Correção |
| --- | --- | --- |
| Página inicial e detalhe | A página inicial usava `vora313_catalogo_cache_v3`, enquanto categoria e detalhe procuravam `vora313_catalogo_cache`. Um cartão podia ter um ID que a página de detalhe não conhecia. | As três páginas passam a usar `carregarCatalogo()` e a chave v4. O catálogo-base de `produtos.json` é combinado aos produtos públicos do Supabase. |
| Produtos na página inicial | O Supabase público tinha menos produtos migrados do que o catálogo-base. | A loja mantém os produtos-base visíveis durante a migração, sem esconder os produtos aprovados do Supabase. |
| Cadastro de vendedor | Um utilizador já autenticado via a loja via o seu e-mail bloqueado sem explicação. Quando a confirmação de e-mail estava ativa, a candidatura era enviada sem sessão. | A interface explica a conta associada, oferece **Usar outro e-mail** e orienta a confirmar o e-mail e entrar antes de enviar a candidatura. |
| Aprovação de vendedores | A página administrativa simples alterava o registo diretamente e não atualizava os produtos da loja. | A aprovação agora usa a ação segura `gerirVendedor` da Edge Function. |
| Painel de vendas | `await` era usado dentro de `trocarAba`, que não era uma função assíncrona. O módulo inteiro deixava de carregar. | `trocarAba` agora é `async`; o erro `Unexpected reserved word` deixa de ocorrer. |

## Publicação necessária

Publique os ficheiros estáticos no repositório GitHub Pages e publique a Edge Function atualizada no mesmo projeto Supabase:

```powershell
supabase functions deploy api
```

No Supabase SQL Editor, confirme que as migrations `009_admin_vendedores_vendas.sql` e `010_production_safety.sql` já foram executadas. Elas mantêm o RLS ativo e dão ao administrador acesso às listas de vendedores e produtos pendentes.

Depois da publicação, faça uma atualização forte no navegador (`Ctrl+F5`). O service worker foi versionado para `v43`, portanto os ficheiros antigos serão substituídos assim que a nova versão for obtida.

## Verificação após publicar

1. Abra a página inicial: os produtos-base e os produtos aprovados do Supabase devem aparecer.
2. Abra um produto da página inicial: os detalhes devem abrir, sem “Produto não encontrado”.
3. Crie uma candidatura com uma conta nova. Se a confirmação de e-mail estiver ativa, confirme o e-mail, entre e envie a candidatura.
4. No SQL Editor, confirme a candidatura:

```sql
select id, email, nome_loja, status, ativo, criado_em
from public.vendedores
order by criado_em desc;
```

5. Entre em `admin-vendedores.html` ou no separador **Vendedores** de `admin-vendas.html`, aprove a candidatura e confirme que o estado muda para `aprovado`.

## Nota sobre o catálogo-base

`produtos.json` contém 28 produtos, mas não informa stock. Não atribuí quantidades fictícias: para permitir checkout desses produtos pelo backend, importe os produtos reais para `public.produtos` com o stock correto. Os produtos criados por vendedores já seguem o fluxo normal de aprovação e stock no Supabase.
