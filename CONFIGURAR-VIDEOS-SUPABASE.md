# Publicar vídeos de vendedores — passos obrigatórios

O site permite somente MP4/WEBM de até **100 MB** e **60 segundos**. Cada loja pode manter no máximo **7 vídeos** em revisão ou publicados. Todo vídeo novo entra como **pendente** e só aparece aos clientes depois da aprovação no painel administrativo.

## 1. Aplicar as migrations

No Supabase, abra **SQL Editor**. Execute, nesta ordem, o conteúdo destes ficheiros:

1. `supabase/migrations/016_seguranca_p0_uploads_e_limites.sql`
2. `supabase/migrations/024_videos_vendedores.sql`
3. `supabase/migrations/025_reparar_permissao_videos_service_role.sql`
4. `supabase/migrations/026_moderacao_e_limite_videos_vendedores.sql`

Mesmo que já tenha executado as migrations 016 e 024, execute agora a 025 e a 026 uma única vez. A 025 libera somente a Edge Function do servidor para gravar na tabela; a 026 adiciona a aprovação administrativa, o limite de sete e a proteção de 100 MB no banco.

Não altere os nomes das tabelas nem coloque chaves secretas no frontend.

## 2. Publicar a Edge Function

Abra **Edge Functions > api > Code** e confirme que o ficheiro `supabase/functions/api/index.ts` deste ZIP foi copiado. Depois clique em **Deploy updates**.

## 3. Confirmar a configuração

No SQL Editor, execute `supabase/VERIFICAR-VIDEOS-SUPABASE.sql`.

O resultado correto é:

- `tabela_videos_existe = true`
- `limite_api` preenchido como `consumir_limite_api(text,text,integer,integer)`.
- uma linha para o bucket `vora-public`, com `video/mp4` e `video/webm` em `allowed_mime_types`, e limite igual ou superior a `104857600`.

## 4. Testar no site

Faça uma atualização forçada da página (`Ctrl + F5`), entre numa loja aprovada e envie um MP4 curto. Ele deverá aparecer como **Em revisão**. Depois entre em `admin-vendas.html`, abra a aba **Vendedores** e use a secção **Vídeos aguardando revisão** para assistir, aprovar ou recusar. A página `admin-vendedores.html` também mantém a mesma fila como alternativa.

Se aparecer a mensagem **"permissão negada para tabela videos_vendedores"**, a migration 025 ainda não foi aplicada no projeto correto. Execute-a novamente; ela só autoriza a Edge Function no servidor e não dá permissão de escrita aos clientes.

Se aparecer a mensagem que a moderação não está configurada, aplique a 026 e clique em **Deploy updates** na função `api`. A função publicada precisa ser a cópia atual do ficheiro `supabase/functions/api/index.ts` deste ZIP.

> Fazer apenas `git push` publica os ficheiros do GitHub Pages. O banco e a Edge Function são serviços separados e devem receber os passos 1 e 2 acima.
