# VORA 313 — Auditoria técnica de segurança e performance

**Data:** 2026-10-05  
**Base:** versão consolidada com migrations 030–036, checkout seguro, favoritos reais, histórico de pedidos, dashboard do vendedor, painel administrativo e correções mobile.

## Resultado executivo

A base apresenta uma arquitetura de segurança significativamente mais forte do que uma aplicação que confia apenas no JavaScript: as tabelas de negócio estão com RLS, operações críticas de pedidos/pagamentos/financeiro passam por funções protegidas, a Edge Function valida autenticação e papel, e o checkout recalcula preço/stock/comissão no servidor.

Foram encontradas duas classes principais de risco:

1. **Exposição de ficheiros de vídeo:** o bucket `vora-public` é público. A tabela `videos_vendedores` esconde vídeos pendentes/ocultos por RLS, mas quem possuir o caminho do objeto Storage pode tentar aceder diretamente ao ficheiro. Isto não foi alterado automaticamente porque a correção correta exige separar vídeos num bucket privado e mudar o fluxo de reprodução para URLs assinadas; fazer apenas uma alteração de policy poderia quebrar as imagens públicas existentes.
2. **Consultas administrativas amplas:** várias áreas administrativas descarregam coleções inteiras (`vendas`, `produtos`, `vendedores`, financeiro). Isto funciona com volume pequeno, mas escala mal em rede, memória e tempo de renderização. A correção correta é paginação/RPC server-side por área, não simplesmente colocar limites arbitrários que poderiam esconder dados.

As correções seguras aplicadas nesta auditoria são aditivas e não destrutivas.

---

## Segurança

### SEC-01 — RLS das tabelas de negócio
**Gravidade:** Informativo / proteção forte  
**Estado:** OK

As 30 tabelas encontradas nas migrations têm RLS habilitado, incluindo `profiles`, `clientes`, `vendedores`, `produtos`, `vendas`, `venda_itens`, `pagamentos`, `pagamentos_eventos`, `comissoes`, `movimentos_vendedores`, `levantamentos`, favoritos, avaliações, histórico e vídeos.

**Impacto:** bom isolamento por banco; a aplicação não depende apenas da interface.

### SEC-02 — Compradores e pedidos
**Gravidade:** Informativo / proteção forte  
**Estado:** OK

`vendas` restringe leitura ao próprio `uid_cliente` ou administrador. `venda_itens` permite leitura ao comprador, vendedor do item ou administrador. O histórico de estados possui RLS próprio.

### SEC-03 — Vendedores e próprios dados
**Gravidade:** Informativo / proteção forte  
**Estado:** OK

A Central do vendedor usa funções autorizadas. Campos críticos de `vendedores` — aprovação, ativo, plano, saldos e contadores — são protegidos por triggers. A alteração de disponibilidade de produto passa por função que confirma proprietário, aprovação e estado da loja.

### SEC-04 — Preços enviados pelo frontend
**Gravidade:** Crítico mitigado  
**Estado:** OK

O checkout não confia no preço do carrinho. `criarPedido` relê os produtos aprovados/ativos no Supabase e calcula preço, stock, comissão, cupom, frete e total no servidor antes de chamar `criar_pedido_atomico`.

**Impacto:** alterar JavaScript ou o payload do checkout não permite simplesmente escolher um preço menor.

### SEC-05 — Pedidos e pagamentos
**Gravidade:** Crítico mitigado  
**Estado:** OK

A criação atómica do pedido, transições de estado, confirmação de pagamento, idempotência e validação pedido/pagamento estão centralizadas no banco/Edge Function. Há bloqueios `FOR UPDATE` e chaves de idempotência.

### SEC-06 — Chaves públicas
**Gravidade:** Informativo  
**Estado:** OK

`js/supabase-config.js` contém a chave pública/anon, que pode estar no navegador quando RLS está corretamente configurado. Não foi encontrada `service_role` hardcoded no frontend.

A service key fica nas variáveis da Edge Function.

### SEC-07 — Uploads
**Gravidade:** Médio / parcialmente mitigado

