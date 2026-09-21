// Multicaixa Express — VORA 313
//
// As credenciais e chamadas ao provedor devem ficar no servidor.
// Este módulo é apenas uma interface segura para Cloud Functions.
import { functions } from './config.js';
import { httpsCallable } from './supabase-compat.js';

export async function gerarReferenciaMulticaixa(valor, referencia, descricao) {
    if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
        throw new Error('Valor de pagamento inválido.');
    }
    const iniciar = httpsCallable(functions, 'criarPagamentoMulticaixa');
    const resposta = await iniciar({
        valor: Number(valor),
        referencia: String(referencia || ''),
        descricao: String(descricao || 'Pedido VORA 313')
    });
    return resposta.data;
}

export async function verificarPagamento(referencia) {
    if (!referencia) return false;
    const consultar = httpsCallable(functions, 'consultarPagamentoMulticaixa');
    const resposta = await consultar({ referencia: String(referencia) });
    return resposta.data?.status === 'CONFIRMED';
}
