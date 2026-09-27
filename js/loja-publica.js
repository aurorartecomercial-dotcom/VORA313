import { db, CONFIG, supabase } from './config.js';
import { collection, doc, getDoc, getDocs, query, where } from './supabase-compat.js';
import { carregarCatalogo, criarCardProduto } from './catalogo.js';
import { escapeHTML, urlSegura } from './utils.js';

const params = new URLSearchParams(location.search);
const vendedorId = params.get('id');
const $ = (id) => document.getElementById(id);
let produtosDaLoja = [];
let avaliacaoDaLoja = { media: 0, total: 0 };
let tentativaExtraAgendada = false;
const PRODUTOS_DEMO = [
  { id: 'demo-1', nome: 'Smartphone VORA X Pro 256GB', preco: '245.000 Kz', categoria: 'Tecnologia', imagens: ['oferta-4-smartphones.png'], estoque: 8, freteGratis: true, vendedorNome: 'Kwanza Tech', ativo: true, monetizacao: { destaque: true } },
  { id: 'demo-2', nome: 'Relógio Smart Premium', preco: '58.500 Kz', categoria: 'Acessórios', imagens: ['oferta-6-semana.png'], estoque: 4, vendedorNome: 'Kwanza Tech', ativo: true, monetizacao: { destaque: true } },
  { id: 'demo-3', nome: 'Fones Bluetooth Pro ANC', preco: '42.900 Kz', categoria: 'Tecnologia', imagens: ['oferta-1-tecnologia.png'], estoque: 12, vendedorNome: 'Kwanza Tech', ativo: true }
];

function produtosDoCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || 'null');
    const lista = Array.isArray(cache?.data) ? cache.data : [];
    return lista.filter((produto) => String(produto?.vendedorId || '') === String(vendedorId || ''));
  } catch (_) {
    return [];
  }
}

function texto(id, valor) {
  const elemento = $(id);
  if (elemento) elemento.textContent = valor || '';
}

function numero(valor) {
  return Number(valor || 0).toLocaleString('pt-AO');
}

function emDestaque(produto) {
  const monetizacao = produto?.monetizacao || {};
  if (monetizacao.destaque !== true && produto?.destaque !== true) return false;
  const fim = monetizacao.destaqueFim;
  return !fim || Number.isNaN(new Date(fim).getTime()) || new Date(fim).getTime() > Date.now();
}

function criarCartaoSeguro(produto) {
  try {
    return criarCardProduto(produto);
  } catch (erro) {
    // Um erro visual de um único cartão nunca deve esconder a loja inteira.
    console.warn('Cartão completo indisponível; a usar cartão simples.', erro);
    const artigo = document.createElement('article');
    artigo.className = 'produto-card loja-cartao-seguro';
    const link = document.createElement('a');
    link.className = 'produto-card-link';
    link.href = 'detalhe.html?id=' + encodeURIComponent(produto?.id || '');
    const imagem = imagemSegura(produto?.imagens?.[0]);
    link.innerHTML = (imagem ? '<div class="produto-imagem"><img src="' + escapeHTML(imagem) + '" alt="" loading="lazy"></div>' : '') + '<div class="produto-info"><span class="categoria-tag">' + escapeHTML(produto?.categoria || 'Produto') + '</span><h3>' + escapeHTML(produto?.nome || 'Produto') + '</h3><div class="produto-preco-linha"><span class="preco">' + escapeHTML(produto?.preco || '') + '</span></div></div>';
    artigo.append(link);
    return artigo;
  }
}

function mostrarLogo(url) {
  const logo = $('lojaLogo');
  if (!logo) return;
  const seguro = urlSegura(url, '');
  logo.hidden = !seguro;
  if (seguro) logo.src = seguro;
  else logo.removeAttribute('src');
}

