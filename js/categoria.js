import { buscarCatalogo, criarCardProduto } from './catalogo.js?v=7-preco-sem-limite';
import { encontrarCategoria } from './categorias-vora.js';
import { initMobileMenu } from './menu.js';

function normalizar(valor) {
  return String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

// Produtos legados podem estar guardados como "Games", "games" ou
// "Consolas". Todos pertencem à mesma família de navegação sem alterar os
// dados já existentes no banco.
function valoresDaCategoria(categoriaSolicitada) {
  const categoria = encontrarCategoria(categoriaSolicitada);
  if (!categoria) return new Set([normalizar(categoriaSolicitada)]);
  const solicitada = normalizar(categoriaSolicitada);
  const valoresPrincipais = [categoria.id, categoria.label, categoria.sellerValue, ...(categoria.legacy || [])];
  const subcategoria = (categoria.subcategorias || []).find(([id, label]) => (
    normalizar(id) === solicitada || normalizar(label) === solicitada
  ));

  // Um link para a categoria mãe (por exemplo, Games) agrega a família toda.
  // Um link de subcategoria, como Consolas, preserva o recorte específico.
  if (!valoresPrincipais.some((valor) => normalizar(valor) === solicitada) && subcategoria) {
    return new Set(subcategoria.map(normalizar));
  }
  return new Set([
    ...valoresPrincipais,
    ...(categoria.subcategorias || []).flat()
  ].map(normalizar));
}

function pertenceACategoria(produto, valores) {
  return valores.has(normalizar(produto?.categoria));
}

document.addEventListener('DOMContentLoaded', async () => {
  initMobileMenu();

  const params = new URLSearchParams(window.location.search);
  const categoria = String(params.get('cat') || '').trim();
  const vazio = document.getElementById('nenhumProduto');
  const carregando = document.getElementById('carregandoCategoria');

  if (!categoria) {
    vazio.style.display = 'block';
    vazio.textContent = 'Nenhuma categoria foi selecionada.';
    carregando.style.display = 'none';
    return;
  }

  const nomeCategoria = categoria.charAt(0).toUpperCase() + categoria.slice(1);
  document.getElementById('breadcrumbCat').textContent = nomeCategoria;
  document.getElementById('tituloCategoria').textContent = `📦 ${nomeCategoria}`;
  document.getElementById('paginaTitulo').textContent = `${nomeCategoria} - VORA 313`;

  let catalogo = [];
  try {
    // Carrega o catálogo público unificado e, só depois, aplica a família da
    // categoria. Evita o erro quando a RPC antiga não reconhece uma categoria
    // nova ou uma variação histórica do nome.
    const resultado = await buscarCatalogo({ ordenacao: 'mais-recentes', limite: 50, offset: 0 });
    catalogo = Array.isArray(resultado?.produtos) ? resultado.produtos : [];
  } catch (error) {
    console.error('Erro ao carregar a categoria:', error);
    carregando.style.display = 'none';
    vazio.style.display = 'block';
    vazio.textContent = 'Não foi possível carregar esta categoria agora. Tente novamente.';
    return;
  }

  carregando.style.display = 'none';
  const produtosFiltrados = catalogo.filter((produto) => pertenceACategoria(produto, valoresDaCategoria(categoria)));

  if (!produtosFiltrados.length) {
    vazio.style.display = 'block';
    vazio.textContent = 'Ainda não existem produtos publicados nesta categoria.';
    return;
  }

  const grid = document.getElementById('gradeCategoria');
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  produtosFiltrados.forEach((produto) => {
    const card = criarCardProduto(produto);
    if (card) fragment.append(card);
  });
  grid.append(fragment);
});
