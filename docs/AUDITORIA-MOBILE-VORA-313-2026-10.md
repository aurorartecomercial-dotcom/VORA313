# Auditoria completa da experiência mobile --- VORA 313

Data: 05/10/2026

## Jornadas auditadas

1.  Homepage
2.  Pesquisa
3.  Filtros
4.  Produto
5.  Loja do vendedor
6.  Carrinho
7.  Checkout
8.  Login
9.  Cadastro
10. Área do comprador
11. Pedidos
12. Favoritos
13. Área do vendedor
14. Área administrativa

## Problemas encontrados antes das correções

-   **Homepage:** várias camadas históricas de CSS mobile se
    sobrepunham; favoritos e alguns controles tinham áreas de toque
    pequenas.
-   **Pesquisa:** alguns estilos mobile usavam fontes pequenas, com
    risco de zoom automático ao abrir o teclado.
-   **Filtros:** `select` chegavam a 10 px em regras antigas e ficavam
    apertados em 360 px.
-   **Produto:** favoritos tinham dimensões pequenas em algumas regras;
    a barra fixa de compra precisava de espaço inferior consistente.
-   **Loja:** a navegação por âncoras precisava de scroll horizontal
    controlado para não provocar overflow da página.
-   **Carrinho:** nomes longos podiam comprimir os controles; cupom
    precisava de melhor composição em telas estreitas.
-   **Checkout:** métodos de pagamento em três colunas eram inadequados
    no mobile; modal precisava de scroll interno com teclado aberto.
-   **Login/Cadastro:** campos de 14 px podiam provocar zoom automático
    e os botões não tinham padrão uniforme de toque.
-   **Área do comprador/Pedidos/Favoritos:** páginas independentes
    herdavam espaçamento global do marketplace e podiam reservar espaço
    que não corresponde à sua navegação.
-   **Vendedor:** o menu mobile usava `position:absolute` sem referência
    local explícita; campos/botões precisavam de padrão móvel
    consistente.
-   **Administração:** tabelas largas precisam de scroll horizontal
    controlado e indicação clara; alguns filtros/botões eram pequenos.
-   **Performance:** `admin-vendas.js` continua fazendo leituras amplas
    de dados. Foi mantido nesta tarefa para não alterar a operação sem
    uma auditoria própria de paginação/backend.

## Correções implementadas

-   Classes explícitas para páginas independentes (`page-standalone`,
    `page-admin`, `page-vendedor` etc.).
-   Remoção da reserva de espaço do header/navegação pública nas páginas
    que não possuem essa estrutura.
-   Inputs, selects e textareas mobile padronizados em 16 px.
-   Áreas de toque principais normalizadas para aproximadamente 44 px.
-   Favoritos mobile com área de toque de 40--44 px.
-   Filtros com altura mínima de 44 px; em 390 px passam para uma
    coluna.
-   Login e pagamento com modal/painel inferior, altura máxima e scroll
    interno.
-   Métodos de pagamento em uma coluna no mobile.
-   Carrinho reorganizado para evitar compressão de controles.
-   Cupom reorganizado para input + ação.
-   Navegação da loja com scroll horizontal limitado ao próprio
    componente.
-   Tabelas administrativas com scroll horizontal controlado e indicação
    "Deslize horizontalmente para ver mais".
-   Abas administrativas com scroll horizontal.
-   Menu lateral do vendedor ancorado ao próprio aplicativo.
-   Mantida a experiência desktop; a nova camada visual fica concentrada
    nas regras mobile.

## Testes

-   As 14 páginas possuem viewport.
-   As 14 páginas responderam HTTP 200 localmente.
-   Sintaxe JS validada para carrinho, vendedor, administração, pedidos,
    favoritos, detalhe, catálogo, loja e aplicação principal.
-   Chaves dos CSS principais conferidas.
-   Regras mobile finais conferidas.
-   Nenhuma função de negócio foi removida.
-   Nenhuma migration, RLS, pagamento ou Edge Function foi alterada.
-   O Chromium headless disponível no ambiente travou antes de gerar
    screenshots; portanto não foram inventados resultados de
    screenshots.

## Resultado

A responsividade foi tratada como UX mobile específica, não como simples
redução do desktop. O desktop permanece com as regras existentes.

## Ponto pendente identificado

A principal oportunidade de performance futura é a área administrativa,
especialmente `admin-vendas.js`, que ainda realiza leituras amplas. Isso
deve ser tratado separadamente com paginação/consultas administrativas
para evitar risco às funções atuais.
