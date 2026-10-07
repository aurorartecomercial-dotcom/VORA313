# VORA 313 — Deploy com Supabase

## 1. Supabase

- Authentication → Email/Password ativo.
- Em Authentication → URL Configuration, defina **Site URL** como `https://aurorartecomercial-dotcom.github.io/VORA313/` e inclua `https://aurorartecomercial-dotcom.github.io/VORA313/vendedor.html` em **Redirect URLs**. Isto permite que a recuperação de senha do vendedor abra o formulário correto, inclusive no telefone.
- Se o checkout continuar a permitir sessão anónima, ative Anonymous Sign-ins.
- Execute `supabase/migrations/003_firebase_uid_bridge.sql`, `004_migration_support.sql` e `005_supabase_frontend_support.sql` depois das migrations 001 e 002 já aplicadas.
- Execute a migration `008_vora313_schema_repair.sql` depois das migrations anteriores.
- Execute também `supabase/migrations/009_admin_vendedores_vendas.sql`, `010_production_safety.sql`, `011_vendedor_cadastro_resiliente.sql`, `012_perfil_publico_loja.sql` e `013_central_vendedor_segura.sql`, nesta ordem. A 011 mantém o fluxo de candidatura e produtos de vendedor funcional mesmo se a Edge Function estiver indisponível; a 012 adiciona logótipo, capa, horário, rede social e apresentação pública da loja; a 013 cria a Central do Vendedor segura, separa os dados públicos da loja numa view própria e adiciona os RPCs de perfil e recebimento.
- Publique `supabase/functions/api` usando `supabase functions deploy api`.

## 2. Frontend

Configure `js/supabase-config.js` com a URL do projeto e a anon/publishable key.

Nunca coloque `service_role` no browser.

## 3. Admin

O painel usa `public.profiles.role = 'admin'`. A autorização administrativa é validada no backend e também protegida por RLS.

## 4. Vendedor

A autorização de vendedor usa `public.vendedores.status = 'aprovado'` e `ativo = true`. Depois da migration 013, os dados públicos da loja são expostos apenas por `public.lojas_publicas`; não recrie uma policy pública direta sobre `public.vendedores`, pois ela pode revelar e-mail e dados de recebimento.

As contas de Authentication não são, por si só, candidaturas de vendedor. Quando a confirmação de e-mail está ativa, o utilizador deve confirmar o e-mail, entrar e enviar o formulário de candidatura. A candidatura então aparece como `pendente` no painel administrativo.

## 5. Recuperação de palavra-passe e e-mails de autenticação

O botão **Recuperar palavra-passe** chama o serviço de autenticação do Supabase; o site não envia nem guarda palavras-passe por conta própria. Para o fluxo funcionar em produção, conclua esta configuração no painel do Supabase:

1. Em **Authentication → URL Configuration**, defina a **Site URL** como `https://aurorartecomercial-dotcom.github.io/VORA313/` e inclua `https://aurorartecomercial-dotcom.github.io/VORA313/vendedor.html` em **Redirect URLs**. O endereço deve ser exatamente o da implantação, sem uma página inexistente no final.
2. Em **Authentication → Emails → SMTP Settings**, configure um SMTP da empresa (remetente, servidor, porta, utilizador e palavra-passe do provedor). O SMTP padrão do Supabase serve apenas para testes e pode recusar destinatários que não sejam membros do projeto.
3. Depois de confirmar que o SMTP entrega e-mails, reveja **Authentication → Rate Limits** de acordo com o limite contratado no provedor. Sem SMTP próprio, os e-mails de confirmação e recuperação compartilham um limite muito baixo, normalmente 2 mensagens por hora.
4. Se o pedido ainda falhar, abra **Authentication → Logs** logo após uma única tentativa e procure o código do erro. `email_address_not_authorized` indica a restrição do SMTP padrão; `over_email_send_rate_limit` indica limite de envio. Aguarde pelo menos 60 segundos entre tentativas para não acionar o limite de recuperação.

O frontend apresenta agora mensagens específicas para estes casos e sempre pede que o link abra `vendedor.html`, onde está o formulário seguro de nova palavra-passe. Não repita vários pedidos seguidos: isso não recupera a palavra-passe mais depressa e pode atingir o limite do provedor.

## 6. Pagamentos

As quatro funções de pagamento referenciadas no frontend original não estavam presentes nos exports do backend recebido. A nova Edge Function informa `not_configured` para elas até a integração oficial ser implementada.

## 7. Corte do Firebase

Não é necessário apagar o projeto Firebase para colocar o novo frontend no ar. Primeiro confirme todos os fluxos no Supabase. Depois de validar os dados históricos e o funcionamento em produção, o Firebase pode ser encerrado separadamente.
