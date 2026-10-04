import { initCarrinho, abrirSacola, adicionarProdutoCarrinho } from './carrinho.js?v=10';
import { carregarCatalogo, filtrarEOrdenar, renderizarGrade, criarCardProduto } from './catalogo.js?v=3';
import { initMobileMenu } from './menu.js';
import { debounce, extrairValorNumerico, mostrarToast, escapeHTML, imagemProdutoSegura, IMAGEM_FALLBACK } from './utils.js';
import { initFidelidade } from './fidelidade.js';
import { initFavoritos } from './favoritos.js';
import { initRecomendacoes, initAfiliados, initI18n, initChatbot } from './fase3.js';
import { renderizarLojas, carregarLojasPublicas } from './lojas-publicas.js?v=10';
import { registarPaginaPublica } from './metricas-acesso.js?v=1';

let catalogo = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 10;
let carregandoMaisProdutos = false;
let dadosLojasPublicas = null;
let limiteLojasPublicas = 8;
let categoriaAtiva = 'todos';
let termoBusca = '';
let precoMin = 0;
let precoMax = Infinity;
let ordenacao = 'ordem';
let minAvaliacao = 0;
let dataFiltro = '';

window.addEventListener('vora313:catalogo-atualizado', () => {
    catalogo = [];
    carregarCatalogo({ force: true }).then((dados) => {
        catalogo = dados;
        renderizarTudo();
    }).catch(() => {});
});

document.addEventListener('DOMContentLoaded', async () => {
    registarPaginaPublica(location.pathname.toLowerCase().endsWith('/categoria.html') ? 'categoria' : 'inicio');
    if (!window.__carrinhoInicializado) {
        initCarrinho();
        window.__carrinhoInicializado = true;
    }
    const parametrosDaPagina = new URLSearchParams(window.location.search);
    if (parametrosDaPagina.get('sacola') === '1') {
        requestAnimationFrame(() => {
            if (abrirSacola()) {
                parametrosDaPagina.delete('sacola');
                const sufixo = parametrosDaPagina.toString();
                history.replaceState({}, '', `${location.pathname}${sufixo ? `?${sufixo}` : ''}${location.hash}`);
            }
        });
    }
    initMobileMenu();
    initVoraThemePicker();
    initFidelidade();
    initFavoritos();
    initAfiliados();
    initI18n();
    initChatbot();
    initDarkMode();
    initBuscaAutocomplete();

    const carregando = document.getElementById('carregandoProdutos');
    if (carregando) {
        carregando.style.display = 'block';
        carregando.textContent = '⏳ Carregando produtos...';
    }

    try {
        catalogo = await carregarCatalogo();
    } catch (e) {
        console.error('Erro ao carregar catálogo:', e);
        catalogo = [];
    }

    renderizarTudo();
    await renderizarDestaquesVora();
    carregarLojasPublicas().then((dados) => {
        dadosLojasPublicas = dados;
        limiteLojasPublicas = 8;
        atualizarLojasPublicas();
    }).catch(() => {
        dadosLojasPublicas = { produtos: [], perfis: [] };
        atualizarLojasPublicas();
    });
    if (carregando) carregando.style.display = 'none';

    // Quando existe cache, carregarCatalogo já atualiza o Supabase em segundo plano.
    atualizarCatalogoDoSupabase();

    // Chamar recomendações após o catálogo estar pronto
    initRecomendacoes();

    // ✅ Fase 4: Expor função de backup globalmente (para uso no admin)

    const buscaInput = document.getElementById('campoBusca');
    if (buscaInput) {
        buscaInput.addEventListener('input', debounce(() => {
            termoBusca = buscaInput.value.trim();
            paginaAtual = 1;
            aplicarFiltros();
        }, 300));
    }

    const precoMinInput = document.getElementById('precoMin');
    const precoMaxInput = document.getElementById('precoMax');
    const precoMinLabel = document.getElementById('precoMinLabel');
    const precoMaxLabel = document.getElementById('precoMaxLabel');

    if (precoMinInput) {
        precoMinInput.addEventListener('input', () => {
            precoMin = parseInt(precoMinInput.value) || 0;
            if (precoMinLabel) precoMinLabel.textContent = precoMin;
            paginaAtual = 1;
            aplicarFiltros();
        });
    }
    if (precoMaxInput) {
        precoMaxInput.addEventListener('input', () => {
            precoMax = parseInt(precoMaxInput.value) || Infinity;
            if (precoMaxLabel) precoMaxLabel.textContent = precoMax;
            paginaAtual = 1;
            aplicarFiltros();
        });
    }

    const ordenarSelect = document.getElementById('ordenar');
    if (ordenarSelect) {
        ordenarSelect.addEventListener('change', (e) => {
            ordenacao = e.target.value;
            paginaAtual = 1;
            aplicarFiltros();
        });
    }

    const minAvaliacaoSelect = document.getElementById('minAvaliacao');
    if (minAvaliacaoSelect) {
        minAvaliacaoSelect.addEventListener('change', (e) => {
            minAvaliacao = parseFloat(e.target.value) || 0;
            paginaAtual = 1;
            aplicarFiltros();
        });
    }

    const dataSelect = document.getElementById('ordenarData');
    if (dataSelect) {
        dataSelect.addEventListener('change', (e) => {
            dataFiltro = e.target.value;
            paginaAtual = 1;
            aplicarFiltros();
        });
    }

    const carregarMaisBtn = document.getElementById('carregarMais');
    if (carregarMaisBtn) {
        carregarMaisBtn.addEventListener('click', carregarMaisProdutos);
    }

    document.getElementById('carregarMaisLojas')?.addEventListener('click', () => {
        if (!dadosLojasPublicas) return;
        limiteLojasPublicas += 8;
        atualizarLojasPublicas();
    });

    await aplicarFiltros();
});

