// ============================================================
// FASE 4 - ESCALA INTERNACIONAL (PAGAMENTOS, LOGÍSTICA, EMAIL, BACKUP)
// ============================================================
import { db, CONFIG } from './config.js';
import { collection, getDocs, doc, updateDoc } from './supabase-compat.js';
import { mostrarToast } from './utils.js';

// --- 1. PAGAMENTO COM CARTÃO ---
// Pagamentos são processados exclusivamente por Cloud Functions.
export async function iniciarPagamentoCartao() {
    throw new Error('Use o fluxo de pagamento do checkout; credenciais de pagamento não ficam no navegador.');
}

// --- 2. TRANSPORTADORAS ---
const TRANSPORTADORAS = {
    'luanda': { nome: 'VORA Express', taxaBase: 1000, taxaPorKg: 500, prazo: '24-48h' },
    'viana': { nome: 'VORA Express', taxaBase: 2500, taxaPorKg: 500, prazo: '48h' },
    'talatona': { nome: 'VORA Premium', taxaBase: 3000, taxaPorKg: 700, prazo: '24h' },
    'kilamba': { nome: 'VORA Premium', taxaBase: 3500, taxaPorKg: 700, prazo: '24-48h' },
    'outro': { nome: 'VORA Nacional', taxaBase: 5000, taxaPorKg: 1000, prazo: '3-5 dias' }
};

export function calcularFrete(bairro, pesoTotal) {
    const t = TRANSPORTADORAS[bairro] || TRANSPORTADORAS['outro'];
    return {
        valor: t.taxaBase + (pesoTotal * t.taxaPorKg),
        transportadora: t.nome,
        prazo: t.prazo
    };
}

export function calcularPesoTotal(itens) {
    return itens.reduce((acc, item) => acc + (item.quantidade * 0.5), 0);
}

// --- 3. EMAIL (EmailJS) ---
export async function enviarEmailConfirmacao(dados) {
    try {
        // Simulação (implementar com EmailJS ou Edge Function)
        console.log('📧 Email enviado para:', dados.email, '| Pedido:', dados.codigo);
        return true;
    } catch (e) {
        console.error('Erro ao enviar email:', e);
        return false;
    }
}

// --- 4. BACKUP ---
export async function exportarBackupCompleto() {
    try {
        const [produtos, vendas, clientes, cupons] = await Promise.all([
            getDocs(collection(db, 'produtos')),
            getDocs(collection(db, 'vendas')),
            getDocs(collection(db, 'clientes')),
            getDocs(collection(db, 'cupons'))
        ]);

        const data = {
            exportadoEm: new Date().toISOString(),
            produtos: produtos.docs.map(d => d.data()),
            vendas: vendas.docs.map(d => d.data()),
            clientes: clientes.docs.map(d => d.data()),
            cupons: cupons.docs.map(d => d.data())
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VORA313_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        mostrarToast('Backup exportado com sucesso!', 'sucesso');
    } catch (e) {
        console.error('Erro no backup:', e);
        mostrarToast('Erro ao exportar backup.', 'info');
    }
}

// --- 5. RELATÓRIOS AVANÇADOS ---
export function gerarRelatorioVendasPeriodo(inicio, fim) {
    // Esta função seria chamada no admin-vendas.js
    console.log('Gerar relatório de vendas de', inicio, 'até', fim);
}