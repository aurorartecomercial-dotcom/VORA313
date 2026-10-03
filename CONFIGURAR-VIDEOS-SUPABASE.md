# Publicar vídeos de vendedores — passos obrigatórios

O código do site já permite MP4/WEBM até 100 MB e 60 segundos. Para o botão **Publicar vídeo** gravar de verdade, conclua estes passos uma única vez no mesmo projeto Supabase usado pelo site.

## 1. Aplicar as migrations

No Supabase, abra **SQL Editor**. Execute, nesta ordem, o conteúdo destes dois ficheiros:

1. `supabase/migrations/016_seguranca_p0_uploads_e_limites.sql`
2. `supabase/migrations/024_videos_vendedores.sql`

Se já executou a migration 024 antes de receber esta versão, execute também
`supabase/migrations/025_reparar_permissao_videos_service_role.sql`. Ela libera
somente a Edge Function do servidor para gravar na tabela de vídeos.

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

Faça uma atualização forçada da página (`Ctrl + F5`), entre numa loja aprovada e publique um MP4 curto. Se a configuração ainda faltar, o site agora mostrará uma mensagem específica em vez de um erro 500 genérico.

> Fazer apenas `git push` publica os ficheiros do GitHub Pages. O banco e a Edge Function são serviços separados e devem receber os passos 1 e 2 acima.
