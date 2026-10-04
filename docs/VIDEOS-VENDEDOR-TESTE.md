# Checklist de teste — Vídeos do Vendedor

## Banco / Supabase
- [ ] Executar, nesta ordem, `016_seguranca_p0_uploads_e_limites.sql`, `024_videos_vendedores.sql`, `025_reparar_permissao_videos_service_role.sql` e `026_moderacao_e_limite_videos_vendedores.sql` no SQL Editor do Supabase.
- [ ] Confirmar que o bucket `vora-public` aceita `video/mp4` e `video/webm` e permite até 100 MB.
- [ ] Publicar a Edge Function `api` usando **Deploy updates**.
- [ ] Executar `supabase/VERIFICAR-VIDEOS-SUPABASE.sql`; os dois campos da primeira consulta devem ser `true` e o bucket deve aparecer na segunda.

> Importante: enviar o ZIP ou fazer `git push` atualiza só o site. As migrations e a Edge Function também precisam ser aplicadas no projeto Supabase para a publicação de vídeos funcionar.

## Vendedor
- [ ] Entrar com uma loja aprovada.
- [ ] Abrir **Meus Vídeos**.
- [ ] Enviar um MP4 curto para revisão.
- [ ] Relacionar o vídeo a um produto publicado.
- [ ] Confirmar que o vídeo aparece como **Em revisão** na lista do painel.
- [ ] Eliminar o vídeo e confirmar que desaparece.
- [ ] Tentar um vídeo >60 segundos: deve ser recusado.
- [ ] Tentar um ficheiro >100 MB: deve ser recusado.
- [ ] Tentar AVI/MKV: deve ser recusado.
- [ ] Com sete vídeos em revisão/publicados, tentar enviar o oitavo: deve ser recusado.

## Administração
- [ ] Entrar em `admin-vendas.html`, abrir a aba **Vendedores** e localizar a área **Vídeos aguardando revisão**.
- [ ] Confirmar que o vídeo abre no cartão compacto, sem ocupar toda a tela.
- [ ] A página `admin-vendedores.html` deve mostrar a mesma fila como alternativa.
- [ ] Abrir **Vídeos aguardando revisão** e assistir ao vídeo no cartão compacto.
- [ ] Recusar um vídeo sem motivo: deve ser recusado pelo sistema.
- [ ] Aprovar um vídeo e confirmar que ele sai da fila administrativa.

## Cliente
- [ ] Abrir `loja.html?id=ID_DO_VENDEDOR`.
- [ ] Confirmar que o vídeo pendente não aparece; somente o vídeo aprovado é público.
- [ ] Confirmar que a aba **🎥 Vídeos** só aparece quando há vídeos.
- [ ] Reproduzir o vídeo.
- [ ] Abrir **Ver produto** e confirmar que vai para o produto correto.
- [ ] Testar no telemóvel.
- [ ] Confirmar que os vídeos ficam em cartões/grelha e não ocupam toda a altura da tela.
- [ ] Confirmar que a loja continua a mostrar produtos, avaliações e restantes áreas normalmente.
