import { initCarrinho, abrirSacola, adicionarProdutoCarrinho } from './carrinho.js?v=10';
import { buscarCatalogo, obterProdutoPublico, obterVendedoresPublicos, renderizarGrade, criarCardProduto } from './catalogo.js?v=7-preco-sem-limite';
import { initMobileMenu } from './menu.js';
import { debounce, extrairValorNumerico, mostrarToast, escapeHTML, imagemProdutoSegura, IMAGEM_FALLBACK } from './utils.js';
import { initFidelidade } from './fidelidade.js';
import { initFavoritos } from './favoritos.js';
import { initRecomendacoes, initAfiliados, initI18n, initChatbot } from './fase3.js';
import { renderizarLojas, carregarLojasPublicas } from './lojas-publicas.js?v=10';
import { registarPaginaPublica } from './metricas-acesso.js?v=1';
import { supabase } from './config.js';

let catalogo = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 12;
let totalResultados = 0;
let carregandoMaisProdutos = false;
let pesquisaSequencia = 0;
let dadosLojasPublicas = null;
let limiteLojasPublicas = 8;
let categoriaAtiva = 'todos';
let termoBusca = '';
let precoMin = 0;
let precoMax = Infinity;
let ordenacao = 'relevancia';
let minAvaliacao = 0;
let dataFiltro = '';

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

    catalogo = [];
    renderizarTudo();
    await renderizarDestaquesVora();
    preencherFiltroVendedores();
    carregarLojasPublicas().then((dados) => {
        dadosLojasPublicas = dados;
        limiteLojasPublicas = 8;
        atualizarLojasPublicas();
    }).catch(() => {
        dadosLojasPublicas = { produtos: [], perfis: [] };
        atualizarLojasPublicas();
    });
    if (carregando) carregando.style.display = 'none';

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
            precoMax = precoMaxInput.value === '' ? Infinity : Number(precoMaxInput.value);
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

    const disponibilidadeSelect = document.getElementById('disponibilidade');
    if (disponibilidadeSelect) {
        disponibilidadeSelect.addEventListener('change', () => {
            paginaAtual = 1;
            aplicarFiltros();
        });
    }

    const vendedorSelect = document.getElementById('vendedorFiltro');
    if (vendedorSelect) {
        vendedorSelect.addEventListener('change', () => {
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
                produto = await obterProdutoPublico(btnAdd.dataset.produtoId);
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
    void renderizarMaisComprados();
    void aplicarFiltros();
}

function atualizarControleCarregarMais() {
    const btn = document.getElementById('carregarMais');
    if (!btn) return;
    const temMais = catalogo.length < totalResultados;
    btn.textContent = totalResultados === 0
        ? 'Sem resultados'
        : (temMais ? `Carregar mais produtos (${catalogo.length} de ${totalResultados})` : 'Todos os produtos carregados');
    btn.disabled = carregandoMaisProdutos || !temMais;
    btn.setAttribute('aria-disabled', String(btn.disabled));
}

function estadoCatalogo(mensagem, classe = '') {
    const container = document.getElementById('gradeProdutos');
    if (!container) return;
    container.replaceChildren();
    const aviso = document.createElement('div');
    aviso.className = `catalogo-estado ${classe}`.trim();
    aviso.textContent = mensagem;
    aviso.style.cssText = 'grid-column:1/-1;text-align:center;padding:60px 20px;color:#777;font-size:16px;';
    container.append(aviso);
}

async function aplicarFiltros(resetPagina = true) {
    if (resetPagina) {
        paginaAtual = 1;
        catalogo = [];
        totalResultados = 0;
    }
    const sequencia = ++pesquisaSequencia;
    const carregando = document.getElementById('carregandoProdutos');
    if (carregando) {
        carregando.style.display = 'block';
        carregando.textContent = paginaAtual === 1 ? '⏳ A pesquisar produtos...' : '⏳ A carregar mais produtos...';
    }
    const btn = document.getElementById('carregarMais');
    if (btn) btn.disabled = true;

    try {
        const resultado = await buscarCatalogo({
            busca: termoBusca,
            categoria: categoriaAtiva,
            precoMin,
            precoMax: Number.isFinite(precoMax) ? precoMax : null,
            disponibilidade: document.getElementById('disponibilidade')?.value || 'todos',
            vendedorId: document.getElementById('vendedorFiltro')?.value || null,
            minAvaliacao,
            dataDias: Number.parseInt(dataFiltro, 10) || 0,
            ordenacao: ordenacao === 'data' ? 'mais-recentes' : (ordenacao === 'nome' ? 'relevancia' : ordenacao),
            limite: ITENS_POR_PAGINA,
            offset: (paginaAtual - 1) * ITENS_POR_PAGINA
        });
        if (sequencia !== pesquisaSequencia) return;
        totalResultados = resultado.total;
        if (paginaAtual === 1) catalogo = resultado.produtos;
        else catalogo = [...catalogo, ...resultado.produtos];

        const container = document.getElementById('gradeProdutos');
        if (!container) return;
        if (paginaAtual === 1) container.replaceChildren();
        if (!resultado.produtos.length && paginaAtual === 1) {
            estadoCatalogo(termoBusca || categoriaAtiva !== 'todos' ? '🔎 Nenhum produto corresponde aos filtros selecionados.' : '📦 Ainda não existem produtos publicados.', 'vazio');
        } else {
            const fragment = document.createDocumentFragment();
            resultado.produtos.forEach((produto) => {
                const card = criarCardProduto(produto);
                if (card) fragment.append(card);
            });
            container.append(fragment);
        }
        atualizarControleCarregarMais();
    } catch (error) {
        if (sequencia !== pesquisaSequencia) return;
        console.error('Erro na pesquisa do catálogo:', error);
        if (paginaAtual === 1) estadoCatalogo('⚠️ Não foi possível pesquisar agora. Tente novamente.', 'erro');
        else if (btn) btn.disabled = false;
    } finally {
        if (sequencia === pesquisaSequencia && carregando) carregando.style.display = 'none';
    }
}

async function carregarMaisProdutos() {
    if (carregandoMaisProdutos || catalogo.length >= totalResultados) return;
    carregandoMaisProdutos = true;
    atualizarControleCarregarMais();
    try {
        paginaAtual += 1;
        await aplicarFiltros(false);
    } finally {
        carregandoMaisProdutos = false;
        atualizarControleCarregarMais();
    }
}

async function renderizarDestaquesVora() {
    const grid = document.getElementById('destaquesVoraGrid');
    if (!grid) return;
    try {
        const { data, error } = await supabase
            .from('produtos')
            .select('id,ordem,nome,categoria,preco,preco_valor,preco_antigo,desconto,parcelas,frete_gratis,descricao,imagens,marca,sku,tag,estoque,vendedor_id,vendedor_nome,monetizacao,criado_em,atualizado_em')
            .eq('ativo', true).eq('vendedor_ativo', true).eq('status_aprovacao', 'aprovado')
            .order('criado_em', { ascending: false }).limit(12);
        if (error) throw error;
        const destaques = (data || []).filter((p) => {
            if (p?.monetizacao?.destaque !== true) return false;
            const fim = p?.monetizacao?.destaqueFim;
            if (!fim) return true;
            const d = new Date(fim);
            return Number.isNaN(d.getTime()) || d.getTime() > Date.now();
        });
        grid.replaceChildren();
        if (!destaques.length) {
            grid.innerHTML = '<div class="destaques-vazio"><strong>⭐ Ainda não existem produtos patrocinados</strong><span>Os produtos destacados pelos vendedores aparecerão aqui automaticamente.</span><a href="vendedor.html">Quero vender na VORA →</a></div>';
            return;
        }
        const { buscarCatalogo } = await import('./catalogo.js?v=7-preco-sem-limite');
        const ids = new Set(destaques.map((p) => String(p.id)));
        const resultado = await buscarCatalogo({ ordenacao: 'mais-recentes', limite: 50 });
        resultado.produtos.filter((p) => ids.has(String(p.id))).forEach((p) => {
            const card = criarCardProduto(p);
            if (card) grid.append(card);
        });
    } catch (error) {
        console.warn('Não foi possível carregar os destaques:', error);
        grid.replaceChildren();
    }
}

async function preencherFiltroVendedores() {
    const select = document.getElementById('vendedorFiltro');
    if (!select) return;
    try {
        const vendedores = await obterVendedoresPublicos();
        vendedores.forEach((vendedor) => {
            if (!vendedor?.id) return;
            const option = document.createElement('option');
            option.value = vendedor.id;
            option.textContent = vendedor.nome_loja || vendedor.categoria || 'Loja';
            select.append(option);
        });
    } catch (error) {
        console.warn('Não foi possível carregar os vendedores públicos:', error);
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
    try {
        const resultado = await buscarCatalogo({ ordenacao: 'ordem', limite: 8, offset: 0 });
        grid.replaceChildren();
        const fragment = document.createDocumentFragment();
        resultado.produtos.forEach((prod) => {
            const card = criarCardProduto(prod);
            if (card) fragment.append(card);
        });
        grid.append(fragment);
    } catch (error) {
        console.warn('Não foi possível carregar a vitrine inicial:', error);
        grid.replaceChildren();
    }
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
        const resultado = await buscarCatalogo({ busca: termo, ordenacao: 'relevancia', limite: 12, offset: 0 });
        const resultados = resultado.produtos.slice(0, 8);
        const categorias = [...new Set(resultados.map((prod) => prod.categoria).filter(Boolean))].slice(0, 3);
        if (resultados.length === 0 && categorias.length === 0) {
            container.textContent = 'Nenhum resultado encontrado';
            container.style.display = 'block';
            return;
        }
        container.replaceChildren();
        resultados.forEach((prod) => {
            const link = document.createElement('a');
            link.href = `detalhe.html?id=${encodeURIComponent(prod.id)}`;
            link.textContent = `${prod.nome || 'Produto'}${prod.categoria ? ` · ${prod.categoria}` : ''}`;
            link.style.cssText = 'display:block;padding:10px 12px;text-decoration:none;color:var(--cor-esmeralda);border-bottom:1px solid #f0f0f0;font-size:14px;';
            container.append(link);
        });
        categorias.forEach((cat) => {
            const link = document.createElement('a');
            link.href = `categoria.html?cat=${encodeURIComponent(cat)}`;
            link.textContent = `📂 ${cat}`;
            link.style.cssText = 'display:block;padding:10px 12px;text-decoration:none;color:var(--cor-esmeralda);font-weight:600;font-size:14px;';
            container.append(link);
        });
        container.style.display = 'block';
    } catch (_) {
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
