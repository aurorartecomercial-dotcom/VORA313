# Revisão final — VORA 313

## Resultado

Esta versão corrige os erros críticos identificados na revisão estática e inclui uma migration de segurança própria para produção. O ZIP não contém a pasta `.git` do arquivo original nem credenciais administrativas.

## Erros encontrados e corrigidos

| Severidade | Problema | Correção aplicada |
|---|---|---|
| Crítica | Um cliente podia criar diretamente uma conta de vendedor com status aprovado, saldo e plano alterados. | A policy de `INSERT` direto foi removida; a migration 010 normaliza campos sensíveis no trigger. Apenas a Edge Function/service role cria candidatura de vendedor. |
| Crítica | A confirmação de pagamento atualizava estoque, cupom, comissões e saldos em chamadas separadas. | Criada a RPC `atualizar_estado_pedido`, que bloqueia o pedido e confirma estoque/cupom de forma transacional e idempotente. |
| Alta | Pedido e itens podiam ficar inconsistentes se uma inserção falhasse no meio. | Criada a RPC `criar_pedido_atomico`; venda, itens e rastreio entram no mesmo commit. |
| Alta | `1.500 Kz` podia ser lido como `1,5`. | Adicionado `preco_valor` numérico, parser estrito para Kz e validação no painel e backend. |
| Alta | A tela de avaliações escrevia diretamente numa tabela bloqueada por RLS; o endpoint não exigia compra entregue. | O frontend usa a Edge Function, que exige sessão normal e pedido entregue contendo o produto. |
| Alta | Dois levantamentos simultâneos podiam reservar o mesmo saldo. | Criadas RPCs transacionais para solicitar e processar levantamento. |
| Média | A ficha de fidelidade tentava alterar pontos no navegador. | As escritas locais foram removidas; pontos são concedidos pelo backend ao confirmar pagamento. |
| Média | Cada produto podia gerar consulta própria de avaliações. | O catálogo usa a view de resumo quando disponível; o filtro por avaliação passa a funcionar. |
| Média | Havia dois service workers e o principal pré-baixava cerca de 25 MB de imagens. | Removido o worker duplicado e reduzido o precache; navegação passa a priorizar conteúdo atualizado. |
| Baixa | Links abertos em nova aba não preveniam acesso a `window.opener`. | Adicionado `rel="noopener noreferrer"`. |

## Validações executadas

- `node --test tests/price.test.mjs`: 2 testes aprovados.
- Verificação sintática de todos os ficheiros `.js` e `.mjs`: aprovada.
- Verificação de recursos estáticos referenciados no HTML: aprovada.
- Verificação de links em nova aba sem `noopener`: aprovada.
- Página inicial aberta localmente: HTTP 200, sem erros de console.
- Inspeção visual desktop e telemóvel (375 px): sem overflow horizontal; navegação móvel presente.

## Pendências de publicação

1. Aplique `supabase/migrations/010_production_safety.sql` depois das migrations 001–009.
2. Faça backup e teste em homologação antes de rodar a migration no banco real.
3. Verifique os dados já existentes de vendedores, preços e saldo antes do lançamento.
4. O catálogo do ambiente Supabase usado pelo frontend precisa conter produtos publicados. O arquivo `produtos.json` é fallback apenas para indisponibilidade do backend; não deve substituir a importação real do catálogo.
5. Pagamento ainda é confirmado manualmente por WhatsApp. Para automação, integre um gateway e deixe apenas um webhook assinado chamar a transição para `pago`.

Consulte também `REVISED-README.md` para o roteiro de implantação.
