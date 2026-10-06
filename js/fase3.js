// ============================================================
// FASE 3 - EXPERIÊNCIA PREMIUM (RECOMENDAÇÕES, AFILIADOS, I18N, CHAT)
// ============================================================
import { CONFIG } from './config.js';
import { mostrarToast } from './utils.js';

// --- 1. RECOMENDAÇÕES DE PRODUTOS (CORRIGIDO PARA CARROSSEL HORIZONTAL) ---
export async function initRecomendacoes() {
    const container = document.getElementById('recomendacoesProdutos');
    if (!container) return;

    const historico = JSON.parse(localStorage.getItem('aurora_historico_vistos') || '[]');
    if (historico.length === 0) return;

    try {
        const { carregarCatalogo, criarCardProduto } = await import('./catalogo.js?v=4');
        const catalogo = await carregarCatalogo({ limite: 50, ordenacao: 'mais-recentes' });
        const recomendados = obterRecomendacoes(catalogo, historico);
        if (recomendados.length === 0) return;

        // ✅ ALTERAÇÃO: Container em Flex Horizontal com Scroll
        container.innerHTML = `
            <section class="secao-recomendacoes" style="max-width:1480px; margin:30px auto; padding:0 24px;">
                <h2 style="color:#333; font-size:1.8rem; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:10px;">💡 Recomendado para si</h2>
                <div class="aurora-rail-wrap">
                    <button class="aurora-rail-btn anterior" type="button" data-rail-target="recomendadosRail" aria-label="Recomendações anteriores">‹</button>
                    <div class="grade-produtos" id="recomendadosRail" style="display:flex; overflow-x:auto; gap:16px; padding-bottom:10px; -webkit-overflow-scrolling:touch; scroll-snap-type:x mandatory; grid-template-columns:none;"></div>
                    <button class="aurora-rail-btn proximo" type="button" data-rail-target="recomendadosRail" aria-label="Mais recomendações">›</button>
                </div>
            </section>
        `;

        const grid = container.querySelector('.grade-produtos');
        recomendados.forEach(prod => {
            const card = criarCardProduto(prod);
            // ✅ Estilo para o card não encolher e ficar alinhado
            card.style.minWidth = '200px';
            card.style.maxWidth = '220px';
            card.style.flexShrink = '0';
            card.style.scrollSnapAlign = 'start';
            if (card) grid.appendChild(card);
        });
    } catch (e) {
        console.error('Erro ao carregar recomendações:', e);
    }
}

function obterRecomendacoes(catalogo, historico) {
    const vistos = historico.map(item => item.id);
    const categoriasVistas = historico.map(item => item.categoria);
    const recomendados = catalogo.filter(prod => 
        !vistos.includes(prod.id) && categoriasVistas.includes(prod.categoria)
    );
    if (recomendados.length === 0) {
        return catalogo.filter(prod => !vistos.includes(prod.id)).slice(0, 4);
    }
    return recomendados.slice(0, 8);
}

export function registrarVista(produto) {
    const historico = JSON.parse(localStorage.getItem('aurora_historico_vistos') || '[]');
    const filtrado = historico.filter(item => item.id !== produto.id);
    filtrado.unshift({ id: produto.id, categoria: produto.categoria });
    localStorage.setItem('aurora_historico_vistos', JSON.stringify(filtrado.slice(0, 10)));
}

// --- 2. PROGRAMA DE AFILIADOS ---
let codigoAfiliado = '';

export function initAfiliados() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        localStorage.setItem('aurora_ref_afiliado', ref);
        mostrarToast(`Bem-vindo! Usaste o código ${ref}`, 'info');
    }

    const uid = localStorage.getItem('aurora_uid_cliente');
    if (uid) {
        codigoAfiliado = uid.substring(0, 8).toUpperCase();
    } else {
        codigoAfiliado = 'VORA' + Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    localStorage.setItem('aurora_codigo_afiliado', codigoAfiliado);
}

