# VORA 313 / Aurora Comercial — migração definitiva para Supabase

Este pacote é o projeto original preparado para **deixar de usar Firebase em produção** e operar com Supabase.

## Arquitetura final

- Auth: Supabase Auth
- Banco: Supabase PostgreSQL
- Storage: Supabase Storage (`vora-public`)
- Backend privilegiado: Supabase Edge Function `api`
- Autorização: RLS + validações no backend
- Frontend: API de compatibilidade local em `js/supabase-compat.js`, sem SDK Firebase

## Configuração obrigatória

Edite apenas `js/supabase-config.js` e coloque:

- URL do projeto Supabase
- anon/publishable key

Nunca coloque a `service_role` key no frontend.

## Financeiro do marketplace

Depois das migrations já listadas neste documento, execute também
`011_financeiro_marketplace.sql` e publique novamente a Edge Function `api`.
Essa etapa separa saldo pendente, retido, disponível e já pago; impede a
liberação do vendedor antes da entrega e inclui disputas, reembolsos e
levantamentos auditáveis. Consulte `FINANCEIRO-MARKETPLACE.md` para o fluxo
operacional antes de ativar pagamentos reais.

## Revisão obrigatória de anúncios de vendedores

Execute `014_revisao_produtos_vendedores.sql` depois das migrations anteriores
e publique novamente a Edge Function `api`. A fila administrativa passa a
mostrar imagens, descrição, preço, stock e vendedor antes da decisão. Toda
aprovação ou recusa exige checklist, gera uma nota e grava uma fotografia do
anúncio, do administrador e do momento da decisão. Consulte
`REVISAO-PRODUTOS.md` para a política operacional.

## SQL

Como `001_schema.sql` e `002_auth_trigger.sql` já foram executados no projeto, execute na sequência:

1. `003_firebase_uid_bridge.sql` — apenas para facilitar a importação dos dados antigos;
2. `004_migration_support.sql` — apoio à migração dos dados antigos;
3. `005_supabase_frontend_support.sql` — suporte do frontend, Storage e itens do pedido.

A ponte `firebase_uid` é temporária para a importação. O funcionamento normal do novo sistema usa os UUIDs do Supabase.

## Backend

A Edge Function `supabase/functions/api/index.ts` substitui as Cloud Functions usadas pelo frontend.

Depois de configurar o projeto Supabase, publique a função `api` com a Supabase CLI.
Em projetos Supabase recentes, a função usa automaticamente
`SUPABASE_SECRET_KEYS.default` para operações administrativas seguras e só
usa a variável legada como compatibilidade. Não crie nem coloque chaves
`SUPABASE_*` manualmente no frontend ou na área de Secrets.

## Pagamentos

Execute `015_pagamentos_vora_pay.sql` e publique novamente a Edge Function `api`.
Ela cria a fila de comprovativos, a trilha de auditoria e uma confirmação que só
pode ser feita pelo servidor/administrador; o cliente nunca consegue alterar o
estado de uma venda para pago. A transferência com comprovativo por WhatsApp
continua disponível enquanto o gateway automático é contratado. Leia
`PAGAMENTOS-VORA-PAY.md` antes de ativar Multicaixa Express, referência ou
cartão.

## Segurança P0

Execute `016_seguranca_p0_uploads_e_limites.sql` antes de publicar a versão
mais recente da Edge Function e do frontend. Esta etapa substitui uploads
diretos por autorizações temporárias para vendedores aprovados e aplica limites
contra abuso de pedidos e uploads. Siga `SEGURANCA-P0-DEPLOY.md` pela ordem.

## Segurança completa P0–P3

As migrations `016` a `019` formam um único pacote de segurança:

- `016` — escrita no Storage por autorização temporária e limites atómicos;
- `017` — privacidade da vitrine pública e validação do perfil de loja;
- `018` — trilha de auditoria de ações sensíveis;
- `019` — rotina protegida para retenção de registos técnicos.

Consulte `MIGRACOES-SEGURANCA-COMPLETAS.md` para a ordem exata, inclusive em
uma base que já está em produção. Depois, siga
`CONFIGURACAO-SEGURANCA-EXTERNA.md` para SMTP, confirmação de e-mail, MFA,
CAPTCHA, domínio/CDN e gateway. Essas configurações não podem ser ativadas
apenas com código público.

## Vitrine Editorial das lojas

Execute `020_vitrine_editorial_lojas.sql` depois da migration `017` e publique
novamente a Edge Function `api`. A opção adiciona as apresentações Editorial de
Moda, Beleza e Livros sem criar uma segunda loja e sem alterar o carrinho. A
migration preserva a política de perfil público: apenas campos controlados,
uma capa HTTPS e um produto publicado da própria loja podem ser usados. Veja
`VITRINE-EDITORIAL.md` para configurar uma loja.

## Operação de compras: opções, pedidos e avaliações

Execute `021_operacao_compras_variacoes.sql` depois da migration `020` e
publique novamente a Edge Function `api`. Ela acrescenta tamanho, cor e outras
opções aos produtos, grava a opção escolhida no pedido e habilita a página
privada **Meus pedidos**. As avaliações continuam bloqueadas até a entrega ser
confirmada. Não execute a migration se a `015_pagamentos_vora_pay.sql` ainda
não estiver aplicada, pois os pedidos e pagamentos precisam da mesma base.

O checkout por transferência com comprovativo continua operacional. Visa,
Multicaixa, BAI, BFA e BIC só devem ser ativados depois de contrato, credenciais
guardadas como Secrets e webhook assinado pelo parceiro de pagamento.

## Temas de categoria das lojas

Execute `022_temas_categoria_lojas.sql` depois da `020_vitrine_editorial_lojas.sql`
e publique novamente a Edge Function `api`. A Central do Vendedor passa a aceitar
o estilo **Tema da categoria**, que aplica uma paleta interna e segura para
Tecnologia, Automotivo, Games, Moda, Beleza, Casa e Livros. Não existem cores
livres gravadas pelo vendedor e o tema não altera produtos, carrinho ou checkout.

## Dados antigos

Os scripts em `tools/` continuam disponíveis somente como ferramentas de importação única dos dados históricos do Firebase. Eles não fazem parte do runtime da aplicação.

Não é necessário enviar credenciais secretas pelo chat.
