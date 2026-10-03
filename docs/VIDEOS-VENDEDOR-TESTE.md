# Checklist de teste — Vídeos do Vendedor

## Banco / Supabase
- [ ] Executar primeiro `016_seguranca_p0_uploads_e_limites.sql` e depois `024_videos_vendedores.sql` no SQL Editor do Supabase.
- [ ] Se a 024 já tinha sido executada antes desta versão, executar também `025_reparar_permissao_videos_service_role.sql`.
- [ ] Confirmar que o bucket `vora-public` aceita `video/mp4` e `video/webm` e permite até 100 MB.
- [ ] Publicar a Edge Function `api` usando **Deploy updates**.
- [ ] Executar `supabase/VERIFICAR-VIDEOS-SUPABASE.sql`; os dois campos da primeira consulta devem ser `true` e o bucket deve aparecer na segunda.

> Importante: enviar o ZIP ou fazer `git push` atualiza só o site. As migrations e a Edge Function também precisam ser aplicadas no projeto Supabase para a publicação de vídeos funcionar.

## Vendedor
- [ ] Entrar com uma loja aprovada.
- [ ] Abrir **Meus Vídeos**.
- [ ] Publicar um MP4 curto.
- [ ] Relacionar o vídeo a um produto publicado.
- [ ] Confirmar que o vídeo aparece na lista do painel.
- [ ] Eliminar o vídeo e confirmar que desaparece.
- [ ] Tentar um vídeo >60 segundos: deve ser recusado.
- [ ] Tentar um ficheiro >100 MB: deve ser recusado.
- [ ] Tentar AVI/MKV: deve ser recusado.

## Cliente
- [ ] Abrir `loja.html?id=ID_DO_VENDEDOR`.
- [ ] Confirmar que a aba **🎥 Vídeos** só aparece quando há vídeos.
- [ ] Reproduzir o vídeo.
- [ ] Abrir **Ver produto** e confirmar que vai para o produto correto.
- [ ] Testar no telemóvel.
- [ ] Confirmar que a loja continua a mostrar produtos, avaliações e restantes áreas normalmente.
