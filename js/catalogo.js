import { db, CONFIG } from './config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { extrairValorNumerico, IMAGEM_FALLBACK, urlSegura } from './utils.js';
import { obterAvaliacao } from './avaliacoes.js';
import { verificarFavorito } from './favoritos.js';
import { obterLinkAfiliado } from './fase3.js';
import { ordenarProdutosMonetizados } from './monetizacao.js';

let cacheMemoria = null;
let catalogoPromise = null;

function normalizarProduto(snapshotDoc) {
  const produto = snapshotDoc.data();
  return { ...produto, id: String(produto.id || snapshotDoc.id) };
}

export async function carregarCatalogo() {
  if (cacheMemoria) return cacheMemoria;
  if (catalogoPromise) return catalogoPromise;
  catalogoPromise = (async () => {
    try {
      const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || 'null');
      if (Array.isArray(cache?.data) && cache.data.length) {
        cacheMemoria = ordenarProdutosMonetizados(cache.data);
        atualizarDoFirebase();
        return cacheMemoria;
      }
    } catch (_) {}
    try {
      const snapshot = await getDocs(collection(db, 'produtos'));
      cacheMemoria = ordenarProdutosMonetizados(snapshot.docs.map(normalizarProduto));
      salvarCache(cacheMemoria);
      return cacheMemoria;
    } catch (error) {
      console.warn('Falha ao buscar catálogo no Firebase:', error);
      // Fallback local: a loja continua a apresentar o catálogo-base mesmo
      // quando o Firebase está temporariamente indisponível.
      try {
        const resposta = await fetch('produtos.json', { cache: 'no-store' });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const locais = await resposta.json();
        if (Array.isArray(locais) && locais.length) {
          cacheMemoria = ordenarProdutosMonetizados(locais.map(p => ({ ...p, id: String(p.id) })));
          salvarCache(cacheMemoria);
          return cacheMemoria;
        }
      } catch (fallbackError) {
        console.warn('Fallback local do catálogo também falhou:', fallbackError);
      }
      return [];
    }
  })();
  return catalogoPromise;
}

function salvarCache(produtos) {
  localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data: produtos, timestamp: Date.now() }));
}

async function atualizarDoFirebase() {
  try {
    const snapshot = await getDocs(collection(db, 'produtos'));
    cacheMemoria = ordenarProdutosMonetizados(snapshot.docs.map(normalizarProduto));
    salvarCache(cacheMemoria);
    window.dispatchEvent(new CustomEvent('vora313:catalogo-atualizado', { detail: { total: cacheMemoria.length } }));
  } catch (_) {}
}