function aplicarCapa(url) {
  const capa = $('lojaCapa');
  const seguro = urlSegura(url, '');
  if (!capa || !seguro) return;
  const seguroParaCss = seguro.replace(/["\\]/g, '\\$&');
  capa.style.setProperty('--loja-capa', 'url("' + seguroParaCss + '")');
}

function linkInstagram(valor) {
  const original = String(valor || '').trim();
  if (!original) return '';
  if (/^https?:\/\//i.test(original)) return urlSegura(original, '');
  const utilizador = original.replace(/^@/, '').replace(/[^a-z0-9._]/gi, '');
  return utilizador ? 'https://instagram.com/' + utilizador : '';
}

async function carregarAvaliacaoDaLoja() {
  avaliacaoDaLoja = { media: 0, total: 0 };
  const ids = produtosDaLoja.map((produto) => String(produto.id || '')).filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabase
    .from('produto_avaliacoes_resumo')
    .select('produto_id,media,total')
    .in('produto_id', ids);
  if (error) return;
  const resumo = data || [];
  const total = resumo.reduce((soma, item) => soma + Number(item.total || 0), 0);
  const somaNotas = resumo.reduce((soma, item) => soma + Number(item.media || 0) * Number(item.total || 0), 0);
  avaliacaoDaLoja = { media: total ? somaNotas / total : 0, total };
}

function configurarPartilha(nomeLoja, descricao) {
  const acoes = document.querySelector('.loja-acoes');
  if (!acoes || $('btnPartilharLoja')) return;
  const botao = document.createElement('button');
  botao.id = 'btnPartilharLoja';
  botao.type = 'button';
  botao.textContent = '↗ Partilhar loja';
  botao.style.cssText = 'border:0;border-radius:999px;padding:10px 16px;background:#fff;color:#075946;font:inherit;font-weight:800;cursor:pointer';
  botao.addEventListener('click', async () => {
    const dados = { title: nomeLoja, text: descricao, url: location.href };
    try {
      if (navigator.share) { await navigator.share(dados); return; }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(location.href);
        botao.textContent = '✓ Link copiado';
        setTimeout(() => { botao.textContent = '↗ Partilhar loja'; }, 2200);
      }
    } catch (_) {}
  });
  acoes.append(botao);
}

function renderizarProdutos(lista, alvo = 'produtos', textoVazio = 'Esta loja ainda não tem produtos publicados.') {
  const grid = $(alvo);
  if (!grid) return;
  if (!lista.length) {
    grid.innerHTML = '<div class="loja-vazia">' + escapeHTML(textoVazio) + '</div>';
    return;
  }
  // criarCardProduto devolve um HTMLElement, não uma string. Usar append evita
  // que o navegador mostre "[object HTMLElement]" no lugar do produto.
  grid.replaceChildren(...lista.map(criarCartaoSeguro).filter(Boolean));
}

function configurarFiltros() {
  const categorias = [...new Set(produtosDaLoja.map((produto) => produto.categoria).filter(Boolean))];
  const filtros = $('categoriasLoja');
  if (filtros) {
    filtros.innerHTML = '<button class="loja-categoria ativo" data-cat="todos">Todos</button>' + categorias.map((categoria) => '<button class="loja-categoria" data-cat="' + escapeHTML(categoria) + '">' + escapeHTML(categoria) + '</button>').join('');
    filtros.querySelectorAll('button').forEach((botao) => botao.addEventListener('click', () => {
      filtros.querySelectorAll('button').forEach((item) => item.classList.remove('ativo'));
      botao.classList.add('ativo');
      const categoria = botao.dataset.cat;
      renderizarProdutos(categoria === 'todos' ? produtosDaLoja : produtosDaLoja.filter((produto) => produto.categoria === categoria));
    }));
  }

  const busca = $('buscaLoja');
  if (busca) busca.addEventListener('input', () => {
    const termo = busca.value.trim().toLowerCase();
    renderizarProdutos(produtosDaLoja.filter((produto) => (produto.nome || '').toLowerCase().includes(termo)));
  });
}

function preencherPerfil(vendedor, produtos) {
  const perfil = vendedor?.perfilPublico && typeof vendedor.perfilPublico === 'object' ? vendedor.perfilPublico : {};
  const nomeLoja = vendedor?.nomeLoja || 'Loja VORA 313';
  const local = vendedor?.morada || 'Angola';
  const categoria = vendedor?.categoria || 'Loja parceira';
  const horario = perfil.horario || '';
  const destaque = perfil.destaque || '';
  const instagram = linkInstagram(perfil.instagram);
  const telefone = String(vendedor?.telefone || '').replace(/[^0-9+]/g, '');

  texto('nome', nomeLoja);
  texto('desc', vendedor?.descricao || 'Conheça os produtos selecionados desta loja parceira da VORA 313.');
  texto('sobreTexto', vendedor?.descricao || 'Esta loja ainda está a preparar a sua apresentação. Veja abaixo os contactos e informações que o vendedor partilhou.');
  texto('lojaCategoria', categoria);
  texto('lojaLocal', local);
  texto('lojaHorario', horario ? '🕒 ' + horario : '💬 Contacte a loja para saber o horário');
  texto('totalProdutos', String(produtos.length));
  texto('totalDestaques', String(produtos.filter(emDestaque).length));
  texto('totalVendas', numero(vendedor?.totalVendas));
  texto('contadorProdutos', produtos.length + (produtos.length === 1 ? ' produto' : ' produtos'));
  texto('estado', produtos.length + (produtos.length === 1 ? ' produto' : ' produtos'));
  texto('estadoDestaques', produtos.some(emDestaque) ? 'Produtos patrocinados' : 'Escolhas da loja');
  texto('lojaFaixa', destaque || 'Produtos publicados pela loja');
  texto('lojaFaixaIcone', destaque ? '✨' : '🏪');
  mostrarLogo(perfil.logoUrl);
  aplicarCapa(perfil.capaUrl);
  configurarPartilha(nomeLoja, vendedor?.descricao || 'Conheça esta loja na VORA 313.');

  const whatsapp = $('whatsappLoja');
  if (whatsapp) {
    if (telefone) {
      whatsapp.href = 'https://wa.me/' + telefone.replace(/\D/g, '');
      whatsapp.hidden = false;
      whatsapp.style.display = 'inline-flex';
    } else {
      whatsapp.hidden = true;
      whatsapp.style.display = 'none';
    }
  }

  const sobre = $('sobreDetalhes');
  if (sobre) {
    const dados = [
      ['🏷️ Categoria', categoria],
      ['📍 Localização', local],
      horario ? ['🕒 Horário', horario] : null,
      instagram ? ['📷 Instagram', '<a href="' + escapeHTML(instagram) + '" target="_blank" rel="noopener">Abrir perfil</a>'] : null
    ].filter(Boolean);
    sobre.innerHTML = dados.map((item) => '<article class="loja-sobre-dado"><strong>' + escapeHTML(item[0]) + '</strong><span>' + (item[0] === '📷 Instagram' ? item[1] : escapeHTML(item[1])) + '</span></article>').join('');
  }

  texto('notaLoja', avaliacaoDaLoja.total ? `${avaliacaoDaLoja.media.toLocaleString('pt-AO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★` : '—');
  const avaliacoes = $('avaliacoesConteudo');
  if (avaliacoes) avaliacoes.innerHTML = avaliacaoDaLoja.total
    ? `<article><div class="review-stars">★★★★★</div><strong>${escapeHTML(avaliacaoDaLoja.media.toLocaleString('pt-AO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} de 5</strong><p>${escapeHTML(`${avaliacaoDaLoja.total} avaliação${avaliacaoDaLoja.total === 1 ? '' : 'ões'} verificada${avaliacaoDaLoja.total === 1 ? '' : 's'} em produtos desta loja.`)}</p></article>`
    : '<div class="loja-vazia">Esta loja ainda não recebeu avaliações verificadas.</div>';
}

function carregarDemo() {
  produtosDaLoja = PRODUTOS_DEMO;
  const nota = $('demoNote');
  if (nota) nota.style.display = 'block';
  preencherPerfil({
    nomeLoja: 'Kwanza Tech',
    categoria: 'Tecnologia',
    morada: 'Luanda, Angola',
    descricao: 'Loja de demonstração da VORA 313 para mostrar a vitrine de um vendedor.',
    perfilPublico: { horario: 'Seg–Sáb, 08:00–18:00', destaque: 'Tecnologia e acessórios selecionados' }
  }, produtosDaLoja);
  renderizarProdutos(produtosDaLoja.filter(emDestaque), 'destaquesLoja', 'A loja ainda não selecionou produtos em destaque.');
  renderizarProdutos(produtosDaLoja);
  configurarFiltros();
}

async function carregarLojaReal() {
  if (params.get('demo') === '1') return carregarDemo();
  if (!vendedorId) return;
  // No telemóvel uma falha temporária no pedido do perfil não deve esconder os
  // produtos já públicos. Cada origem é lida separadamente e o catálogo local
  // serve como último recurso quando a ligação estiver instável.
  const [resultadoVendedor, resultadoProdutos] = await Promise.allSettled([
    getDoc(doc(db, 'lojasPublicas', vendedorId)),
    getDocs(query(collection(db, 'produtos'), where('vendedorId', '==', vendedorId)))
  ]);

  const vendedorSnap = resultadoVendedor.status === 'fulfilled' ? resultadoVendedor.value : null;
  const produtosSnap = resultadoProdutos.status === 'fulfilled' ? resultadoProdutos.value : null;
  let produtosRemotos = produtosSnap ? produtosSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })) : [];
  // Alguns navegadores móveis podem falhar na consulta filtrada logo após uma
  // atualização de sessão/cache. Como alternativa, usa o catálogo público já
  // preparado pela aplicação e separa apenas os produtos desta loja.
  if (!produtosRemotos.length) {
    try {
      const catalogo = await carregarCatalogo();
      produtosRemotos = catalogo.filter((produto) => String(produto?.vendedorId || '') === String(vendedorId));
    } catch (_) {}
  }
  const produtosBase = produtosRemotos.length ? produtosRemotos : produtosDoCache();
  produtosDaLoja = produtosBase.filter((produto) => {
    const estado = String(produto.statusAprovacao || '').toLowerCase();
    return produto.ativo !== false && produto.vendedorAtivo !== false && (!estado || estado === 'aprovado' || estado === 'published');
  });
  await carregarAvaliacaoDaLoja();

  if ((!vendedorSnap || !vendedorSnap.exists()) && !produtosDaLoja.length) {
    texto('nome', 'Loja indisponível');
    texto('desc', 'Esta loja não está disponível publicamente neste momento.');
    texto('estado', 'Sem produtos publicados');
    texto('estadoDestaques', 'Escolhas da loja');
    renderizarProdutos([], 'destaquesLoja', 'Esta loja ainda não tem produtos em destaque.');
    renderizarProdutos([]);
    return;
  }

  const produtoReferencia = produtosDaLoja[0] || {};
  const vendedor = vendedorSnap?.exists()
    ? vendedorSnap.data()
    : {
      nomeLoja: produtoReferencia.vendedorNome || 'Loja VORA 313',
      categoria: produtoReferencia.categoria || 'Loja parceira',
      telefone: produtoReferencia.vendedorTelefone || produtoReferencia.telefoneVendedor || '',
      descricao: 'Veja os produtos publicados por esta loja na VORA 313.'
    };
  preencherPerfil(vendedor, produtosDaLoja);
  renderizarProdutos(produtosDaLoja.filter(emDestaque), 'destaquesLoja', 'A loja ainda não selecionou produtos em destaque.');
  renderizarProdutos(produtosDaLoja);
  configurarFiltros();

  // Tenta uma segunda vez apenas se a loja existe mas nenhum produto chegou.
  // Isto resolve redes móveis que acordam depois do primeiro pedido, sem criar
  // uma atualização infinita numa loja realmente vazia.
  if (!produtosDaLoja.length && !tentativaExtraAgendada) {
    tentativaExtraAgendada = true;
    setTimeout(() => carregarLojaReal().catch(() => {}), 2500);
  }
}

setTimeout(() => {
  carregarLojaReal().catch((erro) => {
    console.error('Não foi possível carregar a loja pública:', erro);
    texto('desc', 'Não foi possível carregar os dados desta loja agora. Tente novamente em instantes.');
    texto('estado', 'Tente atualizar a página');
    renderizarProdutos([], 'destaquesLoja', 'Não foi possível carregar os destaques agora.');
    renderizarProdutos([], 'produtos', 'Não foi possível carregar os produtos agora. Atualize a página para tentar de novo.');
  });
}, 0);
