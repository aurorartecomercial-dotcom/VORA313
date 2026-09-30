# Segurança P0 — publicação segura

Esta atualização protege uploads e reduz abuso automatizado sem alterar os
dados existentes do marketplace.

## Ordem obrigatória

1. No Supabase SQL Editor, execute `supabase/migrations/016_seguranca_p0_uploads_e_limites.sql`.
2. Publique a Edge Function `api` atualizada.
3. Publique os ficheiros frontend atualizados no GitHub Pages.
4. Teste com um vendedor aprovado: envie uma imagem de produto, guarde o
   produto e confirme que a imagem aparece na revisão administrativa.

Não publique primeiro o frontend: depois da migration, o upload antigo direto
é bloqueado de propósito e só a versão nova obtém uma autorização temporária.

## Variáveis da Edge Function

Defina `CORS_ALLOWED_ORIGINS` com as origens permitidas, separadas por vírgula:

```text
https://aurorartecomercial-dotcom.github.io,http://localhost:5500
```

O domínio oficial já é usado como valor seguro padrão. A variável serve para
adicionar um domínio próprio ou um ambiente local sem reabrir CORS para todos.

## Teste rápido

- Um cliente normal não consegue enviar ficheiro diretamente ao bucket.
- Um vendedor aprovado consegue enviar JPG, PNG, WEBP ou GIF até 5 MB.
- Ficheiros acima de 5 MB e tipos diferentes de imagem são recusados.
- Após várias tentativas rápidas de pedido ou upload, a API responde que é
  necessário aguardar antes de tentar novamente.

Os pagamentos existentes, produtos publicados e sessões atuais não são
apagados nem modificados por esta migration.
