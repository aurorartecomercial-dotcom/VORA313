import { auth, db } from './config.js';
import { collection, getDocs, query, where, doc, getDoc } from './supabase-compat.js';
import { onAuthStateChanged } from './supabase-compat.js';
import { mostrarToast, escapeHTML, urlSegura, IMAGEM_FALLBACK } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        // Preencher dados do utilizador
        document.getElementById('perfilNome').textContent = `Bem-vindo, ${user.displayName || 'Cliente'}!`;
        document.getElementById('perfilEmail').textContent = user.email || '';

        await carregarPedidos(user.uid);
        await carregarFavoritos();
        await carregarPontos(user.uid);
        await carregarCupons(user.uid);
    });
});

async function carregarPedidos(uid) {
    const container = document.getElementById('historicoPedidos');
    try {
        const q = query(collection(db, 'vendas'), where('uidCliente', '==', uid));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Nenhum pedido encontrado.</p>';
            return;
        }
        container.innerHTML = '';
        // Ordenar por data decrescente (se tiver campo criadoEm)
        const paraMillis = (valor) => {
            if (valor?.toMillis) return valor.toMillis();
            const data = valor ? new Date(valor) : null;
            return data && !Number.isNaN(data.getTime()) ? data.getTime() : 0;
        };
        const pedidos = snapshot.docs.map(doc => doc.data()).sort((a, b) => {
            return paraMillis(b.criadoEm) - paraMillis(a.criadoEm);
        });
        pedidos.forEach(venda => {
            const statusInfo = {
                aguardando_pagamento: ['status-pendente', '⏳ Aguardando pagamento'],
                pago: ['status-confirmado', '🟢 Pagamento confirmado'],
                em_preparacao: ['status-confirmado', '📦 Em preparação'],
                enviado: ['status-enviado', '🔵 Enviado'],
                entregue: ['status-entregue', '🟢 Entregue'],
                cancelado: ['status-cancelado', '❌ Cancelado']
            }[venda.status] || ['status-confirmado', '🟡 Estado atualizado'];

            const pedido = document.createElement('div');
            pedido.className = 'pedido-item';
            const codigo = document.createElement('strong');
            codigo.textContent = venda.codigoRastreio || 'Sem código';
            const detalhe = document.createElement('small');
            detalhe.textContent = `${venda.dataHora || 'Data não disponível'} | ${venda.produtosResumo || ''}`;
            const total = document.createElement('small');
            total.style.cssText = 'color:#25D366; font-weight:700;';
            total.textContent = `${Number(venda.valorTotal || 0).toLocaleString('pt-AO')} Kz`;
            const status = document.createElement('span');
            status.className = `status ${statusInfo[0]}`;
            status.textContent = statusInfo[1];
            pedido.append(codigo, detalhe, total, status);
            container.appendChild(pedido);
        });
    } catch (e) {
        console.error('Erro ao carregar pedidos:', e);
        container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Erro ao carregar pedidos.</p>';
    }
}

async function carregarFavoritos() {
    const container = document.getElementById('listaDesejos');
    const favoritos = JSON.parse(localStorage.getItem('aurora_favoritos') || '[]');
    if (favoritos.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Nenhum favorito guardado.</p>';
        return;
    }

    container.innerHTML = '';
    for (const id of favoritos) {
        try {
            const docRef = doc(db, 'produtos', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const prod = docSnap.data();
                const item = document.createElement('div');
                item.className = 'favorito-item';
                const img = document.createElement('img');
                img.src = urlSegura(prod.imagens?.[0], IMAGEM_FALLBACK);
                img.alt = String(prod.nome || 'Produto');
                img.addEventListener('error', () => { img.src = IMAGEM_FALLBACK; }, { once: true });
                const link = document.createElement('a');
                link.href = `detalhe.html?id=${encodeURIComponent(prod.id || id)}`;
                link.textContent = String(prod.nome || 'Produto');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = '🗑️';
                button.addEventListener('click', () => window.removerFavorito(prod.id || id));
                item.append(img, link, button);
                container.appendChild(item);
            }
        } catch (e) {
            console.warn(`Erro ao carregar produto ${id}:`, e);
        }
    }
}

window.removerFavorito = function(id) {
    let favoritos = JSON.parse(localStorage.getItem('aurora_favoritos') || '[]');
    favoritos = favoritos.filter(f => f !== id);
    localStorage.setItem('aurora_favoritos', JSON.stringify(favoritos));
    mostrarToast('Produto removido dos favoritos.', 'info');
    carregarFavoritos();
};

async function carregarPontos(uid) {
    try {
        const docRef = doc(db, 'clientes', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const pontos = docSnap.data().pontos || 0;
            document.getElementById('pontosFidelidade').textContent = pontos;
        }
    } catch (e) {
        console.error('Erro ao carregar pontos:', e);
        document.getElementById('pontosFidelidade').textContent = localStorage.getItem('aurora_pontos') || '0';
    }
}

async function carregarCupons(uid) {
    const container = document.getElementById('listaCupons');
    try {
        const q = query(collection(db, 'cupons'), where('uidCliente', '==', uid), where('ativo', '==', true));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Nenhum cupom disponível.</p>';
            return;
        }
        container.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const cupom = doc.data();
            const item = document.createElement('div');
            item.className = 'pedido-item';
            const codigo = document.createElement('strong');
            codigo.style.color = 'var(--cor-ouro-escuro)';
            codigo.textContent = `🎟️ ${cupom.codigo || ''}`;
            const desconto = document.createElement('small');
            desconto.textContent = `${Number(cupom.percentual || 0)}% de desconto`;
            const validade = document.createElement('small');
            validade.style.cssText = 'color:var(--cor-esmeralda); font-weight:700;';
            validade.textContent = `Até ${cupom.validade || 'nunca'}`;
            item.append(codigo, desconto, validade);
            container.appendChild(item);
        });
    } catch (e) {
        console.error('Erro ao carregar cupons:', e);
        container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Erro ao carregar cupons.</p>';
    }
}