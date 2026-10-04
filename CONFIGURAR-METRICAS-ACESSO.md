# Métricas de acessos e visualizações — VORA 313

Esta versão mostra, na página de cada produto, `Visto por X pessoas` e cria
uma área de acessos no painel `admin-vendas.html`.

## O que é contado

- Um navegador conta uma vez por produto, mesmo que atualize a página muitas
  vezes.
- O painel mostra visitantes únicos, acessos às páginas e produtos mais vistos
  dos últimos 30 dias.
- Não são enviados por esta funcionalidade: nome, e-mail, telefone, morada ou
  IP. O navegador cria um identificador aleatório e o banco recebe apenas o
  hash irreversível dele.

## Publicar no Supabase

1. No **SQL Editor** do mesmo projeto Supabase, abra e copie o conteúdo de
   `supabase/migrations/027_metricas_de_acesso_e_visualizacoes.sql`.
2. Clique em **Run** e confirme a mensagem `Success`.
3. Abra **Edge Functions → api → Code**, substitua o conteúdo pelo ficheiro
   `supabase/functions/api/index.ts` deste projeto e clique em
   **Deploy updates**.
4. Atualize o site publicado e faça uma visita a `index.html`, a uma loja e a
   um produto. Depois entre em `admin-vendas.html` e veja **Acessos ao site**.

## Se aparecer “métricas ainda não configuradas”

Confirme que a migration **027** foi executada no mesmo projeto que aparece na
URL do ficheiro `js/config.js`. Depois publique novamente a função **api**.
As métricas não impedem venda, carrinho, checkout nem catálogo quando ainda não
estão configuradas.
