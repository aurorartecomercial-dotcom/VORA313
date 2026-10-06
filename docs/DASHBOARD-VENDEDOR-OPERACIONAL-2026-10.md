# Dashboard operacional do vendedor — 2026-10

## Fonte dos dados

O dashboard usa dados reais do Supabase e não cria números de demonstração.

- **Vendas:** pedidos do vendedor com pagamento confirmado (`pago`, `em_preparacao`, `enviado`, `entregue`).
- **Receita:** soma de `vendas_vendedor.valor_vendedor` das vendas não canceladas. É o valor líquido atribuído ao vendedor depois da comissão da VORA, não o faturamento bruto do pedido.
- **Pedidos pendentes:** pedidos atribuídos ao vendedor que estão em `pago`, `em_preparacao` ou `enviado`.
- **Produtos ativos:** produtos próprios aprovados e `ativo = true`.
- **Produtos ocultos:** produtos próprios aprovados e `ativo = false`.
- **Sem estoque:** produtos próprios aprovados, ativos e com `estoque <= 0`.
- **Avaliações:** avaliações verificadas da própria loja em `avaliacoes_vendedores`.
- **Visualizações:** somente registros reais de `produto_visualizacoes_unicas`.
- **Mais vendidos:** agregação real de `venda_itens` em pedidos pagos/operacionais.
- **Mais visualizados:** agregação real do tracking existente.

## Segurança

A migration `034_dashboard_operacional_vendedor.sql` cria `dashboard_operacional_vendedor()` como `security definer` e usa exclusivamente `auth.uid()`.

O navegador não envia um `vendedor_id` para escolher os dados. A Edge Function `obterDashboardVendedor` usa o JWT da sessão, chama a função com a sessão do próprio utilizador e valida que o ID devolvido corresponde ao utilizador autenticado.

A tabela de tracking continua sem `SELECT` para `anon`/`authenticated`; somente a função segura consulta esses dados.

## Consultas e desempenho

A carga inicial da Central busca apenas produtos, pedidos e o resumo operacional. Movimentos financeiros, levantamentos, promoções e vídeos são carregados somente quando o vendedor abre cada área. Isso evita baixar todos os dados de uma vez.

## Estados da interface

- **Loading:** mostra cartões em carregamento.
- **Dados disponíveis:** mostra métricas e rankings reais.
- **Vazio:** informa quando ainda não existem vendas, avaliações ou visualizações.
- **Erro:** informa falha do resumo sem bloquear as outras áreas da Central.

## Atalhos

- Adicionar produto
- Gerir produtos
- Ver pedidos
- Ver loja
- Editar perfil
- Ver avaliações

## Limites conhecidos

A plataforma não possui, neste fluxo, uma métrica real de conversão, lucro comercial do vendedor, margem por produto ou visitantes por vendedor. Essas métricas não são simuladas no dashboard.

A área de visualizações só apresenta produtos quando o tracking real tiver registros. Não é usada uma estimativa baseada em cliques locais ou `localStorage`.