Imagens e vídeos usam URLs de upload assinadas emitidas pela Edge Function, com validação de tipo, tamanho, proprietário e limites. O banco também limita tamanho/duração dos vídeos.

**Problema restante:** o bucket é público porque também serve imagens públicas. Assim, o estado da tabela não impede acesso direto ao objeto de vídeo se o caminho for conhecido.

**Solução recomendada:** criar bucket privado exclusivo para vídeos, guardar somente o caminho, e gerar URL assinada para vídeos publicados. Fazer a migração de forma paralela para não quebrar vídeos existentes.

### SEC-08 — XSS / HTML dinâmico
**Gravidade:** Baixa / mitigada

A maior parte dos dados externos usados em templates passa por `escapeHTML`; URLs passam por `urlSegura`/validações HTTPS. O conteúdo editorial do blog passa por uma allowlist de tags e remove atributos.

Não foi identificado um caminho evidente de XSS armazenado nos fluxos principais auditados.

**Atenção:** continuar evitando `innerHTML` para conteúdo novo; preferir `textContent`.

### SEC-09 — Operações administrativas
**Gravidade:** Médio

As operações administrativas da Edge Function verificam `requireAdmin`, e as operações de produto possuem proteção de banco. Entretanto, `admin.js` ainda mantém uma camada legada que escreve produtos diretamente via `supabase-compat`.

**Impacto:** RLS impede um não-admin, mas esse caminho pode não passar pela mesma auditoria/validação de negócio da Edge Function.

**Solução recomendada:** migrar gradualmente criação/edição/eliminação de produtos administrativos para endpoints/RPC administrativos únicos. Não foi feito nesta auditoria para evitar alterar o fluxo administrativo funcional sem uma etapa específica de migração/testes.

### SEC-10 — Auditoria de segurança
**Gravidade:** Médio  
**Estado:** CORRIGIDO

A Edge Function já tentava registar eventos da categoria `avaliacao`, mas a constraint de `eventos_seguranca` não aceitava essa categoria. Os eventos eram rejeitados e apenas apareciam como aviso de auditoria indisponível.

**Correção:** migration `036_hardening_auditoria_performance.sql` adiciona `avaliacao` à categoria permitida e um índice por alvo/data, mantendo a escrita exclusiva do `service_role`.

### SEC-11 — URLs externas de imagens
**Gravidade:** Baixa/Média

O backend aceita URLs HTTPS de imagens fornecidas pelo vendedor. HTTPS evita esquemas executáveis, mas não restringe o host.

**Solução recomendada:** preferir Storage VORA ou allowlist de hosts confiáveis para imagens futuras. Não alterado agora porque pode invalidar imagens externas legítimas já existentes.

---

## Performance

### PERF-01 — Painel administrativo descarrega coleções inteiras
**Gravidade:** Alta
**Arquivos:** `js/admin-vendas.js`, `js/admin-vendedores.js`, `js/admin.js`, `js/monetizacao.js`

Há leituras amplas de `vendas`, `produtos`, `vendedores`, `vendas_vendedor`, `levantamentos`, `comissoes`, `disputas_vendas` e `pagamentos`.

**Impacto:** crescimento linear de payload, memória e tempo de renderização; pode ficar lento ou atingir limites de rede com muitos pedidos.

**Solução recomendada:** RPC/Edge Function administrativa com filtros server-side, paginação, contagens agregadas e seleção apenas das colunas necessárias. Não colocar `limit(50)` artificialmente, porque isso pode esconder dados do administrador.

**Estado:** identificado, não reestruturado nesta etapa.

### PERF-02 — Loja pública carrega todos os produtos da loja
**Gravidade:** Alta em lojas grandes
**Arquivo:** `js/loja-publica.js`

A consulta pública da loja busca todos os produtos publicados do vendedor.

**Impacto:** uma loja com catálogo grande pode transferir e renderizar muito conteúdo de uma vez.

**Solução recomendada:** paginação por catálogo + carregamento incremental, mantendo destaques/categorias separados.

**Estado:** identificado, não reestruturado nesta etapa para não alterar a experiência da loja sem uma tarefa própria de paginação.

