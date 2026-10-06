import { initCarrinho, abrirSacola, adicionarProdutoCarrinho } from './carrinho.js?v=10';
import { obterProdutoPublico, buscarCatalogo, criarCardProduto } from './catalogo.js?v=6-catalogo-unificado';
import { initMobileMenu } from './menu.js';
import { adicionarAvaliacao, consultarElegibilidadeAvaliacao, obterAvaliacao, obterAvaliacoesRecentes } from './avaliacoes.js';
import { atualizarMetaTags, escapeHTML, mostrarToast, IMAGEM_FALLBACK, imagemProdutoSegura, urlSegura } from './utils.js';
import { registrarVista } from './fase3.js';
import { registarAcessoPublico } from './metricas-acesso.js?v=1';
import { initFavoritos, verificarFavorito } from './favoritos.js';

let catalogoAtual = [];
let produtoAtual = null;
let quantidadeSelecionada = 1;
let variacaoSelecionada = {};

const normalizar = (valor) => String(valor || '').trim().toLocaleLowerCase();

function precoNumero(produto) {
    const valor = String(produto?.preco || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const numero = Number.parseFloat(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function escaparAtributo(valor) {
    return escapeHTML(String(valor || '')).replace(/`/g, '&#96;');
}

document.addEventListener('DOMContentLoaded', async () => {
    // A página de detalhe tem a própria interface da sacola. Sem esta
    // inicialização o botão até chamava a função, mas nada era guardado.
    if (!window.__carrinhoInicializado) {
        initCarrinho();
        window.__carrinhoInicializado = true;
    }
    initMobileMenu();
    await initFavoritos();
    const params = new URLSearchParams(window.location.search);
    const idProduto = params.get('id');

    if (!idProduto) return mostrarErro('Nenhum ID de produto foi informado.');

    // Nunca procurar o produto num cache legado: os cartões da página inicial
    // e os detalhes têm de vir da mesma lista, com o mesmo identificador.
    try {
        produtoAtual = await obterProdutoPublico(idProduto);
    } catch (error) {
        console.error('Erro ao carregar produto:', error);
        return mostrarErro('Erro ao carregar o produto.');
    }
    if (!produtoAtual) return mostrarErro('Produto não encontrado.');
    catalogoAtual = [produtoAtual];

    renderizarDetalhes(produtoAtual);
    registarProdutoVisto(produtoAtual);
    void registarVisualizacaoPublica(produtoAtual);
    await renderizarRecomendacoes(produtoAtual);
    atualizarMetaTags(produtoAtual.nome, produtoAtual.descricao || 'Detalhes do produto', imagemProdutoSegura(produtoAtual.imagens?.[0], ''));
    registrarVista(produtoAtual);
    carregarAvaliacaoAsync(produtoAtual.id);
});

// Os cartões de produtos relacionados são criados depois do carregamento e
// não passam pelo app.js da página inicial. Este delegado cobre exatamente
// esses botões sem alterar o comportamento da vitrine principal.
document.addEventListener('click', (event) => {
    const botao = event.target.closest('.btn-add-carrinho-card');
    if (!botao) return;
    const produto = catalogoAtual.find((item) => String(item.id) === String(botao.dataset.produtoId));
    if (!produto) return;
    event.preventDefault();
    event.stopPropagation();
    if (gruposVariacao(produto).length) {
        mostrarToast('Escolha as opções do produto antes de adicionar à sacola.', 'info');
        window.location.href = `detalhe.html?id=${encodeURIComponent(produto.id)}`;
        return;
    }
    adicionarProdutoCarrinho(produto);
});

function mostrarErro(mensagem) {
    const container = document.getElementById('detalhesConteudo');
    if (!container) return;
    container.innerHTML = `
        <div class="erro-msg">
            <h2>⚠️ Ops!</h2>
            <p>${escapeHTML(mensagem)}</p>
            <p style="margin-top:20px;"><a href="index.html" style="color:var(--cor-esmeralda);font-weight:700;">Voltar para a loja</a></p>
        </div>`;
}

function gruposVariacao(produto) {
    if (!Array.isArray(produto?.variacoes)) return [];
    return produto.variacoes.map((grupo) => {
        const nome = String(grupo?.nome || '').trim();
        const opcoes = Array.isArray(grupo?.opcoes) ? grupo.opcoes.map((opcao) => String(opcao?.nome || opcao || '').trim()).filter(Boolean).slice(0, 20) : [];
        return nome && opcoes.length ? { nome, obrigatoria: grupo.obrigatoria !== false, opcoes } : null;
    }).filter(Boolean).slice(0, 3);
}

function renderizarVariacoes(produto) {
    const grupos = gruposVariacao(produto);
    if (!grupos.length) return '';
    return `<section class="detalhe-variacoes" aria-label="Opções do produto"><p>Escolha antes de adicionar:</p>${grupos.map((grupo) => `<div class="detalhe-variacao-grupo"><strong>${escaparAtributo(grupo.nome)}${grupo.obrigatoria ? ' <span aria-hidden="true">*</span>' : ''}</strong><div class="detalhe-variacao-opcoes">${grupo.opcoes.map((opcao) => `<button type="button" data-variacao-nome="${escaparAtributo(grupo.nome)}" data-variacao-valor="${escaparAtributo(opcao)}" aria-pressed="false">${escaparAtributo(opcao)}</button>`).join('')}</div></div>`).join('')}<small id="avisoVariacao">Selecione as opções obrigatórias para continuar.</small></section>`;
}

function configurarVariacoes(produto) {
    const grupos = gruposVariacao(produto);
    variacaoSelecionada = {};
    if (!grupos.length) return;
    document.querySelectorAll('[data-variacao-nome][data-variacao-valor]').forEach((botao) => {
        botao.addEventListener('click', () => {
            const nome = botao.dataset.variacaoNome;
            const valor = botao.dataset.variacaoValor;
            if (!nome || !valor) return;
            variacaoSelecionada[nome] = valor;
            document.querySelectorAll('[data-variacao-nome]').forEach((item) => {
                if (item.dataset.variacaoNome === nome) item.setAttribute('aria-pressed', String(item.dataset.variacaoValor === valor));
            });
            const aviso = document.getElementById('avisoVariacao');
            if (aviso) aviso.textContent = selecaoVariacaoCompleta(produto) ? 'Opções selecionadas.' : 'Selecione as opções obrigatórias para continuar.';
        });
    });
}

function selecaoVariacaoCompleta(produto) {
    return gruposVariacao(produto).every((grupo) => !grupo.obrigatoria || Boolean(variacaoSelecionada[grupo.nome]));
}

function selecaoVariacaoParaCarrinho(produto) {
    if (!selecaoVariacaoCompleta(produto)) {
        const pendente = gruposVariacao(produto).find((grupo) => grupo.obrigatoria && !variacaoSelecionada[grupo.nome]);
        mostrarToast(`Escolha ${pendente?.nome || 'as opções do produto'} antes de continuar.`, 'info');
        return null;
    }
    return { ...variacaoSelecionada };
}

function renderizarDetalhes(prod) {
    const container = document.getElementById('detalhesConteudo');
    if (!container) return;

    const catLink = document.getElementById('breadcrumbCat');
    const prodName = document.getElementById('breadcrumbProd');
    if (catLink) {
        const categoria = String(prod.categoria || '');
        catLink.textContent = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Produtos';
        catLink.href = `categoria.html?cat=${encodeURIComponent(categoria)}`;
    }
    if (prodName) prodName.textContent = prod.nome || 'Produto';

    const imagens = Array.isArray(prod.imagens) && prod.imagens.length ? prod.imagens : [IMAGEM_FALLBACK];
    const principal = imagemProdutoSegura(imagens[0], IMAGEM_FALLBACK);
    const stock = Number(prod.estoque);
    const stockConhecido = Number.isFinite(stock);
    const esgotado = stockConhecido && stock <= 0;
    const descricao = prod.descricao || 'Descrição não disponível.';
    const videoUrl = urlSegura(prod.video);
    const videoHtml = videoUrl && /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//.test(videoUrl)
        ? `<div class="video-container"><iframe src="${escaparAtributo(videoUrl)}" title="Vídeo do produto" frameborder="0" allowfullscreen loading="lazy"></iframe></div>` : '';

    quantidadeSelecionada = 1;
    variacaoSelecionada = {};

    const miniaturasHtml = imagens.map((src, i) => `
        <button type="button" class="miniatura-produto ${i === 0 ? 'ativa' : ''}" data-index="${i}" aria-label="Ver imagem ${i + 1}">
            <img src="${escaparAtributo(imagemProdutoSegura(src, IMAGEM_FALLBACK))}" alt="${escaparAtributo(prod.nome)} - imagem ${i + 1}" loading="lazy" onerror="this.onerror=null;this.src='${IMAGEM_FALLBACK}';">
        </button>`).join('');

    container.innerHTML = `
        <div class="detalhes-layout">
            <div class="detalhes-imagem-principal">
                <div class="detalhes-imagem-wrap">
                    <img id="detalhesImg" src="${escaparAtributo(principal)}" alt="${escaparAtributo(prod.nome)}" onerror="this.onerror=null;this.src='${IMAGEM_FALLBACK}';">
                </div>
                <div class="detalhes-miniaturas" id="miniaturas">${miniaturasHtml}</div>
                ${videoHtml}
            </div>

            <div class="detalhes-info">
                <span class="categoria-tag">${escaparAtributo(prod.tag || prod.categoria || 'Produto')}</span>
                ${prod.selo ? `<span class="detalhe-selo">${escaparAtributo(prod.selo)}</span>` : ''}
                <h2>${escaparAtributo(prod.nome || 'Produto')}</h2>
                ${prod.marca ? `<div class="detalhe-marca">Marca: <strong>${escaparAtributo(prod.marca)}</strong>${prod.sku ? ` · SKU: ${escaparAtributo(prod.sku)}` : ''}</div>` : (prod.sku ? `<div class="detalhe-marca">SKU: <strong>${escaparAtributo(prod.sku)}</strong></div>` : '')}
                ${renderizarDestaques(prod)}
                ${prod.vendedorId || prod.vendedorNome ? `<a class="detalhe-loja-card" href="loja.html?vendedor=${encodeURIComponent(prod.vendedorId || '')}"><span class="detalhe-loja-avatar">🏪</span><span><small>Vendido por</small><strong>${escaparAtributo(prod.vendedorNome || 'Loja VORA 313')}</strong><em>Ver loja →</em></span></a>` : ''}
                <button type="button" class="btn-favorito detalhe-btn-favorito ${verificarFavorito(prod.id) ? 'ativo' : ''}" data-produto-id="${escaparAtributo(prod.id)}" aria-pressed="${verificarFavorito(prod.id) ? 'true' : 'false'}" aria-label="${verificarFavorito(prod.id) ? 'Remover produto dos favoritos' : 'Adicionar produto aos favoritos'}" title="${verificarFavorito(prod.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${verificarFavorito(prod.id) ? '♥' : '♡'} Favorito</button>
                <div class="detalhes-precos">
                    ${prod.precoAntigo ? `<span class="preco-antigo">${escaparAtributo(prod.precoAntigo)}</span>` : ''}
                    <span class="preco-destaque">${escaparAtributo(prod.preco || '')}</span>
                    ${prod.desconto ? `<span class="desconto-badge">${escaparAtributo(prod.desconto)} OFF</span>` : ''}
                </div>
                <div id="avaliacaoContainer" class="avaliacao detalhe-avaliacao"><span>⭐ Carregando avaliações...</span></div>
                <div id="produtoVisualizacoes" class="detalhe-visualizacoes" hidden aria-live="polite"></div>

                <div class="detalhe-compra-box">
                    ${prod.parcelas ? `<div class="parcelas">${escaparAtributo(prod.parcelas)}</div>` : ''}
                    ${prod.freteGratis ? `<div class="frete-gratis">🚚 Frete grátis</div>` : ''}
                    ${stockConhecido ? `<div class="detalhe-stock ${esgotado ? 'esgotado' : ''}">${esgotado ? '🚫 Produto esgotado' : `✓ ${stock} unidade${stock === 1 ? '' : 's'} disponível${stock === 1 ? '' : 'is'}`}</div>` : '<div class="detalhe-stock">✓ Disponibilidade confirmada no carrinho</div>'}
                    ${renderizarVariacoes(prod)}
                    <div class="detalhe-quantidade" aria-label="Quantidade">
                        <span class="quantidade-label">Quantidade</span>
                        <div class="quantidade-controle">
                            <button type="button" id="diminuirQtd" aria-label="Diminuir quantidade">−</button>
                            <span id="quantidadeProduto">1</span>
                            <button type="button" id="aumentarQtd" aria-label="Aumentar quantidade">+</button>
                        </div>
                    </div>
                    <button class="btn-comprar-grande" id="btnComprarDetalhe" ${esgotado ? 'disabled' : ''}>🛒 Comprar Agora</button>
                    <button class="btn-adicionar-detalhe" id="btnAdicionarDetalhe" ${esgotado ? 'disabled' : ''}>Adicionar à sacola</button>
                    <button class="btn-partilhar-detalhe" id="btnPartilharDetalhe">↗ Partilhar produto</button>
                </div>

                <div class="detalhe-beneficios">
                    <div class="detalhe-beneficio">🔒<br><strong>Compra segura</strong></div>
                    <div class="detalhe-beneficio">🚚<br><strong>Entrega em Angola</strong></div>
                    <div class="detalhe-beneficio">💬<br><strong>Suporte VORA 313</strong></div>
                </div>
            </div>
        </div>

        <div class="detalhe-secoes">
            <section class="detalhe-bloco">
                <h3>Descrição do produto</h3>
                <p class="descricao">${escapeHTML(descricao).replace(/\n/g, '<br>')}</p>
            </section>
            ${renderizarCaracteristicas(prod)}
            ${renderizarEntrega(prod)}
        </div>
    `;

    configurarGaleria(imagens, prod.nome);
    configurarVariacoes(prod);
    adicionarBarraCompraMobile(prod, esgotado);
    document.getElementById('diminuirQtd')?.addEventListener('click', () => alterarQuantidade(-1));
    document.getElementById('aumentarQtd')?.addEventListener('click', () => alterarQuantidade(1));
    document.getElementById('btnAdicionarDetalhe')?.addEventListener('click', () => adicionarQuantidadeAoCarrinho(prod));
    document.getElementById('btnComprarDetalhe')?.addEventListener('click', () => {
        if (adicionarQuantidadeAoCarrinho(prod)) abrirSacola();
    });
    document.getElementById('btnPartilharDetalhe')?.addEventListener('click', () => partilharProduto(prod));
}

async function registarVisualizacaoPublica(produto) {
    const destino = document.getElementById('produtoVisualizacoes');
    const resposta = await registarAcessoPublico('produto', produto?.id);
    const total = Number(resposta?.visualizacoes);
    if (!destino || !Number.isFinite(total) || total < 1) return;
    destino.hidden = false;
    destino.textContent = `👁 Visto por ${total.toLocaleString('pt-AO')} ${total === 1 ? 'pessoa' : 'pessoas'}`;
}

function adicionarBarraCompraMobile(prod, esgotado) {
    document.querySelector('.v33-mobile-buy')?.remove();
    if (esgotado) return;
    const barra = document.createElement('div');
    barra.className = 'v33-mobile-buy';
    barra.innerHTML = '<button type="button" class="v33-add">Adicionar</button><button type="button" class="v33-buy">Comprar agora</button>';
    barra.querySelector('.v33-add')?.addEventListener('click', () => document.getElementById('btnAdicionarDetalhe')?.click());
    barra.querySelector('.v33-buy')?.addEventListener('click', () => document.getElementById('btnComprarDetalhe')?.click());
    document.body.appendChild(barra);
}

function renderizarDestaques(prod) {
    if (!Array.isArray(prod.destaques) || !prod.destaques.length) return '';
    return `<ul class="detalhe-destaques">${prod.destaques.slice(0, 8).map(item => `<li>✓ ${escapeHTML(item)}</li>`).join('')}</ul>`;
}

function renderizarEntrega(prod) {
    return `<section class="detalhe-bloco detalhe-entrega"><h3>Compra e entrega</h3><div class="entrega-grid"><div><strong>🚚 Entrega</strong><span>Disponível em Angola</span></div><div><strong>🔒 Pagamento</strong><span>Processo seguro</span></div><div><strong>↩️ Devolução</strong><span>Consulte as condições da loja</span></div>${prod.freteGratis ? '<div><strong>🎁 Frete</strong><span>Frete grátis</span></div>' : ''}</div></section>`;
}

function registarProdutoVisto(prod) {
    try {
        const atual = JSON.parse(localStorage.getItem('aurora_produtos_vistos') || '[]');
        const item = { id: String(prod.id), nome: prod.nome || 'Produto', imagem: Array.isArray(prod.imagens) ? prod.imagens[0] : '', preco: prod.preco || '', vistoEm: Date.now() };
        const semAtual = atual.filter(p => String(p.id) !== String(prod.id));
        localStorage.setItem('aurora_produtos_vistos', JSON.stringify([item, ...semAtual].slice(0, 12)));
    } catch (_) {}
}

function renderizarCaracteristicas(prod) {
    const candidatos = [prod.especificacoes, prod.caracteristicas, prod.detalhes];
    const fonte = candidatos.find(v => v && typeof v === 'object' && !Array.isArray(v));
    if (!fonte) return '';
    const entradas = Object.entries(fonte).filter(([_, valor]) => valor !== null && valor !== undefined && String(valor).trim());
    if (!entradas.length) return '';
    return `<section class="detalhe-bloco"><h3>Características</h3><div class="detalhe-caracteristicas">${entradas.map(([chave, valor]) => `<div class="detalhe-caracteristica"><strong>${escapeHTML(chave)}:</strong> ${escapeHTML(valor)}</div>`).join('')}</div></section>`;
}

function configurarGaleria(imagens, nome) {
    const principal = document.getElementById('detalhesImg');
    document.querySelectorAll('#miniaturas .miniatura-produto').forEach((botao) => {
        botao.addEventListener('click', () => {
            const index = Number(botao.dataset.index);
            const src = imagemProdutoSegura(imagens[index], IMAGEM_FALLBACK);
            if (principal) principal.src = src;
            document.querySelectorAll('#miniaturas .miniatura-produto').forEach(b => b.classList.remove('ativa'));
            botao.classList.add('ativa');
        });
    });
}

function alterarQuantidade(delta) {
    const stock = Number(produtoAtual?.estoque);
    const max = Number.isFinite(stock) && stock > 0 ? stock : 99;
    quantidadeSelecionada = Math.min(max, Math.max(1, quantidadeSelecionada + delta));
    const alvo = document.getElementById('quantidadeProduto');
    if (alvo) alvo.textContent = String(quantidadeSelecionada);
}

function adicionarQuantidadeAoCarrinho(prod) {
    if (!prod) return false;
    const variacao = selecaoVariacaoParaCarrinho(prod);
    if (variacao === null) return false;
    let adicionado = false;
    for (let i = 0; i < quantidadeSelecionada; i += 1) adicionado = adicionarProdutoCarrinho(prod, '', variacao) || adicionado;
    if (quantidadeSelecionada > 1) mostrarToast(`${quantidadeSelecionada} unidades adicionadas à sacola.`, 'sucesso');
    return adicionado;
}

function partilharProduto(prod) {
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
    const link = `${baseUrl}/detalhe.html?id=${encodeURIComponent(prod.id)}`;
    const texto = `Olha só este produto da VORA 313!\n\n${prod.nome}\nPreço: ${prod.preco}\n${link}`;
    if (navigator.share) navigator.share({ title: prod.nome, text: `Confira ${prod.nome} na VORA 313.`, url: link }).catch(() => {});
    else window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
}

async function renderizarRecomendacoes(prod) {
    const container = document.getElementById('detalhesConteudo');
    if (!container) return;
    try {
        const categoria = normalizar(prod.categoria);
        const [mesmaCategoria, gerais] = await Promise.all([
            buscarCatalogo({ categoria: prod.categoria, ordenacao: 'relevancia', limite: 10, offset: 0 }),
            buscarCatalogo({ ordenacao: 'ordem', limite: 10, offset: 0 })
        ]);
        const usados = new Set([String(prod.id)]);
        const secao1 = mesmaCategoria.produtos.filter((p) => normalizar(p.categoria) === categoria && !usados.has(String(p.id))).slice(0, 10);
        secao1.forEach((p) => usados.add(String(p.id)));
        const secao2 = gerais.produtos.filter((p) => !usados.has(String(p.id))).slice(0, 10);

        const criarSecao = (titulo, subtitulo, produtos) => {
            if (!produtos.length) return '';
            const railId = `rail-${Math.random().toString(36).slice(2, 8)}`;
            return `<section class="recomendacoes-secao"><div class="secao-titulo"><h2>${titulo}</h2><span class="ver-todos">Deslize para ver mais →</span></div><p class="recomendacoes-subtitulo">${subtitulo}</p><div id="${railId}" class="grade-produtos produtos-rail"></div></section>`;
        };
        const wrapper = document.createElement('div');
        wrapper.innerHTML = criarSecao('Produtos relacionados', 'Mais opções da mesma categoria', secao1) + criarSecao('Também podes gostar', 'Sugestões para continuar a explorar a VORA 313', secao2);
        [...wrapper.children].forEach((secao, index) => {
            const produtos = index === 0 ? secao1 : secao2;
            const rail = secao.querySelector('.produtos-rail');
            const fragment = document.createDocumentFragment();
            produtos.forEach((p) => {
                const card = criarCardProduto(p);
                if (card) fragment.appendChild(card);
            });
            rail?.appendChild(fragment);
        });
        container.appendChild(wrapper);
    } catch (error) {
        console.warn('Não foi possível carregar recomendações:', error);
    }
}

async function carregarAvaliacaoAsync(prodId) {
    try {
        const [resumo, recentes, elegibilidade] = await Promise.all([
            obterAvaliacao(prodId),
            obterAvaliacoesRecentes(prodId, 6),
            consultarElegibilidadeAvaliacao(prodId)
        ]);
        const container = document.getElementById('avaliacaoContainer');
        if (!container) return;
        const estrelas = Number(resumo.total || 0) ? '★'.repeat(Math.round(Number(resumo.media || 0))) + '☆'.repeat(Math.max(0, 5 - Math.round(Number(resumo.media || 0)))) : '☆☆☆☆☆';
        const distribuicao = [5,4,3,2,1].map((nota) => {
            const quantidade = Number(resumo[`estrelas_${nota}`] || 0);
            const percentagem = resumo.total ? Math.round((quantidade / Number(resumo.total)) * 100) : 0;
            return `<div class="avaliacao-barra"><span>${nota}★</span><i><b style="width:${percentagem}%"></b></i><small>${quantidade}</small></div>`;
        }).join('');
        const reviews = recentes.length
            ? `<div class="avaliacoes-recentes">${recentes.map((review) => `<article class="avaliacao-review"><div><strong>${'★'.repeat(Number(review.nota))}${'☆'.repeat(5 - Number(review.nota))}</strong><span>${review.verificada ? '✓ Compra verificada' : ''}</span></div>${review.comentario ? `<p>${escapeHTML(review.comentario)}</p>` : '<p class="sem-comentario">Cliente avaliou este produto sem comentário.</p>'}<small>${new Date(review.data).toLocaleDateString('pt-AO')}</small></article>`).join('')}</div>`
            : '<p class="avaliacao-vazia">Ainda não existem avaliações verificadas para este produto.</p>';
        const formulario = elegibilidade?.podeAvaliarProduto
            ? `<form class="avaliar-form" id="formAvaliarProduto"><div class="avaliar-campos"><label>Como avalia a compra?<select id="notaAvaliacao" required><option value="5">★★★★★ — Excelente</option><option value="4">★★★★☆ — Muito boa</option><option value="3">★★★☆☆ — Boa</option><option value="2">★★☆☆☆ — Fraca</option><option value="1">★☆☆☆☆ — Muito fraca</option></select></label><label>Comentário <span>(opcional)</span><textarea id="comentarioAvaliacao" maxlength="1000" rows="3" placeholder="Conte como foi a sua experiência com este produto."></textarea></label></div><button id="btnAvaliar" class="btn-avaliar" type="submit">Publicar avaliação verificada</button></form>`
            : `<small class="avaliacao-aviso">${escapeHTML(elegibilidade?.motivo || (elegibilidade?.produtoJaAvaliado ? 'Você já avaliou este item.' : 'A avaliação fica disponível após a entrega do pedido.'))}</small>`;
        container.innerHTML = `<div class="avaliacao-resumo"><div><strong class="avaliacao-nota">${resumo.total ? Number(resumo.media).toFixed(1) : '—'}</strong><span class="avaliacao-estrelas">${estrelas}</span><small>${Number(resumo.total || 0)} avaliação${Number(resumo.total || 0) === 1 ? '' : 'ões'} verificada${Number(resumo.total || 0) === 1 ? '' : 's'}</small></div><div class="avaliacao-distribuicao">${distribuicao}</div></div>${reviews}${formulario}`;
        document.getElementById('formAvaliarProduto')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const botao = document.getElementById('btnAvaliar');
            botao.disabled = true;
            try {
                await adicionarAvaliacao(prodId, Number(document.getElementById('notaAvaliacao')?.value || 5), document.getElementById('comentarioAvaliacao')?.value || '', { itemId: elegibilidade.itemId, tipo: 'produto' });
                mostrarToast('Avaliação verificada publicada!', 'sucesso');
                await carregarAvaliacaoAsync(prodId);
            } catch (erro) {
                mostrarToast(erro?.message || 'Não foi possível publicar a avaliação.', 'erro');
                botao.disabled = false;
            }
        });
    } catch (_) {
        const container = document.getElementById('avaliacaoContainer');
        if (container) container.innerHTML = '<span>⭐ As avaliações não estão disponíveis neste momento.</span>';
    }
}
