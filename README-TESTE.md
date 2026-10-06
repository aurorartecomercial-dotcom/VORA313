# VORA 313 — Pacote completo para teste local

Esta é a versão consolidada do projeto atual, preparada para **configuração e teste local**.

> **Importante:** este pacote não contém banco de dados real, usuários, pedidos, pagamentos, senhas, tokens privados ou a `service_role` key. A chave `anon/publishable` presente em `js/supabase-config.js` é pública por natureza e continua protegida por RLS/backend.

## 1. Requisitos

### Frontend

- Navegador moderno: Chrome, Edge ou Firefox.
- Um servidor HTTP local. Não é recomendado abrir as páginas diretamente com `file://`, porque o projeto usa módulos ES (`import`) e chamadas ao Supabase.
- Node.js 20+ é recomendado para executar os testes e as ferramentas locais.

### Supabase

Para reproduzir o backend:

- conta/projeto Supabase;
- Authentication habilitado;
- projeto configurado com as migrations deste pacote;
- Edge Function `api` publicada;
- Storage configurado conforme as migrations/documentação do projeto.

O ambiente de auditoria não conseguiu conectar ao projeto Supabase remoto, portanto este pacote deve ser validado contra o teu projeto Supabase antes de ser considerado um deploy de produção.

## 2. Configurar o Supabase

1. Crie ou abra o projeto Supabase que será usado no teste.
2. Em Authentication, habilite o método de login utilizado pelo projeto (Email/Password).
3. Configure as URLs de Site/Redirect de acordo com o endereço local e de produção.
4. Confirme as configurações de Storage indicadas na documentação existente em `supabase/` e `docs/`.
5. Configure a URL e a chave pública do projeto em `js/supabase-config.js`.

### Chaves

A chave `anon/publishable` pode estar no frontend quando o RLS está corretamente configurado.

**Nunca coloque no frontend:**

- `SUPABASE_SERVICE_ROLE_KEY`;
- credenciais administrativas;
- credenciais de pagamento;
- tokens privados;
- service accounts.

## 3. Aplicar as migrations

Todas as migrations atuais estão em:

```text
supabase/migrations/
```

Elas devem ser aplicadas preservando a ordem histórica dos arquivos, começando em `001_schema.sql` e terminando em `036_hardening_auditoria_performance.sql`.

Há duas migrations históricas com o prefixo `011`:

```text
011_financeiro_marketplace.sql
011_vendedor_cadastro_resiliente.sql
```

**Não renomeie nem apague esses arquivos.** Eles fazem parte do histórico existente. Se usar uma ferramenta que exija versões numéricas únicas, siga o procedimento de reconciliação dessa ferramenta antes de aplicar o histórico; não altere os nomes apenas para este pacote.

Para um banco novo, a aplicação deve partir da migration `001` e seguir todas as migrations existentes.

Para um banco que já possui parte do histórico, não execute migrations antigas às cegas. Compare primeiro a tabela de histórico de migrations do Supabase e aplique somente o que ainda não foi aplicado.

## 4. Variáveis de ambiente

Existe um arquivo:

```text
.env.example
```

Ele contém somente nomes de variáveis, sem valores secretos.

Copie-o para um `.env` local apenas quando necessário:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_APPLICATION_CREDENTIALS=
FIREBASE_STORAGE_BUCKET=
MIGRATION_OUTPUT=./migration-output
DRY_RUN=false
```

O `.env` real não deve ser colocado no GitHub nem no ZIP de distribuição.

A `SUPABASE_SERVICE_ROLE_KEY` é necessária somente para ferramentas privilegiadas/migração quando a documentação dessas ferramentas exigir. Ela **não é necessária no frontend**.

## 5. Edge Function

A Edge Function principal está em:

```text
supabase/functions/api/index.ts
```

Configuração:

```text
supabase/functions/api/deno.json
supabase/config.toml
```

A função usa a `service_role` somente no backend. A chave deve ser configurada como secret no projeto Supabase, nunca no código público.

O nome da função usado pelo frontend é:

```text
api
```

Publique a função usando a CLI do Supabase no teu ambiente configurado, por exemplo:

```bash
supabase functions deploy api
```

Antes do deploy, confirme que os secrets necessários estão configurados no projeto Supabase.

## 6. Executar o frontend localmente

Na raiz do projeto, inicie um servidor HTTP simples. Por exemplo, com Python:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/
```

ou a página específica que pretende testar.

Não abra `index.html` diretamente pelo explorador de arquivos (`file://`).

## 7. Páginas principais para testar

### Comprador

```text
index.html
categoria.html
detalhe.html
loja.html
meus-favoritos.html
meus-pedidos.html
perfil.html
rastreio.html
```

### Vendedor

```text
vendedor.html
```

### Administração

```text
admin.html
admin-vendas.html
admin-vendedores.html
monetizacao.html
```

### Conteúdo/apoio

```text
blog.html
post.html
sobre.html
politica.html
404.html
```

## 8. Contas/roles necessárias

Para testar todos os fluxos são necessárias contas separadas:

### Visitante

Sem sessão. Deve conseguir consultar apenas conteúdo público.

### Comprador

Uma conta autenticada com perfil de cliente.

Use essa conta para:

- favoritos;
- carrinho;
- checkout;
- pedidos;
- acompanhamento;
- avaliações.

### Vendedor

