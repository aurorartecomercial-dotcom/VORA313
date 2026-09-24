# Revisão técnica e de produto — VORA 313

Revisão estática do pacote enviado em 24/09/2026. Não houve alteração no código nem acesso ao Supabase de produção.

## Veredito

O projeto tem uma base boa: catálogo, carrinho, área administrativa, vendedores, pedidos, rastreio, PWA e uma migração para Supabase já bastante estruturada. A proposta visual também é coerente com um marketplace angolano.

Eu ainda não o colocaria em produção com pagamentos e levantamentos reais. A nota atual é **6,5/10 para produção** e pode chegar a 10/10 com os bloqueadores abaixo resolvidos. O motivo não é estética: é segurança e consistência de dinheiro, estoque e permissões.

## Bloqueadores de produção

| Prioridade | Achado | Evidência | Risco e correção |
|---|---|---|---|
| P0 | Um utilizador autenticado pode criar a própria conta de vendedor já `aprovado`, ativa e com saldo arbitrário. | `supabase/migrations/001_schema.sql:326` permite `INSERT` em `vendedores` verificando somente `id = auth.uid()`. A proteção dos campos financeiros existe apenas para `UPDATE`. | A pessoa pode tornar-se vendedora e abrir um levantamento; o backend confia em `status`, `ativo` e saldo. Remover o `INSERT` direto do browser, criar o vendedor apenas pela Edge Function e adicionar trigger `BEFORE INSERT OR UPDATE` que imponha `pendente`, `ativo=false`, saldos e contadores zerados para quem não é service role/admin. Corrigir os dados existentes antes de publicar. |
| P0 | Confirmação de pagamento, estoque, cupom, comissões e saldo do vendedor não são uma transação única nem usam bloqueio condicional. | `supabase/functions/api/index.ts:60–81`, especialmente a leitura e depois atualização de estoque na linha 72. | Duas confirmações concorrentes podem vender mais do que o estoque, contabilizar pontos/saldo mais de uma vez ou deixar pedido criado sem itens quando uma etapa falha. Mover a operação para uma única função PostgreSQL/RPC com transação, `SELECT ... FOR UPDATE`, atualização condicional de estoque e chave de idempotência do pagamento. |
| P1 | Preço é texto e o parser interpreta `1.500 Kz` como `1,5`, não `1500`. | `supabase/migrations/001_schema.sql:59`; `supabase/functions/api/index.ts:27`; `js/utils.js:64`. | Um formato de preço digitado de forma comum pode gerar fatura com valor errado. Guardar valor em `numeric(14,2)` ou inteiro em cêntimos, validar no servidor e formatar somente na interface. Migrar os preços atuais uma vez. |
| P1 | Avaliações de cliente não funcionam como a tela promete; e o endpoint de backend aceitaria avaliação sem compra entregue. | `js/avaliacoes.js:23–31` grava direto no banco, mas a migration só libera leitura pública em `001_schema.sql:365`. `index.ts:101` não verifica compra entregue. | A gravação direta deve falhar por RLS. Trocar o frontend para chamar a Edge Function; nela verificar item de venda entregue pertencente ao utilizador, uma avaliação por pedido/produto e, idealmente, texto moderado. |
| P1 | O checkout consulta produtos com service role sem confirmar que estão públicos/aprovados/ativos. | `supabase/functions/api/index.ts:52–55`. | Um ID conhecido de produto inativo, recusado ou de vendedor suspenso pode entrar num pedido. Validar `ativo=true`, `vendedor_ativo=true` e `status_aprovacao='aprovado'` dentro da transação do pedido. |

## O que eu faria em seguida

1. **Semana 1 — blindar dinheiro e acesso.** Corrigir a política de vendedores, retirar todas as escritas financeiras do cliente, criar RPCs transacionais e idempotentes; testar corrida de dois pagamentos e estoque zero.
2. **Semana 2 — fechar o pedido de verdade.** Integrar Multicaixa Express/cartão com webhook assinado. O WhatsApp pode continuar como suporte, mas não como prova técnica de pagamento. Só o webhook deve mudar o pedido para `pago`.
3. **Semana 3 — confiança de marketplace.** Avaliação após entrega, regras claras de cancelamento/reembolso, prazo de expedição por vendedor, página pública de loja mais completa e histórico de rastreio com eventos e datas.
4. **Semana 4 — qualidade e escala.** Testes automáticos para preço, permissões, pedido e pagamento; CI no GitHub; alertas de falha, auditoria de ações do admin, backup/restauração e revisão de dependências fixadas.

## Melhorias importantes para 10/10

- **Fidelidade:** `js/fidelidade.js` ainda tenta somar e resgatar pontos pelo browser (`202–265`), mas a migration bloqueia isso corretamente. Hoje a interface pode mostrar pontos que não persistem. Manter pontos somente no backend, com uma tabela de movimentos e resgate ligado a um cupom/pedido real.
- **Performance móvel:** há 21 imagens somando aproximadamente 25,5 MB; os oito banners pesam cerca de 3 MB cada e todos entram no `APP_SHELL` do service worker. Para muitos utilizadores móveis, isso é caro. Converter banners para WebP/AVIF, gerar tamanhos responsivos e não pré-cachear o carrossel inteiro.
- **Catálogo:** cada card pede a avaliação separadamente (`js/catalogo.js:175`), causando N+1 consultas. Buscar o resumo por lote ou materializar `rating_media` e `rating_total` no produto. O filtro por nota atualmente apenas escreve aviso no console e não filtra.
- **Manutenção:** `style.css` tem 3.004 linhas e `admin-vendas.js` 1.524 linhas; dividir por componente/tela e adotar tokens de design reduz regressões. Há também dois service workers (`sw.js` e `js/sw.js`); apenas o da raiz é registrado, portanto o outro deve ser removido ou consolidado.
- **SEO e consistência:** usar `lang="pt-AO"` em todo o conteúdo destinado a Angola, títulos e descriptions específicos por categoria/produto, canonical/OG por página e links externos com `rel="noopener noreferrer"`. A home está melhor preparada; várias páginas públicas não têm esses metadados.
- **Privacidade:** NIF, telefone e morada merecem acesso mínimo, retenção definida, logs de acesso e telas administrativas que não exponham dados mais do que o necessário.

## Pontos positivos

- O backend recalcula preço, frete e cupom; não confia no total vindo do carrinho.
- Há RLS, separação de papéis e validações de entrada, uma ótima direção arquitetural.
- A tela usa `textContent` e escape em muitos pontos, reduzindo exposição a XSS.
- A estrutura de migrações e a documentação de implantação dão uma boa base para evolução.
- A validação sintática passou para todos os ficheiros JavaScript e MJS do pacote.

## Limites desta revisão

Foi uma auditoria estática: não executei uma compra real, não acessei credenciais, banco, hospedagem, gateway ou métricas de produção. Não foi encontrado conjunto de testes, lint nem pipeline de CI no pacote; isso impede confirmar os fluxos em execução. O arquivo ZIP também contém uma pasta `.git` completa: para compartilhar ou distribuir o projeto, envie o código sem esse histórico e sem artefatos temporários.
