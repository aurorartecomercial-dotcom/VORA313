import { carregarCatalogo, criarCardProduto } from './catalogo.js?v=3';
import { CATEGORIAS_VORA } from './categorias-vora.js';
import { auth } from './config.js';
import { extrairValorNumerico, escapeHTML } from './utils.js';

const LIMITE_PRODUTOS_HOME = 8;

function produtoValido(produto) {
  return produto?.ativo !== false
    && produto?.vendedorAtivo !== false
    && (!produto?.statusAprovacao || produto.statusAprovacao === 'aprovado');
}

function dataProduto(produto) {
  const valor = produto?.criadoEm || produto?.criado_em || produto?.createdAt || produto?.created_at;
  if (!valor) return 0;
  const data = valor?.toDate ? valor.toDate() : new Date(valor);
  const tempo = data.getTime();
  return Number.isFinite(tempo) ? tempo : 0;
}

function correspondeCategoria(produto, categoria) {
  const valor = String(produto?.categoria || '').trim().toLowerCase();
  if (!valor) return false;
  const valores = [categoria.id, categoria.sellerValue, ...(categoria.legacy || [])].map((item) => String(item).toLowerCase());
  if (valores.includes(valor)) return true;
  return (categoria.subcategorias || []).some(([id, label]) => [id, label].map((item) => String(item).toLowerCase()).includes(valor));
}

function estado(container, mensagem, tipo = 'normal') {
  if (!container) return;
  container.innerHTML = `<div class="vora-home-state ${tipo}">${escapeHTML(mensagem)}</div>`;
}

function renderizarCards(container, produtos, vazio) {
  if (!container) return;
  container.innerHTML = '';
  if (!produtos.length) {
    estado(container, vazio);
    return;
  }
  const fragment = document.createDocumentFragment();
  produtos.slice(0, LIMITE_PRODUTOS_HOME).forEach((produto) => {
    const card = criarCardProduto(produto);
    if (card) fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

function renderizarCategorias(produtos) {
  const container = document.getElementById('categoriasHomeGrid');
  if (!container) return;
  const categorias = CATEGORIAS_VORA
    .map((categoria) => ({ ...categoria, total: produtos.filter((produto) => correspondeCategoria(produto, categoria)).length }))
    .filter((categoria) => categoria.total > 0)
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-AO'));

  if (!categorias.length) {
    estado(container, 'As categorias aparecerão quando houver produtos publicados.');
    return;
  }
  container.innerHTML = categorias.map((categoria) => `
    <a class="vora-home-category-card" href="categoria.html?cat=${encodeURIComponent(categoria.legacy?.[0] || categoria.id)}" aria-label="Ver ${escapeHTML(categoria.label)}">
      <span class="vora-home-category-icon" aria-hidden="true">${categoria.icon}</span>
      <strong>${escapeHTML(categoria.label)}</strong>
      <small>${categoria.total} ${categoria.total === 1 ? 'produto publicado' : 'produtos publicados'}</small>
    </a>`).join('');
}

function renderizarNovos(produtos) {
  const recentes = [...produtos]
    .filter(produtoValido)
    .filter((produto) => dataProduto(produto) > 0)
    .sort((a, b) => dataProduto(b) - dataProduto(a));
  renderizarCards(document.getElementById('novosProdutosGrid'), recentes, 'Ainda não existem produtos com data de publicação disponível.');
}

function temDescontoReal(produto) {
  const atual = extrairValorNumerico(produto?.preco);
  const antigo = extrairValorNumerico(produto?.precoAntigo || produto?.preco_antigo);
  const desconto = String(produto?.desconto || '').trim();
  return atual > 0 && ((antigo > atual) || /\d/.test(desconto));
}

function renderizarOfertas(produtos) {
  const ofertas = produtos.filter(produtoValido).filter(temDescontoReal);
  const section = document.querySelector('[aria-labelledby="tituloOfertasReais"]');
  if (!ofertas.length) {
    section?.remove();
    return;
  }
  renderizarCards(document.getElementById('ofertasReaisGrid'), ofertas, 'Não existem ofertas publicadas neste momento.');
}

function ligarPesquisaHero() {
  const form = document.getElementById('heroBuscaForm');
  const hero = document.getElementById('heroCampoBusca');
  const principal = document.getElementById('campoBusca');
  if (!form || !hero || !principal) return;
  const sincronizar = () => {
    principal.value = hero.value;
    principal.dispatchEvent(new Event('input', { bubbles: true }));
  };
  hero.addEventListener('input', sincronizar);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sincronizar();
    document.getElementById('gradeProdutos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    principal.focus({ preventScroll: true });
  });
}

function atualizarCtaAutenticacao(user) {
  const cta = document.getElementById('homeSellerCta');
  if (!cta) return;
  cta.textContent = user ? '🏪 Abrir área de vendedor' : '🏪 Quero vender na VORA';
}

async function iniciarHomepage() {
  ligarPesquisaHero();
  atualizarCtaAutenticacao(auth.currentUser);
  auth._listeners.add(atualizarCtaAutenticacao);
  try {
    const produtos = await carregarCatalogo({ limite: 50, ordenacao: 'mais-recentes' });
    renderizarCategorias(produtos);
    renderizarNovos(produtos);
    renderizarOfertas(produtos);
  } catch (error) {
    console.error('[VORA 313] Falha nas secções da homepage:', error);
    estado(document.getElementById('categoriasHomeGrid'), 'Não foi possível carregar as categorias agora.', 'erro');
    estado(document.getElementById('novosProdutosGrid'), 'Não foi possível carregar as novidades agora.', 'erro');
    document.querySelector('[aria-labelledby="tituloOfertasReais"]')?.remove();
  }
}

document.addEventListener('DOMContentLoaded', iniciarHomepage, { once: true });
