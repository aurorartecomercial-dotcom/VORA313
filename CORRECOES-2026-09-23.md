# Correções VORA 313 — 23/09/2026

## Admin de vendedores
- Dashboard com totais por estado.
- Pesquisa e filtro por estado.
- Detalhes completos do vendedor.
- Aprovar, recusar, suspender e reativar através da Edge Function segura `gerirVendedor`.
- Alteração de plano através de `definirPlanoVendedor`.
- Mensagens de erro mais claras e botão de atualização.

## Cadastro de vendedor
- Normalização do e-mail (trim + minúsculas).
- Validação de formato de e-mail no frontend.
- Validação mínima da palavra-passe.
- Mensagens de erro do Supabase Auth mais claras, incluindo o caso de e-mail rejeitado pelo provedor/configuração do Supabase.

## Verificações
- Sintaxe de todos os ficheiros JavaScript validada com `node --check`.
- Referências de IDs do novo `admin-vendedores.js` conferidas com o HTML.

## Nota sobre `paulo@gmail.com`
O código agora valida corretamente o formato do endereço antes de chamar o Supabase Auth. Se o Supabase continuar a devolver `invalid email` para um endereço como `paulo@gmail.com`, a causa restante está na configuração do provedor/instância de autenticação do Supabase e não numa regex do formulário; a nova mensagem informa isso ao utilizador.