document.addEventListener('click', async function(e) {
    const btnAdd = e.target.closest('.btn-add-carrinho-card');
    if (btnAdd) {
        e.preventDefault();
        e.stopPropagation();
        let produto = catalogo.find((item) => String(item.id) === String(btnAdd.dataset.produtoId));
        // Uma categoria pode terminar de desenhar os cartões alguns instantes
        // antes de o catálogo global acabar de carregar. Reutiliza a mesma
        // fonte em vez de deixar esse primeiro clique sem efeito.
        if (!produto) {
            try {
                catalogo = await carregarCatalogo();
                produto = catalogo.find((item) => String(item.id) === String(btnAdd.dataset.produtoId));
            } catch (_) {}
        }
        if (produto && Array.isArray(produto.variacoes) && produto.variacoes.some((grupo) => grupo?.nome && Array.isArray(grupo?.opcoes) && grupo.opcoes.length)) {
            mostrarToast('Escolha as opções do produto antes de adicionar à sacola.', 'info');
            window.location.href = `detalhe.html?id=${encodeURIComponent(produto.id)}`;
        } else if (produto && extrairValorNumerico(produto.preco) > 0) {
            adicionarProdutoCarrinho(produto);
        } else {
            mostrarToast('Erro ao adicionar produto.', 'info');
        }
        return;
    }

    const btnShare = e.target.closest('.btn-share');
    if (btnShare) {
        e.preventDefault();
        e.stopPropagation();
        const nome = btnShare.dataset.nome;
        const preco = btnShare.dataset.preco;
        const link = btnShare.dataset.link;
        shareProduct(nome, preco, link);
        return;
    }
});

function renderizarTudo() {
    renderizarMaisComprados();
    renderizarDestaquesVora();
    aplicarFiltros();
}

function destaqueAtivo(produto) {
    if (produto?.monetizacao?.destaque !== true) return false;
    const fim = produto?.monetizacao?.destaqueFim;
    if (!fim) return true;
    const data = fim?.toDate ? fim.toDate() : new Date(fim);
    return Number.isNaN(data.getTime()) || data.getTime() > Date.now();
}

