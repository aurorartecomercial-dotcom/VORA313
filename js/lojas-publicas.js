import { imagemProdutoSegura, urlSegura, IMAGEM_FALLBACK, escapeHTML } from './utils.js';

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

export function agruparLojas(produtos = [], perfis = []) {
  const mapa = new Map();
  const perfisMap = perfisPorId(perfis);

  for (const perfil of perfis || []) {
    const id = String(perfil?.id || '');
    if (!id) continue;
    const nome = String(perfil.nomeLoja || perfil.nome_loja || 'Loja VORA 313').trim();
    mapa.set(id, {
      id,
      nome,
      categoria: String(perfil.categoria || 'Loja parceira'),
      logoUrl: urlSegura(perfil?.perfilPublico?.logoUrl, ''),
      capaUrl: urlSegura(perfil?.perfilPublico?.capaUrl, ''),
      produtos: [],
      totalProdutos: Number(perfil.totalProdutos ?? perfil.total_produtos ?? 0),
      destaque: false
    });
  }

  for (const produto of produtos || []) {
    const id = String(produto?.vendedorId || produto?.vendedor_id || '');
    if (!id || produto?.ativo === false || produto?.vendedorAtivo === false || (produto?.statusAprovacao && produto.statusAprovacao !== 'aprovado')) continue;
    const perfil = perfisMap.get(id) || {};
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        nome: String(perfil.nomeLoja || perfil.nome_loja || produto.vendedorNome || 'Loja VORA 313').trim(),
        categoria: String(perfil.categoria || produto.categoria || 'Loja parceira'),
        logoUrl: urlSegura(perfil?.perfilPublico?.logoUrl, ''),
        capaUrl: urlSegura(perfil?.perfilPublico?.capaUrl, ''),
        produtos: [],
        totalProdutos: Number(perfil.totalProdutos ?? perfil.total_produtos ?? 0),
        destaque: false
      });
    }
    const loja = mapa.get(id);
    loja.produtos.push(produto);
    if (!loja.totalProdutos) loja.totalProdutos = loja.produtos.length;
    if (destaqueAtivo(produto)) loja.destaque = true;
  }

  return [...mapa.values()].sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    return (b.totalProdutos - a.totalProdutos) || a.nome.localeCompare(b.nome, 'pt-AO');
  });
}

function imagemLoja(loja) {
  return loja.capaUrl || imagemProdutoSegura(loja.produtos.find((produto) => produto?.imagens?.[0])?.imagens?.[0], IMAGEM_FALLBACK);
}

// "dados" aceita também uma lista simples para não quebrar qualquer chamada
// antiga. A página principal envia produtos + perfis públicos.
export function renderizarLojas(container, dados, limite = 8) {
  if (!container) return;
  const entrada = Array.isArray(dados) ? { produtos: dados, perfis: [] } : (dados || {});
  const todasLojas = agruparLojas(entrada.produtos || [], entrada.perfis || []).slice(0, 24);
  const lojas = todasLojas.slice(0, limite);
  if (!lojas.length) {
    container.innerHTML = `<div class="lojas-empty"><strong>🏪 As lojas dos vendedores aparecerão aqui</strong><span>Quando os primeiros vendedores publicarem produtos aprovados, as suas lojas serão apresentadas nesta área.</span></div>`;
    return { exibidas: 0, total: 0 };
  }
  container.innerHTML = lojas.map((loja) => {
    const nome = escapeHTML(loja.nome);
    const id = encodeURIComponent(loja.id);
    const total = Number(loja.totalProdutos || loja.produtos.length || 0);
    const capa = escapeHTML(imagemLoja(loja));
    const logo = urlSegura(loja.logoUrl, '');
    const avatar = logo
      ? `<img src="${escapeHTML(logo)}" alt="Logótipo de ${nome}" loading="lazy" decoding="async">`
      : `<span aria-hidden="true">${escapeHTML(iniciais(loja.nome))}</span>`;
    const destaque = loja.destaque ? '<span class="loja-mini-selo">⭐ Em destaque</span>' : '';
    return `<article class="loja-card-publica">
      <a href="loja.html?vendedor=${id}" aria-label="Visitar ${nome}">
        <div class="loja-card-capa"><img src="${capa}" alt="Capa da loja ${nome}" loading="lazy" decoding="async"><div class="loja-card-avatar">${avatar}</div></div>
        <div class="loja-card-info">
          ${destaque}
          <h3>${nome}</h3>
          <p>${escapeHTML(loja.categoria)} · ${total} ${total === 1 ? 'produto' : 'produtos'}</p>
          <span class="loja-card-link">Visitar loja →</span>
        </div>
      </a>
      <button type="button" class="btn-favorito-loja loja-card-favorito" data-vendedor-id="${id}" aria-pressed="false">♡ Favoritar</button>
    </article>`;
  }).join('');
  return { exibidas: lojas.length, total: todasLojas.length };
}

export async function carregarLojasPublicas() {
  const { data, error } = await (await import('./config.js')).supabase
    .from('lojas_publicas')
    .select('id,nome_loja,categoria,perfil_publico,total_produtos,criado_em')
    .order('nome_loja', { ascending: true });
  if (error) {
    console.warn('Não foi possível carregar as lojas públicas:', error);
    return { produtos: [], perfis: [] };
  }
  const perfis = (data || []).map((perfil) => ({
    id: perfil.id,
    nomeLoja: perfil.nome_loja,
    categoria: perfil.categoria,
    totalProdutos: Number(perfil.total_produtos || 0),
    criadoEm: perfil.criado_em,
    perfilPublico: perfil.perfil_publico || {}
  }));
  return { produtos: [], perfis };
}
