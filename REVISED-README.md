# VORA 313 — versão revisada

Esta cópia foi revista em 24/09/2026. O foco da revisão foi impedir falhas de autorização, duplicidade de pagamento, estoque negativo, valores monetários ambíguos e avaliações sem compra confirmada.

## O que mudou

- `supabase/migrations/010_production_safety.sql` adiciona as proteções de produção.
- Pedido, itens e rastreio são gravados pela função SQL `criar_pedido_atomico`.
- Confirmação de pagamento, estoque, cupom, comissão, saldo de vendedor e pontos passam pela função SQL transacional `atualizar_estado_pedido`.
- Levantamentos passam por funções SQL com bloqueio de linha.
- Vendedor não pode mais criar diretamente uma conta aprovada nem alterar saldo, status ou plano pelo navegador.
- O preço numérico (`preco_valor`) passa a ser a fonte de cálculo; a tela continua exibindo o formato textual durante a migração.
- Avaliação exige uma conta normal e compra entregue do produto.
- Carrinho usa chave de idempotência: repetição da mesma tentativa de checkout não cria outra fatura.
- O service worker não pré-baixa mais os oito banners grandes; foi removido o service worker duplicado.
- Há um teste de regressão para valores Kz em `tests/price.test.mjs`.

## Antes de publicar

1. Crie um backup do projeto Supabase e aplique as migrations **em ordem**, incluindo `010_production_safety.sql`.
2. Confirme que todos os produtos existentes receberam `preco_valor`. A migration converte formatos como `KZ 1.500,00`; corrija manualmente qualquer preço que não tenha sido convertido.
3. Revise vendedores já existentes: apenas contas aprovadas pela equipa devem continuar com `status = 'aprovado'`, `ativo = true` e saldo diferente de zero.
4. Publique/republique a Edge Function `api` depois de aplicar a migration.
5. Faça um teste em ambiente de homologação: criar pedido, repetir o mesmo clique, confirmar o pagamento uma vez, tentar confirmar novamente, testar estoque insuficiente, cupom no limite e levantamento simultâneo.

## Validação local

```powershell
node --test tests/price.test.mjs
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Limites que ainda exigem configuração externa

- O fluxo atual usa confirmação manual por WhatsApp. Para pagamento automatizado, conecte Multicaixa/cartão e faça a mudança para `pago` somente em webhook assinado pelo provedor.
- A aplicação não inclui dados de produção, credenciais ou um ambiente Supabase no ZIP. As migrations precisam ser aplicadas numa base de homologação antes do ambiente real.