### PERF-03 — Compatibilidade legada usa `select('*')`
**Gravidade:** Média
**Arquivo:** `js/supabase-compat.js`

A camada antiga de compatibilidade lê colunas completas para emular a API antiga.

**Impacto:** payload maior e consultas menos eficientes, especialmente em páginas administrativas.

**Solução:** substituir gradualmente cada consumidor legado por consultas Supabase com colunas explícitas/RPC.

### PERF-04 — Vídeos do vendedor
**Gravidade:** Média
**Arquivo:** `js/vendedor.js`
**Estado:** CORRIGIDO

A consulta usava `select('*')` sem limite. Como o próprio banco limita vídeos ativos por vendedor, o risco de crescimento era limitado, mas a consulta ainda trazia colunas desnecessárias.

**Correção:** seleção explícita das colunas usadas e limite de 20.

### PERF-05 — Imagens promocionais pesadas
**Gravidade:** Média
**Arquivos:** `oferta-1-tecnologia.png` … `oferta-8-casa.png`

Os oito PNGs promocionais têm aproximadamente 2,8–3,1 MB cada, totalizando mais de 24 MB de ficheiros.

**Impacto:** se usados diretamente numa página, podem aumentar bastante transferência e armazenamento.

**Solução recomendada:** gerar WebP/AVIF responsivo, mantendo PNG como fallback somente quando necessário.

**Estado:** não alterado porque estes assets também são usados em demonstrações e caminhos legados.

### PERF-06 — Bibliotecas administrativas externas
**Gravidade:** Média
**Arquivo:** `admin-vendas.html`

Chart.js, jsPDF, AutoTable e XLSX são carregados no início da página.

**Impacto:** custo inicial elevado mesmo quando o administrador não usa exportação ou gráficos.

**Solução:** carregar sob demanda quando o recurso for aberto.

### PERF-07 — Cache e duplicação
**Gravidade:** Baixa / mitigada

O catálogo atual já possui cache/in-flight deduplication e debounce. A página pública de catálogo usa RPC paginada em vez de descarregar todo o catálogo.

Não foi encontrada necessidade de adicionar cache global agressivo.

### PERF-08 — Listeners
**Gravidade:** Baixa

Há vários listeners `DOMContentLoaded` porque cada módulo inicializa a sua própria página. Não foi encontrada evidência suficiente de listeners duplicados no mesmo módulo que justifique uma refatoração global.

---

## Correções aplicadas nesta auditoria

1. Criada `supabase/migrations/036_hardening_auditoria_performance.sql`.
2. Categoria `avaliacao` adicionada à auditoria de segurança.
3. Índice de auditoria por `alvo, criado_em` adicionado.
4. Permissão da função de auditoria reafirmada exclusivamente para `service_role`.
5. `js/vendedor.js` deixou de usar `select('*')` para vídeos e passou a limitar a consulta.
6. Criado `tests/security-performance-audit.test.mjs`.
7. Nenhum pedido, pagamento, produto, vendedor ou dado histórico foi apagado ou reescrito.

## O que não foi alterado de propósito

- RLS funcional existente.
- Estados de pedidos.
- Checkout/pagamentos.
- Tabelas financeiras.
- Histórico de pedidos.
- Bucket público existente, porque convertê-lo parcialmente para privado sem migrar o playback pode quebrar vídeos/imagens.
- Paginação administrativa, porque requer desenho de consultas/RPC e não deve ser feita com limites arbitrários.

## Testes executados

- Todos os ficheiros `js/*.js`: sintaxe OK.
- CSS principal e módulos: contagem de chaves balanceada.
- Scan do frontend: nenhuma `service_role`/chave privada encontrada.
- Teste específico de hardening: OK.
- Verificação estrutural de autenticação/autorização da Edge Function: OK.
- Verificação do checkout server-side: OK.

**Limitação:** esta auditoria local não conseguiu validar o Supabase remoto em tempo real porque o ambiente de execução não teve resolução DNS para o projeto Supabase. Portanto, não afirmo que as migrations foram aplicadas no projeto remoto.
