-- VORA 313 — variações de compra (por exemplo tamanho, cor ou acabamento).
-- O estoque continua a ser controlado por produto nesta fase. Cada opção
-- escolhida fica gravada no item da venda, para que vendedor e cliente vejam
-- exatamente o que foi comprado.
begin;

alter table public.produtos
  add column if not exists variacoes jsonb not null default '[]'::jsonb;

alter table public.venda_itens
  add column if not exists variacao jsonb not null default '{}'::jsonb;

comment on column public.produtos.variacoes is
  'Grupos de opções do produto: [{nome, obrigatoria, opcoes:[{nome}]}].';
comment on column public.venda_itens.variacao is
  'Opções selecionadas pelo cliente no momento da compra: [{nome, valor}].';

commit;