Uma conta autenticada associada a um vendedor aprovado e ativo.

Use-a para:

- dashboard;
- produtos;
- loja;
- pedidos;
- avaliações.

### Administrador

Uma conta cujo perfil/role administrativo esteja configurado conforme as migrations e documentação do projeto.

Use-a para:

- vendedores;
- produtos;
- pedidos;
- suspensão;
- operações administrativas autorizadas.

**Não coloque senhas dessas contas neste ZIP.**

## 9. Roteiro de teste

### Comprador

1. Cadastro/login.
2. Pesquisa.
3. Filtros.
4. Abrir produto.
5. Abrir loja.
6. Adicionar/remover favorito.
7. Adicionar produto ao carrinho.
8. Checkout.
9. Iniciar pagamento.
10. Consultar pedido.
11. Acompanhar histórico/status.
12. Avaliar produto/vendedor quando o pedido cumprir os requisitos.

### Vendedor

1. Login.
2. Abrir dashboard.
3. Criar produto.
4. Editar produto.
5. Ativar/inativar produto.
6. Abrir loja pública.
7. Consultar pedidos próprios.
8. Atualizar status permitido.
9. Consultar avaliações.

### Admin

1. Login.
2. Consultar vendedores.
3. Consultar produtos.
4. Consultar pedidos.
5. Executar ações administrativas permitidas.
6. Suspender vendedor quando permitido.
7. Excluir somente quando a proteção do banco permitir.
8. Confirmar que o histórico dos pedidos não é apagado/modificado indevidamente.

### Segurança/regressão

Também teste:

- visitante tentando acessar área privada;
- comprador tentando consultar pedido de outro comprador;
- vendedor tentando acessar dados de outro vendedor;
- vendedor tentando executar operação administrativa;
- produto sem vendedor;
- vendedor suspenso;
- produto inativo;
- pedido já existente/idempotência;
- pagamento pendente;
- sessão expirada;
- falha de rede.

## 10. Testes automatizados incluídos

Os testes existentes estão em `tests/`.

Executar todos:

```bash
for f in tests/*.mjs; do node "$f"; done
```

No Windows PowerShell:

```powershell
Get-ChildItem tests\*.mjs | ForEach-Object { node $_.FullName }
```

Os testes atualmente cobrem, entre outros pontos:

- segurança/hardening;
- checkout server-side;
- autorização central;
- dashboard do vendedor;
- painel administrativo;
- auditoria mobile;
- validação de preços.

Também é possível validar a sintaxe dos JavaScript:

```bash
for f in js/*.js; do node --check "$f" || exit 1; done
```

## 11. O que este pacote contém

- todas as páginas HTML atuais;
- todos os JavaScript atuais;
- todos os CSS atuais;
- imagens e assets presentes na versão consolidada;
- `blog.json` e `produtos.json` utilizados pelo projeto;
- configuração pública atual do Supabase;
- `.env.example` sem valores secretos;
- migrations SQL completas;
- configuração do Supabase;
- Edge Function `api`;
- testes;
- documentação existente;
- ferramentas locais de migração existentes.

## 12. O que foi excluído por segurança

Este pacote não contém:

- `.git`;
- `node_modules`;
- `.env` real;
- service accounts;
- Firebase Admin SDK JSON;
- chaves privadas;
- certificados privados;
- tokens privados;
- senhas;
- credenciais administrativas;
- credenciais de pagamento;
- dados reais de usuários;
- dados reais de pedidos/pagamentos;
- caches/logs/arquivos temporários.

## 13. Funcionalidades consolidadas nesta versão

Esta é uma consolidação das alterações já realizadas, sem adicionar uma nova funcionalidade nesta preparação do pacote. A versão inclui, entre outras correções anteriores:

- homepage aprimorada;
- avaliações verificadas;
- loja pública de marketplace;
- pesquisa Supabase com filtros/paginação;
- favoritos reais no Supabase;
- checkout seguro e idempotente;
- histórico de status de pedidos;
- dashboard operacional do vendedor;
- operações administrativas protegidas;
- hardening de segurança;
- auditoria mobile e correções responsivas;
- correções de performance já aplicadas.

## 14. Limitações conhecidas

1. O ambiente que gerou este pacote não conseguiu resolver o DNS do projeto Supabase remoto; por isso o ZIP deve ser testado contra o teu projeto Supabase antes de qualquer deploy.
2. A validação visual por Chromium headless ficou limitada pelo ambiente de execução; não foi usada como falsa confirmação de screenshots.
3. O bucket de vídeos identificado na auditoria anterior continua sendo um ponto de atenção arquitetural e não foi alterado nesta etapa.
4. Existem consultas administrativas amplas identificadas na auditoria de performance; elas não foram reescritas nesta preparação porque isso seria uma alteração funcional/performance separada.
5. O pagamento automático por gateway externo não está configurado neste pacote; o fluxo existente mantém o método configurado pela arquitetura atual.
6. A migration histórica possui dois arquivos com prefixo `011`; preserve ambos e trate a reconciliação conforme a ferramenta de migration utilizada.

## 15. Regra desta versão

Esta entrega é um **pacote completo de teste do projeto atual**.

Não há uma nova funcionalidade adicionada durante a preparação do ZIP. As únicas alterações de preparação são documentação de execução (`README-TESTE.md`) e limpeza do `.env.example` para garantir que ele não contenha valores secretos.