async function renderizarDestaquesVora() {
    const grid = document.getElementById('destaquesVoraGrid');
    if (!grid) return;
    const destaques = catalogo.filter(destaqueAtivo);
    grid.innerHTML = '';
    if (!destaques.length) {
        grid.innerHTML = '<div class="destaques-vazio"><strong>⭐ Ainda não existem produtos patrocinados</strong><span>Os produtos destacados pelos vendedores aparecerão aqui automaticamente.</span><a href="vendedor.html">Quero vender na VORA →</a></div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    destaques.slice(0, 12).forEach((produto) => {
        const card = criarCardProduto(produto);
        if (card) fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

async function atualizarCatalogoDoSupabase() {
    try {
        catalogo = await carregarCatalogo();
        renderizarTudo();
    } catch (e) {
        console.warn('Erro ao atualizar do Supabase:', e);
    }
}

async function aplicarFiltros(resetPagina = true) {
    if (resetPagina) paginaAtual = 1;
    const filtrados = filtrarEOrdenar(catalogo, categoriaAtiva, termoBusca, precoMin, precoMax, ordenacao, minAvaliacao, dataFiltro);
    const container = document.getElementById('gradeProdutos');
    if (!container) return;
    const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
    // Se o catálogo mudar enquanto o visitante está numa página seguinte,
    // o botão nunca pode apontar para uma página que deixou de existir.
    if (!totalPaginas) paginaAtual = 1;
    else if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;
    if (paginaAtual === 1) container.innerHTML = '';
    await renderizarGrade(filtrados, container, paginaAtual, ITENS_POR_PAGINA);
    atualizarControleCarregarMais(totalPaginas);
}

function atualizarControleCarregarMais(totalPaginas) {
    const btn = document.getElementById('carregarMais');
    if (!btn) return;
    const temMais = paginaAtual < totalPaginas;
    btn.textContent = !totalPaginas ? 'Sem mais produtos' : (temMais ? 'Carregar mais produtos' : 'Todos os produtos carregados');
    btn.disabled = carregandoMaisProdutos || !temMais;
    btn.setAttribute('aria-disabled', String(btn.disabled));
}

async function carregarMaisProdutos() {
    if (carregandoMaisProdutos) return;
    const filtrados = filtrarEOrdenar(catalogo, categoriaAtiva, termoBusca, precoMin, precoMax, ordenacao, minAvaliacao, dataFiltro);
    const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
    if (paginaAtual >= totalPaginas) {
        atualizarControleCarregarMais(totalPaginas);
        return;
    }
    carregandoMaisProdutos = true;
    atualizarControleCarregarMais(totalPaginas);
    const btn = document.getElementById('carregarMais');
    if (btn) btn.textContent = 'A carregar produtos…';
    try {
        paginaAtual += 1;
        await aplicarFiltros(false);
    } finally {
        carregandoMaisProdutos = false;
        atualizarControleCarregarMais(totalPaginas);
    }
}

function atualizarLojasPublicas() {
    if (!dadosLojasPublicas) return;
    const resultado = renderizarLojas(document.getElementById('lojasPublicasGrid'), dadosLojasPublicas, limiteLojasPublicas);
    const controles = document.getElementById('lojasPublicasControles');
    const botao = document.getElementById('carregarMaisLojas');
    if (!controles || !botao || !resultado) return;
    const temMais = resultado.exibidas < resultado.total;
    controles.hidden = resultado.total <= 8;
    botao.disabled = !temMais;
    botao.setAttribute('aria-disabled', String(!temMais));
    botao.textContent = temMais
        ? `Carregar mais lojas (${resultado.exibidas} de ${resultado.total})`
        : 'Todas as lojas foram carregadas';
}

async function renderizarMaisComprados() {
    const grid = document.getElementById('maisCompradosGrid');
    if (!grid) return;
    const ordens = [1, 2, 3, 4, 5, 6, 7, 8];
    const produtos = catalogo
        .filter(p => ordens.includes(p.ordem))
        .sort((a, b) => a.ordem - b.ordem);
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const prod of produtos) {
        const card = criarCardProduto(prod);
        if (card) fragment.appendChild(card);
    }
    grid.appendChild(fragment);
}

export function initVoraThemePicker() {
    if (document.getElementById('vora-theme-picker')) return;
    const themes = [
        { id:'gold', name:'Dourado', primary:'#D4AF37', dark:'#111111', bg:'#F5F5F5' },
        { id:'blue', name:'Azul', primary:'#2563EB', dark:'#0F172A', bg:'#F4F7FB' },
        { id:'green', name:'Verde', primary:'#0F8A63', dark:'#073B2A', bg:'#F3F8F5' },
        { id:'purple', name:'Roxo', primary:'#7C3AED', dark:'#24113D', bg:'#F7F4FC' },
        { id:'dark', name:'Escuro', primary:'#D4AF37', dark:'#050505', bg:'#0D0D0D' }
    ];
    let saved = localStorage.getItem('vora313_tema');
    // A identidade padrão da VORA 313 volta a ser o verde.
    // Se uma versão antiga deixou 'gold' salvo, migramos uma vez para verde.
    if (!saved || saved === 'gold') {
        saved = 'green';
        localStorage.setItem('vora313_tema', saved);
    }
    document.body.dataset.voraTheme = saved;
    const picker = document.createElement('div');
    picker.id='vora-theme-picker';
    picker.innerHTML = `
      <button class="vora-theme-trigger" type="button" aria-label="Escolher cores" title="Escolher cores">🎨</button>
      <div class="vora-theme-panel" role="dialog" aria-label="Personalizar cores">
        <div class="vora-theme-title">Cores da VORA 313</div>
        <div class="vora-theme-options">
          ${themes.map(t=>`<button type="button" class="vora-theme-option" data-theme="${t.id}" title="${t.name}"><i style="background:${t.primary}"></i><span>${t.name}</span></button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(picker);
    const panel=picker.querySelector('.vora-theme-panel');
    picker.querySelector('.vora-theme-trigger').addEventListener('click',()=>panel.classList.toggle('aberto'));
    picker.querySelectorAll('.vora-theme-option').forEach(btn=>btn.addEventListener('click',()=>{
        const theme=btn.dataset.theme;
        document.body.dataset.voraTheme=theme;
        localStorage.setItem('vora313_tema',theme);
        panel.classList.remove('aberto');
    }));
    document.addEventListener('click',(e)=>{ if(!picker.contains(e.target)) panel.classList.remove('aberto'); });
}

export function initDarkMode() {
    const btnModoEscuro = document.getElementById('btnModoEscuro');
    if (!btnModoEscuro) return;
    const modoSalvo = localStorage.getItem('aurora_modo_escuro');
    if (modoSalvo === 'ativo') {
        document.body.classList.add('modo-escuro');
        btnModoEscuro.innerHTML = '☀️';
        btnModoEscuro.title = 'Modo Claro';
    }
    btnModoEscuro.addEventListener('click', () => {
        document.body.classList.toggle('modo-escuro');
        const escuro = document.body.classList.contains('modo-escuro');
        localStorage.setItem('aurora_modo_escuro', escuro ? 'ativo' : 'inativo');
        btnModoEscuro.innerHTML = escuro ? '☀️' : '🌙';
        btnModoEscuro.title = escuro ? 'Modo Claro' : 'Modo Escuro';
    });
}

export function initBuscaAutocomplete() {
    const campoBusca = document.getElementById('campoBusca');
    if (!campoBusca) return;

    const containerSugestoes = document.createElement('div');
    containerSugestoes.id = 'sugestoesBusca';
    campoBusca.parentElement.style.position = 'relative';
    campoBusca.parentElement.appendChild(containerSugestoes);

    campoBusca.addEventListener('focus', () => {
        if (campoBusca.value.trim().length >= 2) {
            mostrarSugestoes(campoBusca.value.trim(), containerSugestoes);
        }
    });

    campoBusca.addEventListener('input', debounce(() => {
        const termo = campoBusca.value.trim();
        if (termo.length >= 2) {
            mostrarSugestoes(termo, containerSugestoes);
        } else {
            containerSugestoes.style.display = 'none';
        }
    }, 300));

    campoBusca.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') containerSugestoes.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.busca-container')) {
            containerSugestoes.style.display = 'none';
        }
    });
}

