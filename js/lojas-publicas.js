import { db } from './config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { urlSegura, IMAGEM_FALLBACK, escapeHTML } from './utils.js';

function destaqueAtivo(produto) {
  if (produto?.monetizacao?.destaque !== true) return false;
  const fim = produto?.monetizacao?.destaqueFim;
  if (!fim) return true;
  const data = fim?.toDate ? fim.toDate() : new Date(fim);
  return Number.isNaN(data.getTime()) || data.getTime() > Date.now();
}

export function agruparLojas(produtos) {
  const mapa = new Map();
  for (const produto of produtos || []) {
    const id = produto?.vendedorId;
    if (!id || produto?.ativo === false || produto?.vendedorAtivo === false) continue;
    const nome = String(produto.vendedorNome || 'Loja VORA 313').trim();
    if (!mapa.has(id)) mapa.set(id, { id: String(id), nome, produtos: [], destaque: false });
    const loja = mapa.get(id);
    loja.produtos.push(produto);
    if (destaqueAtivo(produto)) loja.destaque = true;
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    return b.produtos.length - a.produtos.length;
  });
}

function imagemLoja(produtos) {
  const primeiro = produtos.find(p => p?.imagens?.[0]);
  return urlSegura(primeiro?.imagens?.[0], IMAGEM_FALLBACK);
}

export function renderizarLojas(container, produtos, limite = 8) {
  if (!container) return;
  const lojas = agruparLojas(produtos).slice(0, limite);
  if (!lojas.length) {
    container.innerHTML = `<div class="lojas-empty"><strong>🏪 As lojas dos vendedores aparecerão aqui</strong><span>Quando os primeiros vendedores publicarem produtos aprovados, as suas lojas serão apresentadas nesta área.</span></div>`;
    return;
  }
  container.innerHTML = lojas.map(loja => {
    const nome = escapeHTML(loja.nome);
    const id = encodeURIComponent(loja.id);
    const total = loja.produtos.length;
    const img = imagemLoja(loja.produtos);
    const destaque = loja.destaque ? '<span class="loja-mini-selo">⭐ Em destaque</span>' : '';
    return `<article class="loja-card-publica">
      <a href="loja.html?id=${id}" aria-label="Visitar ${nome}">
        <div class="loja-card-capa"><img src="${img}" alt="Produtos da ${nome}" loading="lazy" decoding="async"><div class="loja-card-avatar">🏪</div></div>
        <div class="loja-card-info">
          ${destaque}
          <h3>${nome}</h3>
          <p>${total} ${total === 1 ? 'produto publicado' : 'produtos publicados'}</p>
          <span class="loja-card-link">Visitar loja →</span>
        </div>
      </a>
    </article>`;
  }).join('');
}

export async function carregarLojasPublicas() {
  try {
    const snapshot = await getDocs(collection(db, 'produtos'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(p => p?.ativo !== false && p?.vendedorAtivo !== false && p?.vendedorId);
  } catch (error) {
    console.warn('Não foi possível carregar lojas públicas:', error);
    return [];
  }
}
