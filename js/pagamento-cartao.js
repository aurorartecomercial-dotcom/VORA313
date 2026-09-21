// Pagamento com cartão — VORA 313
//
// IMPORTANTE: este módulo nunca contém a chave secreta do Stripe.
// A criação/verificação do pagamento deve ocorrer numa Cloud Function.
import { functions } from './config.js';
import { httpsCallable } from './supabase-compat.js';

export async function iniciarPagamentoCartao(valor, referencia, descricao, emailCliente) {
    if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
        throw new Error('Valor de pagamento inválido.');
    }
    const criarPagamento = httpsCallable(functions, 'criarPagamentoCartao');
    const resposta = await criarPagamento({
        valor: Number(valor),
        referencia: String(referencia || ''),
        descricao: String(descricao || 'Pedido VORA 313'),
        email: String(emailCliente || '')
    });
    return resposta.data;
}

export async function confirmarPagamento(paymentIntentId) {
    if (!paymentIntentId) return false;
    const consultarPagamento = httpsCallable(functions, 'consultarPagamentoCartao');
    const resposta = await consultarPagamento({ paymentIntentId: String(paymentIntentId) });
    return resposta.data?.status === 'succeeded';
}

export async function processarCheckoutCartao(valorTotal, dadosCliente) {
    return iniciarPagamentoCartao(
        valorTotal,
        dadosCliente?.referencia || '',
        dadosCliente?.descricao || 'Pedido VORA 313',
        dadosCliente?.email || ''
    );
}