async function mostrarSugestoes(termo, container) {
    try {
        const catalogo = await carregarCatalogo();
        const resultados = catalogo.filter(prod => 
            prod.nome.toLowerCase().includes(termo.toLowerCase()) ||
            prod.categoria.toLowerCase().includes(termo.toLowerCase()) ||
            (prod.tag || '').toLowerCase().includes(termo.toLowerCase())
        ).slice(0, 8);

        const categorias = [...new Set(catalogo
            .filter(prod => prod.categoria.toLowerCase().includes(termo.toLowerCase()))
            .map(prod => prod.categoria)
        )].slice(0, 3);

        if (resultados.length === 0 && categorias.length === 0) {
            container.innerHTML = '<div style="padding:12px; color:#999; text-align:center;">Nenhum resultado encontrado</div>';
            container.style.display = 'block';
            return;
        }

        let html = '';
        if (categorias.length > 0) {
            html += '<div style="padding:8px 12px; font-size:11px; text-transform:uppercase; color:#888; background:#f5f5f5; font-weight:700;">Categorias</div>';
            categorias.forEach(cat => {
                html += `
                    <a href="categoria.html?cat=${encodeURIComponent(cat)}" style="display:block; padding:10px 12px; text-decoration:none; color:var(--cor-esmeralda); border-bottom:1px solid #f0f0f0; font-weight:600; font-size:14px;">
                        📂 ${escapeHTML(cat.charAt(0).toUpperCase() + cat.slice(1))}
                    </a>
                `;
            });
        }

        if (resultados.length > 0) {
            html += '<div style="padding:8px 12px; font-size:11px; text-transform:uppercase; color:#888; background:#f5f5f5; font-weight:700;">Produtos</div>';
            resultados.forEach(prod => {
                const preco = prod.preco || '';
                const imgSrc = prod.imagens && prod.imagens[0] ? prod.imagens[0] : '';
                html += `
                    <a href="detalhe.html?id=${encodeURIComponent(prod.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; text-decoration:none; color:#333; border-bottom:1px solid #f0f0f0; transition:0.2s;">
                        <img src="${escapeHTML(imagemProdutoSegura(imgSrc, IMAGEM_FALLBACK))}" alt="" style="width:40px; height:40px; object-fit:cover; border-radius:4px; background:#f0f0f0;" onerror="this.style.display='none';" />
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(prod.nome)}</div>
                            <div style="font-size:12px; color:var(--cor-esmeralda); font-weight:700;">${escapeHTML(preco)}</div>
                        </div>
                    </a>
                `;
            });
        }

        container.innerHTML = html;
        container.style.display = 'block';
    } catch (e) {
        console.error('Erro na busca:', e);
        container.style.display = 'none';
    }
}