export function obterLinkAfiliado(linkProduto) {
    const codigo = localStorage.getItem('aurora_codigo_afiliado') || 'VORA0000';
    return linkProduto.includes('?') ? `${linkProduto}&ref=${codigo}` : `${linkProduto}?ref=${codigo}`;
}

export function aplicarDescontoAfiliado() {
    const ref = localStorage.getItem('aurora_ref_afiliado');
    return ref ? { codigo: ref, desconto: 5 } : null;
}

// --- 3. MULTILÍNGUA (PT/EN) ---
let idiomaAtual = localStorage.getItem('aurora_idioma') || 'pt';

const traducoes = {
    pt: {
        'search': 'Buscar produtos...',
        'cart': 'Carrinho',
        'login': 'Entrar',
        'home': 'Início',
        'contact': 'Contactos',
        'blog': 'Blog',
        'track': 'Rastrear Pedido',
        'more_sold': 'Mais Comprados',
        'recommended': 'Recomendado para si',
        'add_to_cart': 'Adicionar',
        'share': 'Partilhar',
    },
    en: {
        'search': 'Search products...',
        'cart': 'Cart',
        'login': 'Login',
        'home': 'Home',
        'contact': 'Contact',
        'blog': 'Blog',
        'track': 'Track Order',
        'more_sold': 'Best Sellers',
        'recommended': 'Recommended for you',
        'add_to_cart': 'Add',
        'share': 'Share',
    }
};

export function initI18n() {
    const btnIdioma = document.getElementById('btnIdioma');
    if (btnIdioma) {
        btnIdioma.addEventListener('click', () => {
            idiomaAtual = idiomaAtual === 'pt' ? 'en' : 'pt';
            localStorage.setItem('aurora_idioma', idiomaAtual);
            aplicarTraducoes();
        });
    }
    aplicarTraducoes();
}

function aplicarTraducoes() {
    const t = traducoes[idiomaAtual];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const chave = el.dataset.i18n;
        if (t[chave]) el.textContent = t[chave];
    });
    const busca = document.getElementById('campoBusca');
    if (busca) busca.placeholder = t.search;
    document.title = idiomaAtual === 'pt' ? 'VORA 313' : 'VORA 313';
}

// --- 4. CHATBOT AVANÇADO (CORRIGIDO) ---
const NUMERO_WHATSAPP = CONFIG.NUMERO_WHATSAPP || '244933677628';

export function initChatbot() {
    const chatBtn = document.getElementById('chatBtn');
    const chatMenu = document.getElementById('chatMenu');
    
    if (chatBtn && chatMenu) {
        // Remover event listeners anteriores (evita duplicação)
        const novoBtn = chatBtn.cloneNode(true);
        chatBtn.parentNode.replaceChild(novoBtn, chatBtn);
        
        novoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatMenu.style.display = chatMenu.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Botões de opções rápidas
    const botoes = document.querySelectorAll('[data-chat-opcao]');
    botoes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const opcao = btn.dataset.chatOpcao;
            const mensagem = obterMensagem(opcao);
            abrirWhatsApp(mensagem);
        });
    });
}

function obterMensagem(opcao) {
    const mensagens = {
        'pedido': 'Olá! Quero fazer um pedido na VORA 313. Pode me ajudar?',
        'rastrear': 'Olá! Preciso de ajuda para rastrear o meu pedido. O código é: ',
        'duvida': 'Olá! Tenho uma dúvida sobre um produto. Pode me ajudar?',
        'pagamento': 'Olá! Como posso pagar o meu pedido?',
        'devolucao': 'Olá! Preciso de ajuda com uma devolução. Pode me orientar?',
        'vender': 'Olá! Quero vender os meus produtos na VORA 313. Como funciona?'
    };
    return mensagens[opcao] || 'Olá! Posso ajudar?';
}

function abrirWhatsApp(mensagem) {
    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}
