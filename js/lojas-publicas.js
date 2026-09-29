import { db } from './config.js';
import { collection, getDocs } from './supabase-compat.js';
import { urlSegura, IMAGEM_FALLBACK, escapeHTML } from './utils.js';

function destaqueAtivo(produto) {
  if (produto?.monetizacao?.destaque !== true) return false;
  const fim = produto?.monetizacao?.destaqueFim;
  if (!fim) return true;
  const data = fim?.toDate ? fim.toDate() : new Date(fim);
  return Number.isNaN(data.getTime()) || data.getTime() > Date.now();
}

function iniciais(nome) {
  const partes = String(nome || 'Loja').trim().split(/\s+/).filter(Boolean);
  return (partes.slice(0, 2).map((parte) => parte[0]).join('') || 'LO').toUpperCase();
}

function perfisPorId(perfis) {
  return new Map((perfis || []).map((perfil) => [String(perfil?.id || ''), perfil]));
}

export function agruparLojas(produtos, perfis = []) {
  const mapa = new Map();
  const perfisMap = perfisPorId(perfis);
  for (const produto of produtos || []) {
    const id = String(produto?.vendedorId || '');
    if (!id || produto?.ativo === false || produto?.vendedorAtivo === false || (produto?.statusAprovacao && produto.statusAprovacao !== 'aprovado')) continue;
    const perfil = perfisMap.get(id) || {};
    const nome = String(perfil.nomeLoja || produto.vendedorNome || 'Loja VORA 313').trim();
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        nome,
        categoria: String(perfil.categoria || produto.categoria || 'Loja parceira'),
        logoUrl: urlSegura(perfil?.perfilPublico?.logoUrl, ''),
        capaUrl: urlSegura(perfil?.perfilPublico?.capaUrl, ''),
        produtos: [],
        destaque: false
      });
    }
    const loja = mapa.get(id);
    loja.produtos.push(produto);
    if (destaqueAtivo(produto)) loja.destaque = true;
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    return b.produtos.length - a.produtos.length || a.nome.localeCompare(b.nome, 'pt-AO');
  });
}

function imagemLoja(loja) {
  return loja.capaUrl || urlSegura(loja.produtos.find((produto) => produto?.imagens?.[0])?.imagens?.[0], IMAGEM_FALLBACK);
}

// "dados" aceita também uma lista simples para não quebrar qualquer chamada
// antiga. A página principal envia produtos + perfis públicos.
export function renderizarLojas(container, dados, limite = 24) {
  if (!container) return;
  const entrada = Array.isArray(dados) ? { produtos: dados, perfis: [] } : (dados || {});
  const lojas = agruparLojas(entrada.produtos || [], entrada.perfis || []).slice(0, limite);
  if (!lojas.length) {
    container.innerHTML = `<div class="lojas-empty"><strong>🏪 As lojas dos vendedores aparecerão aqui</strong><span>Quando os primeiros vendedores publicarem produtos aprovados, as suas lojas serão apresentadas nesta área.</span></div>`;
    return;
  }
  container.innerHTML = lojas.map((loja) => {
    const nome = escapeHTML(loja.nome);
    const id = encodeURIComponent(loja.id);
    const total = loja.produtos.length;
    const capa = escapeHTML(imagemLoja(loja));
    const logo = urlSegura(loja.logoUrl, '');
    const avatar = logo
      ? `<img src="${escapeHTML(logo)}" alt="Logótipo de ${nome}" loading="lazy" decoding="async">`
      : `<span aria-hidden="true">${escapeHTML(iniciais(loja.nome))}</span>`;
    const destaque = loja.destaque ? '<span class="loja-mini-selo">⭐ Em destaque</span>' : '';
    return `<article class="loja-card-publica">
      <a href="loja.html?id=${id}" aria-label="Visitar ${nome}">
        <div class="loja-card-capa"><img src="${capa}" alt="Capa da loja ${nome}" loading="lazy" decoding="async"><div class="loja-card-avatar">${avatar}</div></div>
        <div class="loja-card-info">
          ${destaque}
          <h3>${nome}</h3>
          <p>${escapeHTML(loja.categoria)} · ${total} ${total === 1 ? 'produto' : 'produtos'}</p>
          <span class="loja-card-link">Visitar loja →</span>
        </div>
      </a>
    </article>`;
  }).join('');
}

export async function carregarLojasPublicas() {
  const [resultadoProdutos, resultadoPerfis] = await Promise.allSettled([
    getDocs(collection(db, 'produtos')),
    getDocs(collection(db, 'lojasPublicas'))
  ]);
  const produtos = resultadoProdutos.status === 'fulfilled'
    ? resultadoProdutos.value.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((produto) => produto?.ativo !== false && produto?.vendedorAtivo !== false && (!produto?.statusAprovacao || produto.statusAprovacao === 'aprovado') && produto?.vendedorId)
    : [];
  const perfis = resultadoPerfis.status === 'fulfilled'
    ? resultadoPerfis.value.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    : [];
  if (!produtos.length && resultadoProdutos.status === 'rejected') console.warn('Não foi possível carregar as lojas públicas:', resultadoProdutos.reason);
  if (resultadoPerfis.status === 'rejected') console.warn('Os logótipos das lojas serão carregados quando a view pública estiver disponível.');
  return { produtos, perfis };
}