window.filtrarPorCategoria = function(categoria) {
    window.location.href = `categoria.html?cat=${categoria}`;
};

window.mudarSlide = function(direcao) {
    const slides = document.querySelectorAll('.slide');
    const indicadores = document.querySelectorAll('.indicador');
    let indexAtual = Array.from(slides).findIndex(s => s.classList.contains('ativo'));
    if (indexAtual === -1) return;
    slides[indexAtual].classList.remove('ativo');
    indicadores[indexAtual].classList.remove('ativo');
    indexAtual = (indexAtual + direcao + slides.length) % slides.length;
    slides[indexAtual].classList.add('ativo');
    indicadores[indexAtual].classList.add('ativo');
};

document.querySelectorAll('.indicador').forEach((ind, i) => {
    ind.addEventListener('click', () => {
        const slides = document.querySelectorAll('.slide');
        const indicadores = document.querySelectorAll('.indicador');
        const indexAtual = Array.from(slides).findIndex(s => s.classList.contains('ativo'));
        if (indexAtual === -1) return;
        slides[indexAtual].classList.remove('ativo');
        indicadores[indexAtual].classList.remove('ativo');
        slides[i].classList.add('ativo');
        indicadores[i].classList.add('ativo');
    });
});

// Avanço automático do carrossel VORA 313 — não pausa ao passar o rato
const intervaloCarrossel = setInterval(() => window.mudarSlide(1), 6000);


window.shareProduct = function(nome, preco, link) {
    const texto = `Olha só este produto incrível da VORA 313!\n\n🔹 *${nome}*\n💰 Preço: ${preco}\n🔗 Confira aqui: ${link}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
};

// V31 — UX mobile: navegação inferior, pesquisa e filtros recolhíveis.
function initV31MobileUX() {
    const mobileSearch = document.getElementById('v31MobileSearch');
    const mobileCart = document.getElementById('v31MobileCart');
    const searchInput = document.getElementById('campoBusca');
    const cartButton = document.getElementById('abrirCarrinhoFlutuante');
    const filterToggle = document.getElementById('v31FilterToggle');
    const filterPanel = document.getElementById('filtrosSidebar');
    const cartCount = document.getElementById('badgeContador');
    const mobileCartCount = document.getElementById('v31MobileCartCount');

    if (mobileSearch && !mobileSearch.dataset.ready) {
        mobileSearch.dataset.ready = '1';
        mobileSearch.addEventListener('click', () => {
            searchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => searchInput?.focus(), 350);
        });
    }
    if (mobileCart && !mobileCart.dataset.ready) {
        mobileCart.dataset.ready = '1';
        mobileCart.addEventListener('click', () => cartButton?.click());
    }
    if (filterToggle && filterPanel && !filterToggle.dataset.ready) {
        filterToggle.dataset.ready = '1';
        filterToggle.addEventListener('click', () => {
            const open = filterPanel.classList.toggle('v31-filtros-abertos');
            filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) filterPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    const syncCartBadge = () => {
        if (mobileCartCount && cartCount) mobileCartCount.textContent = cartCount.textContent || '0';
    };
    syncCartBadge();
    if (cartCount && !cartCount.dataset.v31Observer) {
        cartCount.dataset.v31Observer = '1';
        new MutationObserver(syncCartBadge).observe(cartCount, { childList: true, characterData: true, subtree: true });
    }
}

document.addEventListener('DOMContentLoaded', initV31MobileUX, { once: true });
