# LEIA PRIMEIRO

Este pacote é uma cópia integral do projeto original VORA 313, preparada para uma migração profissional.

## Pode colocar no GitHub?

Sim. O pacote foi preparado sem `.git` e sem `node_modules`, porque estes itens não devem ser enviados como parte do repositório da aplicação.

## O site atual vai quebrar?

Não. O frontend continua apontando para o Firebase original. A camada Supabase está separada até os dados e o backend serem validados.

## O que falta para o corte definitivo?

Não é possível executar honestamente sem acesso administrativo aos dados do Firebase e ao projeto Supabase. Esses acessos devem permanecer contigo e nunca ser colocados no ZIP.

Depois de configurar as credenciais localmente, use `tools/export-firebase.mjs`, `tools/create-supabase-users.mjs` e `tools/prepare-supabase-data.mjs` seguindo `tools/README.md`.
