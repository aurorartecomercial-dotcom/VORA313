# VORA 313 — Auditoria de varredura e correções

## Resultado

Foi feita uma varredura do projeto enviado, incluindo frontend, camada de compatibilidade Supabase, Edge Function, migrations/RLS, Service Worker, ferramentas de migração, referências locais e sintaxe JavaScript.

### Testes automáticos executados

- 122 ficheiros no pacote original.
- Todos os `js/*.js`: `node --check` sem erros após as correções.
- Scripts inline dos HTML: sem erros de sintaxe após ignorar corretamente o JSON-LD.
- Referências locais de `href/src`: sem ficheiros locais em falta.
- Referências de tabelas usadas pelo frontend/backend: conferidas contra o schema; aliases `vendasVendedor`/`destaquesSolicitados` são mapeados pela compatibilidade Supabase.
- Não foi encontrada `service_role` ou credencial privada dentro do frontend.

## Problemas críticos encontrados e corrigidos

1. **Painel de vendas não abria**
   - `js/admin-vendas.js` tinha `await` dentro de `function trocarAba(...)` não-`async`.
   - Isso produz `Uncaught SyntaxError: Unexpected reserved word` e impede o carregamento de todo o módulo.
   - Corrigido para `async function trocarAba(...)` e os chamadores passaram a tratar rejeições.

2. **RLS/grants insuficientes para vendedores/produtos**
   - O projeto tinha migrations de RLS, mas não uma reparação final dos privilégios de tabela.
   - Criada `010_security_rls_repair.sql` para grants necessários, policies administrativas e reload do PostgREST.

3. **Exposição pública de dados de vendedores**
   - A policy pública de `vendedores` permitia consultar a linha completa, incluindo dados de recebimento e saldos.
   - A nova migration remove a leitura anónima dessa tabela. A vitrine pública continua a usar `produtos`.

4. **Escalada de privilégio na candidatura de vendedor**
   - O policy antigo `vendedores_insert_self` permitia ao browser inserir uma linha já `aprovado`/`ativo=true`.
   - Removido. A candidatura passa pelo Edge Function com `service_role`.

5. **Fraude potencial nos pontos de fidelidade**
   - O cliente podia tentar inserir/alterar `pontos` e `historico` diretamente.
   - O trigger foi reforçado para `INSERT` e `UPDATE`; no primeiro registo os pontos começam em zero.
   - O frontend deixou de gravar pontos diretamente.

6. **Avaliações sem validação de compra**
   - O frontend criava avaliações diretamente e usava utilizador anónimo.
   - Agora a avaliação chama o backend `adicionarAvaliacao`; o backend exige utilizador não-anónimo e verifica que o produto pertence a uma venda `entregue` do cliente.

7. **Checkout aceitava produto não publicado se alguém manipulasse a chamada**
   - `criarPedido` agora valida `ativo`, `vendedor_ativo`, `status_aprovacao` e, para produtos de vendedor, verifica também o estado atual da loja.

8. **Preços com formato angolano**
   - O parser tratava `12.000 Kz` como `12` em alguns pontos.
   - O parser comum foi corrigido para reconhecer separadores de milhares/decimais e o backend recebeu a mesma correção.

9. **Confirmação de pagamento/stock**
   - O decremento de stock passou a usar também uma condição `estoque >= quantidade`, reduzindo o risco de stock negativo em confirmações concorrentes.
   - Vários writes críticos que tinham erros ignorados passaram a verificar e propagar o erro.

10. **Gestão de vendedores**
    - `admin-vendedores.js` passou a usar o backend `gerirVendedor`, sincronizando também o estado dos produtos do vendedor.
    - O painel passou a mostrar total, aprovados, pendentes, faturamento, pedidos e líquido por vendedor.

## Problemas que continuam dependentes de configuração/decisão de negócio

### Pagamentos reais

`criarPagamentoMulticaixa`, `consultarPagamentoMulticaixa`, `criarPagamentoCartao` e `consultarPagamentoCartao` continuam explicitamente como `not_configured` no backend. Os módulos frontend existem, mas não há integração real com um provedor nem credenciais de servidor no pacote. Não inventei essa integração.

### Resgate de pontos

O botão de resgate existe visualmente, mas não há regra de negócio definida para converter pontos em cupom. Não foi inventada uma taxa de conversão.

### Transação completa do checkout

A confirmação de um pedido envolve várias tabelas (stock, comissão, vendedor, movimentos, fidelidade). O código melhorou a proteção contra concorrência no stock, mas a operação ainda não é uma única transação PostgreSQL/RPC. Para volume real, a próxima evolução deve consolidar essa confirmação numa função SQL transacional e idempotente.

### Migrações históricas Firebase

As ferramentas `tools/` e migrations 003/004 permanecem porque fazem parte do histórico de migração. O runtime do frontend usa Supabase.

## Ordem de aplicação

Se 001–009 já estão aplicadas no Supabase, aplicar apenas:

`supabase/migrations/010_security_rls_repair.sql`

Depois testar:

1. Login admin.
2. `admin.html` → produtos: listar, criar, editar, apagar.
3. `admin-vendas.html`: abrir todas as abas.
4. Vendedores: listar, aprovar, recusar, suspender, reativar.
5. Produto de vendedor: criar → pendente → aprovação → publicação.
6. Checkout → pedido → confirmar como pago → stock/comissão/vendedor.
7. Perfil do cliente → pedidos/pontos.
8. Rastreio público.
9. Avaliação apenas depois de pedido entregue.

Só depois desses testes o pacote deve ser publicado/feito `git push`.
