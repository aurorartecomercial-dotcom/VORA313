# Correções aplicadas — 24/09/2026

## O que foi corrigido

| Área | Causa encontrada | Correção |
| --- | --- | --- |
| Página inicial e detalhe | A página inicial usava `vora313_catalogo_cache_v3`, enquanto categoria e detalhe procuravam `vora313_catalogo_cache`. Um cartão podia ter um ID que a página de detalhe não conhecia. | As três páginas passam a usar `carregarCatalogo()` e a chave v5. O catálogo-base de `produtos.json` é combinado aos produtos públicos do Supabase. |
| Produtos na página inicial | O Supabase público tinha menos produtos migrados do que o catálogo-base. | A loja mantém os produtos-base visíveis durante a migração, sem esconder os produtos aprovados do Supabase. |
| Cadastro de vendedor | Um utilizador já autenticado via a loja via o seu e-mail bloqueado sem explicação. Quando a confirmação de e-mail estava ativa, a candidatura era enviada sem sessão. | A interface explica a conta associada, oferece **Usar outro e-mail** e orienta a confirmar o e-mail e entrar antes de enviar a candidatura. |
| Aprovação de vendedores | A Edge Function pode estar ausente, desatualizada ou devolver erro; nesse caso o botão não conseguia aprovar a candidatura. | O painel usa `gerirVendedor` e, se ela falhar, tenta a atualização direta permitida pelas políticas RLS do administrador, incluindo a disponibilidade dos produtos da loja. |
| Painel de vendas | `await` era usado dentro de `trocarAba`, que não era uma função assíncrona. O módulo inteiro deixava de carregar. | `trocarAba` agora é `async`; o erro `Unexpected reserved word` deixa de ocorrer. |
| Recuperação de senha do vendedor | O link de recuperação usava `perfil.html`, que não possui o formulário de definição de senha. | O e-mail passa a voltar para `vendedor.html`, que reconhece o link de recuperação e mostra um formulário seguro para criar a nova senha. |
| Candidatura de vendedor | Se a Edge Function `api` falhasse, a conta ficava criada em Authentication, mas a candidatura não era criada em `public.vendedores`; por isso não aparecia para aprovação. | A migration 011 expõe uma RPC limitada ao próprio utilizador autenticado. A página usa essa alternativa quando a Edge Function falha. |
| Produtos do vendedor | O cadastro de produtos dependia apenas da Edge Function. | A migration 011 também guarda/edita somente produtos do vendedor aprovado via RPC, deixando-os pendentes para a aprovação administrativa. |
| Catálogo do site e Admin | Os 28 produtos em `produtos.json` são catálogo estático; apenas os produtos de `public.produtos` aparecem no Admin. | O botão **Importar catálogo do site** adiciona ao Supabase somente os produtos locais que ainda não existem, sem sobrescrever produtos existentes. |

## Publicação necessária

Publique os ficheiros estáticos no repositório GitHub Pages e publique a Edge Function atualizada no mesmo projeto Supabase:

```powershell
supabase functions deploy api
```

No Supabase SQL Editor, confirme que as migrations `009_admin_vendedores_vendas.sql` e `010_production_safety.sql` já foram executadas. Elas mantêm o RLS ativo e dão ao administrador acesso às listas de vendedores e produtos pendentes.

Depois da publicação, faça uma atualização forte no navegador (`Ctrl+F5`). O service worker foi versionado para `v47`, portanto os ficheiros antigos serão substituídos assim que a nova versão for obtida.

Em **Authentication → URL Configuration** no Supabase, guarde estas URLs (ajuste apenas se o endereço público do site for diferente):

```text
Site URL: https://aurorartecomercial-dotcom.github.io/VORA313/
Redirect URL: https://aurorartecomercial-dotcom.github.io/VORA313/vendedor.html
```

Depois de publicar os ficheiros, execute `supabase/migrations/011_vendedor_cadastro_resiliente.sql` no SQL Editor. Só então teste uma conta de vendedor: após confirmar o e-mail, entre, complete a candidatura e ela aparecerá como pendente no Admin.

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

## Aprovação de recuperação pelo SQL Editor

O script `supabase/APROVAR_VENDEDOR_VORA313E.sql` aprova somente a candidatura de `vora313e@gmail.com`. Como o SQL Editor não envia o JWT do administrador, o script usa a identidade `service_role` apenas durante a transação; ela desaparece no `COMMIT` e não altera as permissões permanentes do projeto.

## Nota sobre o catálogo-base

`produtos.json` contém 28 produtos, mas não informa stock. Não atribuí quantidades fictícias: para permitir checkout desses produtos pelo backend, importe os produtos reais para `public.produtos` com o stock correto. Os produtos criados por vendedores já seguem o fluxo normal de aprovação e stock no Supabase.

O novo botão de importação traz os 28 produtos para o Admin com `estoque = 0`, justamente para não anunciar disponibilidade sem stock real. Edite cada produto e indique o stock correto antes de vender.
