# Configuração externa de segurança — VORA 313

Estas defesas dependem do painel Supabase, do domínio ou de um proxy/CDN. Não
as coloque no JavaScript público e nunca envie chaves secretas por chat.

## Supabase Auth — P1

No painel de Authentication:

1. Ative a confirmação de e-mail antes do primeiro login.
2. Defina palavra-passe mínima de 12 caracteres e ative a verificação de
   palavras-passe comprometidas, se disponível.
3. Configure SMTP próprio antes de produção; o limite padrão de e-mails é
   insuficiente para uma loja real.
4. Ative CAPTCHA/Turnstile no registo e recuperação de palavra-passe.
5. Exija MFA para todas as contas administrativas.
6. Em URLs de redirecionamento, permita somente os domínios oficiais da VORA
   313 e o ambiente local necessário ao desenvolvimento.

## Domínio e cabeçalhos — P1/P2

GitHub Pages não permite configurar todos os cabeçalhos necessários. Antes de
uma operação comercial maior, coloque o domínio próprio atrás de um CDN/proxy
que envie pelo menos:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), camera=(), microphone=()
Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; connect-src 'self' https://*.supabase.co; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

Comece com `Content-Security-Policy-Report-Only`, corrija eventuais bloqueios e
só depois troque para `Content-Security-Policy`. O site usa estilos e alguns
scripts inline; aplicar uma CSP rígida sem este teste quebraria páginas atuais.

## Pagamentos — P1 obrigatório antes do gateway

- Receba a confirmação apenas em webhook assinado pelo gateway.
- Valide assinatura, valor, moeda, referência, estado e idempotência no
  servidor.
- Não aceite "pago" vindo do navegador, WhatsApp ou parâmetro de URL.
- Guarde credenciais de gateway somente nos Secrets da Edge Function.
- Teste pagamento duplicado, webhook repetido, pedido expirado, reembolso e
  estoque insuficiente antes de abrir ao público.

## Operação — P2/P3

- Reveja semanalmente `eventos_seguranca`, pagamentos manuais e mudanças de
  papel administrativo.
- Configure backup e teste restauração antes de depender do marketplace.
- Mantenha dependências com versões fixas e atualize-as de forma controlada.
- Faça uma revisão de RLS sempre que criar tabela, view, função ou Edge
  Function nova.
