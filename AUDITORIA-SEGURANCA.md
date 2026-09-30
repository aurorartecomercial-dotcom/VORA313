# Auditoria de segurança — VORA 313

Data da revisão: 30 de setembro de 2026. Esta é uma revisão estática do
frontend, migrations e Edge Function disponíveis neste repositório. Ela não
substitui um teste de produção depois da publicação.

## O que já estava bem encaminhado

- A `service_role` não aparece nos ficheiros públicos analisados.
- A Edge Function valida o utilizador e confirma os papéis de administrador e
  vendedor para as operações sensíveis.
- A aprovação de produto mantém um registo da decisão e exige revisão.
- O fluxo financeiro não permite que o cliente marque diretamente um pedido
  como pago.

## Prioridade P0 — corrigida nesta versão, mas precisa ser publicada

| Risco | Proteção adicionada |
| --- | --- |
| Qualquer sessão autenticada podia gravar diretamente no bucket público. | A migration `016` remove a escrita direta e o frontend pede um token temporário à API. |
| Envio de imagens podia ser usado para ocupar o storage. | Tipos permitidos, limite de 5 MB (2 MB para logótipo), caminhos aleatórios e bucket limitado. |
| Criação repetida de pedidos, candidaturas ou uploads podia sobrecarregar a API. | Limites atómicos por utilizador e ação na base de dados. |
| A API aceitava corpo grande e origem de qualquer domínio. | Corpo limitado a 64 KB e CORS restrito ao domínio da VORA 313. |
| Links de imagem demasiado grandes ou que não usam HTTPS podiam ser gravados. | A API aceita no máximo oito URLs HTTPS, cada uma com tamanho limitado. |

Consulte `SEGURANCA-P0-DEPLOY.md` e siga a ordem indicada. Enquanto a
migration, a função e o frontend não estiverem publicados, esta proteção não
está ativa no site online.

## Prioridade P1 — incluída no código; configurar antes de ativar pagamentos automáticos

1. **Gateway e webhooks:** contratar/integrar o fornecedor e aceitar o estado
   `pago` somente através de webhook assinado, com validação da assinatura,
   idempotência e registo de auditoria. Nunca confiar no retorno do navegador.
2. **CSP e cabeçalhos:** publicar o site atrás de um serviço que envie Content
   Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e
   `Permissions-Policy`. GitHub Pages limita esta configuração; um proxy/CDN
   como Cloudflare é uma opção adequada.
3. **Dependências:** as dependências críticas agora têm versão fixada. Reveja
   atualizações de forma controlada antes de as alterar novamente.
4. **Contas administrativas:** o frontend exige senha forte (12+ caracteres,
   maiúscula, minúscula e número). Confirmação de e-mail, MFA e o menor número
   possível de administradores ativos ainda devem ser ativados no painel.
5. **Privacidade:** a view pública deixou de expor a morada da loja. O telefone
   permanece somente para o botão explícito de WhatsApp; dados de recebimento
   continuam restritos ao painel financeiro.

## Prioridade P2 — incluída, com operação contínua necessária

- A migration `018` cria `eventos_seguranca` para ações financeiras, alterações
  de vendedor, mudanças de papel e limites atingidos. Reveja estes eventos
  semanalmente e configure alertas fora do banco para atividades anormais.
- Fazer cópia de segurança da base de dados e testar periodicamente a
  restauração.
- Definir política de produtos proibidos, tempo de resposta, suspensão e
  recurso do vendedor.
- Rever RLS e permissões do Supabase a cada nova tabela ou Edge Function.
- Testar em produção: cliente, vendedor aprovado, vendedor suspenso e
  administrador, sempre com contas separadas.

## Prioridade P3 — incluída, mas não automática

- A migration `019` disponibiliza uma função de retenção que remove contadores
  de limite após 8 dias e eventos de segurança após 365 dias, quando chamada
  por um processo de servidor com service role.
- Agende essa chamada mensalmente depois de confirmar que a retenção atende às
  regras fiscais e operacionais da VORA 313. A migration não apaga dados por si
  só.

## Ficheiros de aplicação

Execute `016`, `017`, `018` e `019` pela ordem de
`MIGRACOES-SEGURANCA-COMPLETAS.md`. Publique primeiro a Edge Function `api` e
depois o frontend, conforme `SEGURANCA-P0-DEPLOY.md`.

## Limites desta revisão

Não foram testadas chaves, SMTP, regras configuradas no painel Supabase,
domínios, DNS, equipamentos dos utilizadores ou o fornecedor de pagamento.
Esses itens devem ser verificados no ambiente de produção sem partilhar
segredos no chat.
