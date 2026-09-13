# VORA 313 V18 — Central de Monetização

Esta versão mantém a estrutura anterior e acrescenta uma central administrativa de monetização.

## Incluído
- Dashboard financeiro para administrador.
- Soma de comissões VORA e receita de fretes registadas na coleção `comissoes`.
- Contagem de vendas pagas, vendedores e produtos patrocinados.
- Gestão manual de destaque de produtos diretamente pelo painel.
- Planos Básico, Profissional (15.000 Kz/mês) e Premium (30.000 Kz/mês) apresentados no painel.
- Estrutura preparada para futura cobrança de planos e patrocínios.
- Validação de administrador pelo Firebase Authentication/Custom Claims.
- Nenhum segredo de pagamento foi colocado no navegador.

## O que ainda não está automatizado
- Cobrança automática de mensalidades.
- Cobrança automática de produtos patrocinados.
- Saques/pagamentos automáticos aos vendedores.
- Reconciliação de reembolsos e chargebacks.
- Gateway de pagamento real.

Essas funções dependem da escolha do provedor, contratos, credenciais e regras comerciais definitivas.
