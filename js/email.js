// ============================================================
// NOTIFICAÇÕES POR EMAIL - AURORA COMERCIAL
// ============================================================
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';

// Configuração do EmailJS (grátis até 200 emails/mês)
const EMAILJS_CONFIG = {
    serviceID: 'service_aurora',
    templateID: 'template_pedido',
    publicKey: 'YOUR_PUBLIC_KEY'
};

// Inicializar EmailJS
emailjs.init(EMAILJS_CONFIG.publicKey);

export async function enviarEmailConfirmacao(dadosPedido) {
    try {
        await emailjs.send(EMAILJS_CONFIG.serviceID, EMAILJS_CONFIG.templateID, {
            nome_cliente: dadosPedido.nomeCliente,
            email_cliente: dadosPedido.emailCliente,
            codigo_pedido: dadosPedido.codigoRastreio,
            total: dadosPedido.valorTotal,
            produtos: dadosPedido.produtosResumo
        });
        console.log('Email de confirmação enviado!');
    } catch (e) {
        console.error('Erro ao enviar email:', e);
    }
}

export async function enviarEmailStatus(codigo, status) {
    try {
        await emailjs.send(EMAILJS_CONFIG.serviceID, EMAILJS_CONFIG.templateID, {
            codigo_pedido: codigo,
            status_pedido: status
        });
        console.log('Email de status enviado!');
    } catch (e) {
        console.error('Erro ao enviar email:', e);
    }
}