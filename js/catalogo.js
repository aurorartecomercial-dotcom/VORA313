import { supabase } from './config.js';
import { extrairValorNumerico, IMAGEM_FALLBACK, imagemProdutoSegura } from './utils.js';
import { obterAvaliacao } from './avaliacoes.js';
import { verificarFavorito } from './favoritos.js';
import { obterLinkAfiliado } from './fase3.js';


function produtoPublico(produto) {
  return produto?.ativo !== false && produto?.vendedorAtivo !== false && (!produto?.statusAprovacao || produto.statusAprovacao === 'aprovado');
}

const pesquisaCache = new Map();
const pesquisaEmCurso = new Map();

function mapearProdutoSupabase(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    ordem: Number(row.ordem || 999999),
    nome: row.nome || '',
    categoria: row.categoria || '',
    preco: row.preco || '',
    precoValor: row.preco_valor,
    precoAntigo: row.preco_antigo || '',
    desconto: row.desconto || '',
    parcelas: row.parcelas || '',
    freteGratis: row.frete_gratis === true,
    descricao: row.descricao || '',
    imagens: Array.isArray(row.imagens) ? row.imagens : [],
    marca: row.marca || '',
    sku: row.sku || '',
    tag: row.tag || '',
    estoque: Number(row.estoque || 0),
    vendedorId: row.vendedor_id || '',
    vendedorNome: row.vendedor_nome || '',
    vendedorAtivo: true,
    ativo: true,
    statusAprovacao: 'aprovado',
    monetizacao: row.monetizacao || {},
    criadoEm: row.criado_em || null,
    atualizadoEm: row.atualizado_em || null,
    avaliacaoMedia: Number(row.avaliacao_media || 0),
    avaliacaoTotal: Number(row.avaliacao_total || 0),
    resumoAvaliacoesCarregado: true
  };
}

function chavePesquisa(opcoes = {}) {
  return JSON.stringify({
    busca: String(opcoes.busca || '').trim().toLocaleLowerCase(),
    categoria: String(opcoes.categoria || '').trim(),
    precoMin: opcoes.precoMin ?? null,
    precoMax: opcoes.precoMax ?? null,
    vendedorId: opcoes.vendedorId || null,
    disponibilidade: opcoes.disponibilidade || 'todos',
    minAvaliacao: Number(opcoes.minAvaliacao || 0),
    dataDias: Number(opcoes.dataDias || 0),
    ordenacao: opcoes.ordenacao || 'relevancia',
    limite: Math.min(Math.max(Number(opcoes.limite || 20), 1), 50),
    offset: Math.max(Number(opcoes.offset || 0), 0)
  });
}

