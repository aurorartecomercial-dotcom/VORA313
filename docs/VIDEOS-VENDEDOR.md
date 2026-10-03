# VORA 313 — Vídeos do Vendedor

A funcionalidade de vídeos adiciona uma área curta e comercial à loja pública, sem substituir o catálogo existente.

## Fluxo

1. O vendedor aprovado abre **Central do Vendedor → 🎥 Meus Vídeos**.
2. Escolhe um vídeo **MP4 ou WEBM**, com até **60 segundos** e **100 MB**.
3. Pode relacionar o vídeo a um produto já aprovado e publicado da própria loja.
4. O browser recebe uma autorização temporária da Edge Function e envia o vídeo diretamente para o Supabase Storage.
5. A Edge Function grava o vídeo na tabela `videos_vendedores`.
6. A loja pública mostra a aba **🎥 Vídeos** somente quando existem vídeos publicados.
7. O cliente pode abrir diretamente o produto relacionado.

## Segurança

- Upload de vídeo não é aberto diretamente ao browser.
- A Edge Function valida vendedor aprovado, MIME, tamanho e caminho do ficheiro.
- Apenas MP4 e WEBM são aceites.
- O vídeo é limitado a 60 segundos no frontend e o valor é validado no backend.
- Um vídeo só pode ser relacionado a um produto aprovado, ativo e pertencente ao mesmo vendedor.
- A leitura pública usa RLS e só mostra vídeos publicados de lojas aprovadas e ativas.
- A exclusão é feita pela Edge Function e remove o ficheiro do Storage antes de apagar o registo.

## Migration obrigatória

Executar:

`supabase/migrations/024_videos_vendedores.sql`

Depois publicar a Edge Function `api` atualizada.

Sem esta migration, o restante site continua funcional, mas a área de vídeos não terá a tabela necessária.

## Compatibilidade

Nenhum campo existente de produtos, vendedores, pedidos ou pagamentos foi removido. A funcionalidade é adicional e usa uma tabela própria.
