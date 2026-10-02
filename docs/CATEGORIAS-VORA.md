# VORA 313 — categorias organizadas

A taxonomia foi reorganizada para usar a lógica:

**Categoria principal → Subcategoria → Produto**

## Compatibilidade

- Os valores antigos da categoria principal não foram renomeados nem convertidos.
- Produtos antigos continuam a usar a categoria que já tinham.
- As categorias antigas continuam disponíveis no seletor de produtos, agrupadas por área.
- A subcategoria é opcional e só acrescenta organização.
- A nova subcategoria de vendedores/produtos é persistida pela migration `023_taxonomia_categorias_vora.sql`.

## Exemplo

`Eletrónicos & Tecnologia → Telefones celulares e acessórios → Smartphone`

O campo antigo continua sendo `categoria = eletronicos`; a subcategoria é guardada separadamente.

## Ativação no Supabase

Depois de publicar os ficheiros, executar a migration:

`supabase/migrations/023_taxonomia_categorias_vora.sql`

Se a migration ainda não tiver sido executada, o frontend continua a permitir guardar a categoria principal e os produtos; apenas a subcategoria não será persistida até a migration ser aplicada.