export async function buscarCatalogo(opcoes = {}) {
  const chave = chavePesquisa(opcoes);
  if (pesquisaCache.has(chave)) return pesquisaCache.get(chave);
  if (pesquisaEmCurso.has(chave)) return pesquisaEmCurso.get(chave);

  const entrada = JSON.parse(chave);
  const promise = (async () => {
    const { data, error } = await supabase.rpc('buscar_catalogo_publico', {
      p_busca: entrada.busca,
      p_categoria: entrada.categoria === 'todos' ? '' : entrada.categoria,
      p_preco_min: Number.isFinite(Number(entrada.precoMin)) ? Number(entrada.precoMin) : null,
      p_preco_max: Number.isFinite(Number(entrada.precoMax)) ? Number(entrada.precoMax) : null,
      p_vendedor_id: entrada.vendedorId || null,
      p_disponibilidade: entrada.disponibilidade,
      p_min_avaliacao: entrada.minAvaliacao,
      p_data_dias: entrada.dataDias,
      p_ordenacao: entrada.ordenacao,
      p_limite: entrada.limite,
      p_offset: entrada.offset
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const produtos = rows.map(mapearProdutoSupabase).filter(Boolean);
    const total = Number(rows[0]?.total_resultados || 0);
    const resultado = { produtos, total, offset: entrada.offset, limite: entrada.limite };
    pesquisaCache.set(chave, resultado);
    return resultado;
  })();
  pesquisaEmCurso.set(chave, promise);
  try { return await promise; }
  finally { pesquisaEmCurso.delete(chave); }
}

export async function obterProdutoPublico(id) {
  const produtoId = String(id || '').trim();
  if (!produtoId) return null;
  const { data, error } = await supabase
    .from('produtos')
    .select('id,ordem,nome,categoria,preco,preco_valor,preco_antigo,desconto,parcelas,frete_gratis,descricao,imagens,marca,sku,tag,estoque,vendedor_id,vendedor_nome,monetizacao,criado_em,atualizado_em')
    .eq('id', produtoId)
    .eq('ativo', true)
    .eq('vendedor_ativo', true)
    .eq('status_aprovacao', 'aprovado')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: resumo, error: erroResumo } = await supabase
    .from('produto_avaliacoes_resumo')
    .select('media,total')
    .eq('produto_id', produtoId)
    .maybeSingle();
  if (erroResumo) console.warn('Resumo de avaliação indisponível:', erroResumo);
  return mapearProdutoSupabase({ ...data, avaliacao_media: resumo?.media || 0, avaliacao_total: resumo?.total || 0 });
}

export async function obterVendedoresPublicos() {
  const { data, error } = await supabase
    .from('lojas_publicas')
    .select('id,nome_loja,categoria')
    .order('nome_loja', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function carregarCatalogo(opcoes = {}) {
  // Compatibilidade com páginas antigas: nunca mais descarrega o catálogo
  // inteiro. Quem precisa de pesquisa/filtros deve usar buscarCatalogo().
  const limite = Math.min(Math.max(Number(opcoes?.limite || 50), 1), 50);
  const resultado = await buscarCatalogo({
    busca: opcoes?.busca || '',
    categoria: opcoes?.categoria || '',
    precoMin: opcoes?.precoMin ?? null,
    precoMax: opcoes?.precoMax ?? null,
    vendedorId: opcoes?.vendedorId || null,
    disponibilidade: opcoes?.disponibilidade || 'todos',
    minAvaliacao: Number(opcoes?.minAvaliacao || 0),
    dataDias: Number(opcoes?.dataDias || 0),
    ordenacao: opcoes?.ordenacao || 'relevancia',
    limite,
    offset: Number(opcoes?.offset || 0)
  });
  return resultado.produtos;
}

function elemento(tag, texto, classe = '') {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

function imagemProduto(src, alt, classe = '') {
  const image = document.createElement('img');
  image.src = imagemProdutoSegura(src, IMAGEM_FALLBACK);
  image.alt = String(alt || '');
  image.loading = 'lazy';
  image.decoding = 'async';
  if (classe) image.className = classe;
  image.addEventListener('error', () => { image.src = IMAGEM_FALLBACK; }, { once: true });
  return image;
}

export function criarCardProduto(produto) {
  const prod = { ...produto, id: String(produto.id || '') };
  if (!produtoPublico(prod)) return null;
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
  favorito.setAttribute('aria-label', verificarFavorito(prod.id) ? 'Remover produto dos favoritos' : 'Adicionar produto aos favoritos');
  favorito.setAttribute('aria-pressed', verificarFavorito(prod.id) ? 'true' : 'false');
  favorito.title = verificarFavorito(prod.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
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

  if (prod.resumoAvaliacoesCarregado) {
    avaliacao.textContent = prod.avaliacaoMedia > 0
      ? `★ ${prod.avaliacaoMedia.toFixed(1)} · ${prod.avaliacaoTotal}`
      : '☆ Ainda sem avaliações';
  } else {
    obterAvaliacao(prod.id).then((dados) => {
      if (dados.media > 0) avaliacao.textContent = `★ ${dados.media.toFixed(1)} · ${dados.total}`;
      else avaliacao.textContent = '☆ Ainda sem avaliações';
    }).catch(() => { avaliacao.textContent = '☆ Ainda sem avaliações'; });
  }

  return card;
}

export function filtrarEOrdenar(produtos, categoria, busca, min, max, ordenacao, minAvaliacao = 0, dataFiltro = '') {
  const termo = String(busca || '').toLocaleLowerCase();
  let filtrados = produtos.filter((prod) => {
    // A paginação tem de contar exatamente os mesmos anúncios que podem virar
    // cartões públicos. Sem isto, produtos pendentes/inativos ocupavam uma
    // página invisível e o botão "Carregar mais" parecia não fazer nada.
    if (!produtoPublico(prod)) return false;
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
    const avaliacao = Number(prod.avaliacaoMedia || 0);
    const matchAvaliacao = minAvaliacao <= 0 || avaliacao >= minAvaliacao;
    return matchCategoria && matchBusca && preco >= min && preco <= max && matchData && matchAvaliacao;
  });
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