function elemento(tag, texto, classe = '') {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

function imagemProduto(src, alt, classe = '') {
  const image = document.createElement('img');
  image.src = urlSegura(src, IMAGEM_FALLBACK);
  image.alt = String(alt || '');
  image.loading = 'lazy';
  image.decoding = 'async';
  if (classe) image.className = classe;
  image.addEventListener('error', () => { image.src = IMAGEM_FALLBACK; }, { once: true });
  return image;
}

export function criarCardProduto(produto) {
  const prod = { ...produto, id: String(produto.id || '') };
  if (prod.ativo === false) return null;
  const card = document.createElement('article');
  card.className = 'produto-card';
  card.dataset.produtoId = prod.id;

  const link = document.createElement('a');
  link.className = 'produto-card-link';
  link.href = `detalhe.html?id=${encodeURIComponent(prod.id)}`;
  link.setAttribute('aria-label', `Ver ${prod.nome || 'produto'}`);

  const imagemContainer = elemento('div', null, 'produto-imagem');
  const imagem = imagemProduto(prod.imagens?.[0], prod.nome);
  imagem.loading = 'lazy';
  imagemContainer.append(imagem);

  const selo = prod.desconto ? elemento('span', String(prod.desconto).replace(/\s*OFF/i, '') + ' OFF', 'produto-selo-desconto') : null;
  if (selo) imagemContainer.append(selo);
  link.append(imagemContainer);

  const info = elemento('div', null, 'produto-info');
  const destaqueFim = prod?.monetizacao?.destaqueFim;
  const dataDestaque = destaqueFim?.toDate ? destaqueFim.toDate() : new Date(destaqueFim || '');
  const destaqueAtivo = prod?.monetizacao?.destaque === true && (!destaqueFim || Number.isNaN(dataDestaque.getTime()) || dataDestaque.getTime() > Date.now());
  if (destaqueAtivo) info.append(elemento('span', '⭐ Patrocinado', 'produto-selo-patrocinado'));
  if (prod.vendedorNome) info.append(elemento('span', `🏪 ${prod.vendedorNome}`, 'produto-vendedor-tag'));
  const tagTexto = prod.tag || prod.categoria || '';
  if (tagTexto) info.append(elemento('span', tagTexto, 'categoria-tag'));
  info.append(elemento('h3', prod.nome || 'Produto'));

  const avaliacao = elemento('div', '', 'avaliacao-card');
  avaliacao.dataset.produtoId = prod.id;
  avaliacao.setAttribute('aria-label', 'Avaliação do produto');
  info.append(avaliacao);

  const precoLinha = elemento('div', null, 'produto-preco-linha');
  const preco = elemento('span', prod.preco || '', 'preco');
  precoLinha.append(preco);
  if (prod.precoAntigo) precoLinha.append(elemento('span', prod.precoAntigo, 'preco-antigo-card'));
  info.append(precoLinha);
  if (prod.parcelas) info.append(elemento('p', prod.parcelas, 'parcelas'));
  if (prod.freteGratis) info.append(elemento('span', '🚚 Frete grátis', 'selo-frete'));

  const estoque = Number(prod.estoque);
  if (Number.isFinite(estoque)) {
    const aviso = elemento('span', '', 'estoque-card');
    if (estoque <= 0) { aviso.textContent = 'Esgotado'; aviso.classList.add('esgotado'); }
    else if (estoque <= 5) { aviso.textContent = `🔥 Últimas ${estoque}`; aviso.classList.add('urgente'); }
    else aviso.textContent = '✓ Em estoque';
    info.append(aviso);
  }
  link.append(info);
  card.append(link);

  const favorito = elemento('button', verificarFavorito(prod.id) ? '♥' : '♡', `btn-favorito${verificarFavorito(prod.id) ? ' ativo' : ''}`);
  favorito.type = 'button';
  favorito.dataset.produtoId = prod.id;
  favorito.setAttribute('aria-label', 'Adicionar aos favoritos');
  card.append(favorito);

  const acoes = elemento('div', null, 'acoes-produto');
  const adicionar = elemento('button', '🛒 Adicionar ao carrinho', 'btn-add-carrinho-card');
  adicionar.type = 'button';
  adicionar.dataset.produtoId = prod.id;
  adicionar.setAttribute('aria-label', `Adicionar ${prod.nome || 'produto'} ao carrinho`);
  const partilhar = elemento('button', '↗', 'btn-share');
  partilhar.type = 'button';
  partilhar.dataset.nome = String(prod.nome || 'Produto');
  partilhar.dataset.preco = String(prod.preco || '');
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  partilhar.dataset.link = obterLinkAfiliado(`${baseUrl}/detalhe.html?id=${encodeURIComponent(prod.id)}`);
  partilhar.title = 'Partilhar produto';
  partilhar.setAttribute('aria-label', 'Partilhar produto');
  acoes.append(adicionar, partilhar);
  card.append(acoes);

  obterAvaliacao(prod.id).then((dados) => {
    if (dados.media > 0) avaliacao.textContent = `★ ${dados.media.toFixed(1)} · ${dados.total}`;
    else avaliacao.textContent = '☆ Ainda sem avaliações';
  }).catch(() => { avaliacao.textContent = '☆ Ainda sem avaliações'; });

  return card;
}

export function filtrarEOrdenar(produtos, categoria, busca, min, max, ordenacao, minAvaliacao = 0, dataFiltro = '') {
  const termo = String(busca || '').toLocaleLowerCase();
  let filtrados = produtos.filter((prod) => {
    const nome = String(prod.nome || '').toLocaleLowerCase();
    const tag = String(prod.tag || '').toLocaleLowerCase();
    const categoriaProd = String(prod.categoria || '').toLocaleLowerCase();
    const matchCategoria = categoria === 'todos' || prod.categoria === categoria;
    const matchBusca = !termo || nome.includes(termo) || tag.includes(termo) || categoriaProd.includes(termo);
    const preco = extrairValorNumerico(String(prod.preco || ''));
    let matchData = true;
    if (dataFiltro && prod.criadoEm) {
      const data = new Date(prod.criadoEm.seconds ? prod.criadoEm.seconds * 1000 : prod.criadoEm);
      const dias = Number.parseInt(dataFiltro, 10);
      if (!Number.isNaN(dias) && !Number.isNaN(data.getTime())) matchData = Date.now() - data.getTime() <= dias * 86400000;
    }
    return matchCategoria && matchBusca && preco >= min && preco <= max && matchData;
  });
  // A média é carregada assincronamente; não fingir que este filtro funciona.
  if (minAvaliacao > 0) console.warn('O filtro de avaliação exige um campo agregado no produto.');
  const porData = (value) => value?.seconds ? value.seconds : new Date(value || 0).getTime() || 0;
  switch (ordenacao) {
    case 'preco-asc': filtrados.sort((a, b) => extrairValorNumerico(a.preco) - extrairValorNumerico(b.preco)); break;
    case 'preco-desc': filtrados.sort((a, b) => extrairValorNumerico(b.preco) - extrairValorNumerico(a.preco)); break;
    case 'nome': filtrados.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''))); break;
    case 'data': filtrados.sort((a, b) => porData(b.criadoEm) - porData(a.criadoEm)); break;
    default: filtrados.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  }
  return filtrados;
}

export async function renderizarGrade(produtosFiltrados, container, pagina = 1, itensPorPagina = 10) {
  if (!container) return;
  const produtos = produtosFiltrados.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina);
  if (pagina === 1) container.replaceChildren();
  if (!produtos.length && pagina === 1) {
    const aviso = elemento('p', 'Nenhum produto encontrado.');
    aviso.style.cssText = 'grid-column:1/-1;text-align:center;padding:60px 20px;color:#999;font-size:16px;';
    container.append(aviso);
    return;
  }
  const fragment = document.createDocumentFragment();
  produtos.forEach((prod) => { const card = criarCardProduto(prod); if (card) fragment.append(card); });
  container.append(fragment);
}
