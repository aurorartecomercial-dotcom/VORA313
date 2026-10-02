import { db, CONFIG, supabase } from './config.js';
import { collection, doc, getDoc, getDocs, query, where } from './supabase-compat.js';
import { carregarCatalogo, criarCardProduto } from './catalogo.js?v=3';
import { escapeHTML, imagemProdutoSegura, urlSegura } from './utils.js';
import { adicionarProdutoCarrinho, quantidadeItensCarrinho } from './carrinho.js?v=10';

const params = new URLSearchParams(location.search);
const vendedorId = params.get('id');
const $ = (id) => document.getElementById(id);
let produtosDaLoja = [];
let avaliacaoDaLoja = { media: 0, total: 0 };
let tentativaExtraAgendada = false;
let produtosFiltradosDaLoja = [];
let paginaProdutosDaLoja = 1;
const PRODUTOS_POR_PAGINA_LOJA = 8;
const PRODUTOS_DEMO = [
  { id: 'demo-1', nome: 'Smartphone VORA X Pro 256GB', preco: '245.000 Kz', categoria: 'Tecnologia', imagens: ['oferta-4-smartphones.png'], estoque: 8, freteGratis: true, vendedorNome: 'Kwanza Tech', ativo: true, monetizacao: { destaque: true } },
  { id: 'demo-2', nome: 'Relógio Smart Premium', preco: '58.500 Kz', categoria: 'Acessórios', imagens: ['oferta-6-semana.png'], estoque: 4, vendedorNome: 'Kwanza Tech', ativo: true, monetizacao: { destaque: true } },
  { id: 'demo-3', nome: 'Fones Bluetooth Pro ANC', preco: '42.900 Kz', categoria: 'Tecnologia', imagens: ['oferta-1-tecnologia.png'], estoque: 12, vendedorNome: 'Kwanza Tech', ativo: true }
];

function imagemSegura(valor) {
  return imagemProdutoSegura(valor, '');
}

function atualizarAtalhoSacola(mensagem = '') {
  const atalho = $('atalhoSacolaLoja');
  const total = quantidadeItensCarrinho();
  if (atalho) {
    atalho.textContent = total ? `🛒 Sacola (${total})` : '🛒 Sacola';
    atalho.setAttribute('aria-label', total ? `Abrir sacola com ${total} produto(s)` : 'Abrir sacola');
  }
  const retorno = $('lojaFeedbackSacola');
  if (retorno && mensagem) {
    retorno.textContent = mensagem;
    retorno.hidden = false;
  }
}

// Esta página não carrega o app.js da homepage. Delegar o clique aqui garante
// que os cartões da loja do vendedor adicionem à mesma sacola do site inteiro.
document.addEventListener('click', (event) => {
  const botao = event.target.closest('.btn-add-carrinho-card');
  if (!botao) return;
  const produto = produtosDaLoja.find((item) => String(item.id) === String(botao.dataset.produtoId));
  if (!produto) return;
  event.preventDefault();
  event.stopPropagation();
  if (Array.isArray(produto.variacoes) && produto.variacoes.some((grupo) => grupo?.nome && Array.isArray(grupo?.opcoes) && grupo.opcoes.length)) {
    atualizarAtalhoSacola('Escolha as opções do produto antes de adicionar à sacola.');
    window.location.href = `detalhe.html?id=${encodeURIComponent(produto.id)}`;
  } else if (adicionarProdutoCarrinho(produto)) {
    atualizarAtalhoSacola('✓ Produto adicionado à sacola. Pode finalizar a compra quando quiser.');
  }
});

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

function definirEstatistica(id, valor) {
  texto(id, numero(valor));
  const cartao = $(id)?.closest('.loja-estatistica');
  if (cartao) cartao.hidden = Number(valor || 0) <= 0;
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
    const acoes = document.createElement('div');
    acoes.className = 'acoes-produto';
    const adicionar = document.createElement('button');
    adicionar.type = 'button';
    adicionar.className = 'btn-add-carrinho-card';
    adicionar.dataset.produtoId = String(produto?.id || '');
    adicionar.textContent = '🛒 Adicionar ao carrinho';
    acoes.append(adicionar);
    artigo.append(acoes);
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

const ESTILOS_EDITORIAIS = new Set(['editorial_moda', 'editorial_beleza', 'editorial_livros']);

function temaEditorial(estilo) {
  return ({
    editorial_moda: {
      colecao: 'Nova coleção',
      titulo: 'Moda para ser vista por inteiro.',
      chamada: 'Descubra peças escolhidas para criar o seu próximo look.'
    },
    editorial_beleza: {
      colecao: 'Edição de beleza',
      titulo: 'A sua rotina começa aqui.',
      chamada: 'Produtos selecionados para cuidar, realçar e inspirar.'
    },
    editorial_livros: {
      colecao: 'Seleção da livraria',
      titulo: 'Histórias que merecem um lugar especial.',
      chamada: 'Conheça livros escolhidos para a sua próxima leitura.'
    }
  })[estilo] || null;
}

// A secção é inteiramente composta no navegador com texto e URLs já validados.
// Mostra no máximo cinco produtos que já pertencem ao catálogo público da própria
// loja. O vendedor pode continuar a definir a prioridade de um produto; os outros
// são completados por destaques e, depois, pelo catálogo. Não há HTML livre nem
// consulta de produtos de outra loja.
function produtosDaColecaoEditorial(perfil, listaProdutos) {
  const publicados = (Array.isArray(listaProdutos) ? listaProdutos : [])
    .filter((produto) => produto && produto.ativo !== false);
  const prioritario = publicados.find((produto) => String(produto?.id || '') === String(perfil?.editorialProdutoId || ''));
  const candidatos = [prioritario, ...publicados.filter(emDestaque), ...publicados];
  const vistos = new Set();
  return candidatos.filter((produto) => {
    const id = String(produto?.id || '');
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  }).slice(0, 5);
}

function renderizarEditorial(perfil, listaProdutos) {
  const secao = $('lojaEditorial');
  const navegacao = $('lojaEditorialNav');
  const estilo = String(perfil?.estiloVitrine || 'padrao').toLowerCase();
  const tema = temaEditorial(estilo);
  const ativo = ESTILOS_EDITORIAIS.has(estilo) && !!tema;
  if (!secao) return;

  secao.hidden = !ativo;
  if (navegacao) navegacao.hidden = !ativo;
  document.body.dataset.estiloVitrine = ativo ? estilo : 'padrao';
  if (!ativo) return;

  secao.dataset.tema = estilo;
  const colecao = produtosDaColecaoEditorial(perfil, listaProdutos);
  const produtoPrioritario = colecao[0] || null;
  const imagemCapa = urlSegura(perfil?.capaUrl, '') || imagemSegura(produtoPrioritario?.imagens?.[0]);
  const imagem = $('lojaEditorialImagem');

  texto('lojaEditorialColecao', perfil?.editorialColecao || tema.colecao);
  texto('lojaEditorialTitulo', perfil?.editorialTitulo || tema.titulo);
  texto('lojaEditorialChamada', perfil?.editorialChamada || tema.chamada);

  const blocoProduto = $('lojaEditorialProduto');
  if (!imagem || !blocoProduto) return;
  blocoProduto.replaceChildren();
  blocoProduto.hidden = !colecao.length;

  const definirImagemPrincipal = (produto) => {
    const imagemProduto = produto ? imagemSegura(produto.imagens?.[0]) : imagemCapa;
    if (imagemProduto) {
      imagem.style.setProperty('--loja-editorial-capa', 'url("' + imagemProduto.replace(/["\\]/g, '\\$&') + '")');
      imagem.style.backgroundImage = '';
    } else {
      imagem.style.removeProperty('--loja-editorial-capa');
      imagem.style.backgroundImage = 'linear-gradient(145deg,#2f6a5b,#dfb78f)';
    }
    imagem.replaceChildren();

    const legenda = document.createElement('div');
    legenda.className = 'loja-editorial-imagem-legenda';
    const tipo = document.createElement('small');
    tipo.textContent = produto ? 'Produto selecionado' : 'Coleção da loja';
    const nome = document.createElement('strong');
    nome.textContent = produto ? String(produto.nome || 'Produto da coleção') : String(perfil?.editorialColecao || tema.colecao);
    legenda.append(tipo, nome);
    if (produto?.preco) {
      const preco = document.createElement('span');
      preco.textContent = String(produto.preco);
      legenda.append(preco);
    }
    imagem.append(legenda);
    imagem.setAttribute('aria-label', produto
      ? 'Produto selecionado: ' + String(produto.nome || 'produto da coleção')
      : 'Capa da coleção ' + String(perfil?.editorialColecao || tema.colecao));
  };

  // A capa aparece primeiro. Ao escolher um cartão, a imagem grande passa a
  // ser do produto escolhido, sem alterar a capa guardada do vendedor.
  definirImagemPrincipal(null);
  if (!colecao.length) return;

  const cabecalho = document.createElement('div');
  cabecalho.className = 'loja-editorial-galeria-cabecalho';
  const tituloGaleria = document.createElement('strong');
  tituloGaleria.textContent = `${colecao.length} produto${colecao.length === 1 ? '' : 's'} na coleção`;
  const navegacaoGaleria = document.createElement('div');
  navegacaoGaleria.className = 'loja-editorial-galeria-navegacao';
  const anterior = document.createElement('button');
  anterior.type = 'button';
  anterior.className = 'loja-editorial-seta';
  anterior.setAttribute('aria-label', 'Produto anterior da coleção');
  anterior.textContent = '‹';
  const proximo = document.createElement('button');
  proximo.type = 'button';
  proximo.className = 'loja-editorial-seta';
  proximo.setAttribute('aria-label', 'Próximo produto da coleção');
  proximo.textContent = '›';
  if (colecao.length < 2) {
    anterior.disabled = true;
    proximo.disabled = true;
  }
  navegacaoGaleria.append(anterior, proximo);
  cabecalho.append(tituloGaleria, navegacaoGaleria);

  const galeria = document.createElement('div');
  galeria.className = 'loja-editorial-galeria';
  galeria.setAttribute('role', 'list');
  const cartoes = [];
  let indiceSelecionado = -1;

  const selecionarProduto = (indice) => {
    if (!colecao.length) return;
    indiceSelecionado = (indice + colecao.length) % colecao.length;
    const produto = colecao[indiceSelecionado];
    definirImagemPrincipal(produto);
    cartoes.forEach((cartao, indiceCartao) => {
      const selecionado = indiceCartao === indiceSelecionado;
      cartao.classList.toggle('selecionado', selecionado);
      cartao.querySelector('.loja-editorial-escolher')?.setAttribute('aria-pressed', String(selecionado));
    });
    cartoes[indiceSelecionado]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  colecao.forEach((produto, indice) => {
    const cartao = document.createElement('article');
    cartao.className = 'loja-editorial-cartao';
    cartao.setAttribute('role', 'listitem');
    const escolher = document.createElement('button');
    escolher.type = 'button';
    escolher.className = 'loja-editorial-escolher';
    escolher.setAttribute('aria-label', 'Ver ' + String(produto.nome || 'produto') + ' na imagem principal');
    escolher.setAttribute('aria-pressed', 'false');
    const imagemProduto = imagemSegura(produto.imagens?.[0]);
    if (imagemProduto) {
      const miniatura = document.createElement('img');
      miniatura.src = imagemProduto;
      miniatura.alt = '';
      miniatura.loading = 'lazy';
      escolher.append(miniatura);
    }
    const dados = document.createElement('span');
    dados.className = 'loja-editorial-cartao-dados';
    const categoria = document.createElement('small');
    categoria.textContent = String(produto.categoria || 'Produto');
    const nome = document.createElement('strong');
    nome.textContent = String(produto.nome || 'Produto da coleção');
    const preco = document.createElement('b');
    preco.textContent = String(produto.preco || 'Ver preço');
    dados.append(categoria, nome, preco);
    escolher.append(dados);
    escolher.addEventListener('click', () => selecionarProduto(indice));

    const adicionar = document.createElement('button');
    adicionar.type = 'button';
    adicionar.className = 'loja-editorial-cartao-adicionar';
    adicionar.textContent = 'Adicionar';
    adicionar.setAttribute('aria-label', 'Adicionar ' + String(produto.nome || 'produto') + ' ao carrinho');
    adicionar.addEventListener('click', () => {
      if (Array.isArray(produto.variacoes) && produto.variacoes.some((grupo) => grupo?.nome && Array.isArray(grupo?.opcoes) && grupo.opcoes.length)) {
        window.location.href = `detalhe.html?id=${encodeURIComponent(produto.id)}`;
      } else if (adicionarProdutoCarrinho(produto)) {
        atualizarAtalhoSacola('✓ Produto da coleção adicionado à sacola.');
      }
    });
    cartao.append(escolher, adicionar);
    cartoes.push(cartao);
    galeria.append(cartao);
  });

  anterior.addEventListener('click', () => selecionarProduto(indiceSelecionado < 0 ? colecao.length - 1 : indiceSelecionado - 1));
  proximo.addEventListener('click', () => selecionarProduto(indiceSelecionado < 0 ? 0 : indiceSelecionado + 1));
  blocoProduto.append(cabecalho, galeria);
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
  grid.classList.toggle('loja-grid-publica--single', lista.length === 1);
  if (!lista.length) {
    grid.innerHTML = '<div class="loja-vazia">' + escapeHTML(textoVazio) + '</div>';
    return;
  }
  // criarCardProduto devolve um HTMLElement, não uma string. Usar append evita
  // que o navegador mostre "[object HTMLElement]" no lugar do produto.
  grid.replaceChildren(...lista.map(criarCartaoSeguro).filter(Boolean));
}

// A vitrine de cada vendedor usa páginas incrementais, sem mudar os cartões
// nem os filtros existentes. Isso mantém a loja rápida mesmo com muitos
// anúncios publicados.
function mostrarProdutosDaLoja(lista, textoVazio = 'Esta loja ainda não tem produtos publicados.') {
  produtosFiltradosDaLoja = Array.isArray(lista) ? lista : [];
  paginaProdutosDaLoja = 1;
  atualizarPaginaProdutosDaLoja(textoVazio);
}

function atualizarPaginaProdutosDaLoja(textoVazio = 'Esta loja ainda não tem produtos publicados.') {
  const total = produtosFiltradosDaLoja.length;
  const totalPaginas = Math.ceil(total / PRODUTOS_POR_PAGINA_LOJA);
  if (!totalPaginas) paginaProdutosDaLoja = 1;
  else paginaProdutosDaLoja = Math.min(paginaProdutosDaLoja, totalPaginas);
  const inicio = (paginaProdutosDaLoja - 1) * PRODUTOS_POR_PAGINA_LOJA;
  renderizarProdutos(produtosFiltradosDaLoja.slice(inicio, inicio + PRODUTOS_POR_PAGINA_LOJA), 'produtos', textoVazio);

  const controles = $('lojaCarregarMaisControles');
  const botao = $('carregarMaisProdutosLoja');
  if (!controles || !botao) return;
  const temMais = paginaProdutosDaLoja < totalPaginas;
  controles.hidden = total <= PRODUTOS_POR_PAGINA_LOJA;
  botao.disabled = !temMais;
  botao.setAttribute('aria-disabled', String(!temMais));
  botao.textContent = temMais
    ? `Carregar mais produtos (${Math.min(paginaProdutosDaLoja * PRODUTOS_POR_PAGINA_LOJA, total)} de ${total})`
    : 'Todos os produtos foram carregados';
}

function carregarMaisProdutosDaLoja() {
  const totalPaginas = Math.ceil(produtosFiltradosDaLoja.length / PRODUTOS_POR_PAGINA_LOJA);
  if (paginaProdutosDaLoja >= totalPaginas) return;
  paginaProdutosDaLoja += 1;
  atualizarPaginaProdutosDaLoja();
}

function renderizarDestaques(lista, textoVazio = 'A loja ainda não selecionou produtos em destaque.') {
  const secao = $('destaquesSecao');
  if (secao) secao.hidden = !lista.length;
  // Uma secção sem destaques não ocupa espaço: o cliente chega diretamente ao
  // catálogo. Quando existirem destaques, continua a usar o mesmo cartão e a
  // mesma navegação já usados no restante da loja.
  if (lista.length) renderizarProdutos(lista, 'destaquesLoja', textoVazio);
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
      mostrarProdutosDaLoja(categoria === 'todos' ? produtosDaLoja : produtosDaLoja.filter((produto) => produto.categoria === categoria));
    }));
  }

  const busca = $('buscaLoja');
  if (busca) busca.addEventListener('input', () => {
    const termo = busca.value.trim().toLowerCase();
    mostrarProdutosDaLoja(produtosDaLoja.filter((produto) => (produto.nome || '').toLowerCase().includes(termo)));
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
  definirEstatistica('totalProdutos', produtos.length);
  definirEstatistica('totalDestaques', produtos.filter(emDestaque).length);
  definirEstatistica('totalVendas', vendedor?.totalVendas);
  const estatisticas = document.querySelector('.loja-estatisticas');
  if (estatisticas) estatisticas.hidden = !estatisticas.querySelector('.loja-estatistica:not([hidden])');
  texto('contadorProdutos', produtos.length + (produtos.length === 1 ? ' produto' : ' produtos'));
  texto('estado', produtos.length + (produtos.length === 1 ? ' produto' : ' produtos'));
  texto('estadoDestaques', produtos.some(emDestaque) ? 'Produtos patrocinados' : 'Escolhas da loja');
  texto('lojaFaixa', destaque || 'Produtos publicados pela loja');
  texto('lojaFaixaIcone', destaque ? '✨' : '🏪');
  const faixaPromocional = $('lojaFaixaPromocional');
  if (faixaPromocional) faixaPromocional.hidden = !destaque;
  mostrarLogo(perfil.logoUrl);
  aplicarCapa(perfil.capaUrl);
  renderizarEditorial(perfil, produtos);
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
  $('avaliacoesLoja')?.classList.toggle('loja-avaliacoes-vazias', !avaliacaoDaLoja.total);
  const avaliacoes = $('avaliacoesConteudo');
  if (avaliacoes) avaliacoes.innerHTML = avaliacaoDaLoja.total
    ? `<article><div class="review-stars">★★★★★</div><strong>${escapeHTML(avaliacaoDaLoja.media.toLocaleString('pt-AO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} de 5</strong><p>${escapeHTML(`${avaliacaoDaLoja.total} avaliação${avaliacaoDaLoja.total === 1 ? '' : 'ões'} verificada${avaliacaoDaLoja.total === 1 ? '' : 's'} em produtos desta loja.`)}</p></article>`
    : '<div class="loja-vazia">Esta loja ainda não recebeu avaliações verificadas.</div>';
}

function carregarDemo() {
  const estiloDemo = String(params.get('estilo') || 'padrao').toLowerCase();
  const demosEditoriais = {
    editorial_moda: {
      nomeLoja: 'Atelier Horizonte', categoria: 'Moda', morada: 'Luanda, Angola',
      descricao: 'Uma montra editorial para ver o look completo, os detalhes e o caimento de cada peça.',
      capaUrl: 'oferta-2-moda.png', editorialColecao: 'Coleção Primavera',
      editorialTitulo: 'Peças que falam por si.',
      editorialChamada: 'Looks completos, fotografados para veres o conjunto com clareza.',
      produtos: [
        { id: 'demo-moda-1', nome: 'Vestido Aurora em linho', preco: '38.500 Kz', categoria: 'Moda', imagens: ['oferta-2-moda.png'], estoque: 6, vendedorNome: 'Atelier Horizonte', ativo: true, monetizacao: { destaque: true } },
        { id: 'demo-moda-2', nome: 'Conjunto urbano essencial', preco: '29.900 Kz', categoria: 'Moda', imagens: ['oferta-2-moda.png'], estoque: 4, vendedorNome: 'Atelier Horizonte', ativo: true }
      ]
    },
    editorial_beleza: {
      nomeLoja: 'Casa Aura', categoria: 'Beleza', morada: 'Talatona, Luanda',
      descricao: 'Uma seleção de cuidados e beleza apresentada como uma revista de autocuidado.',
      capaUrl: 'oferta-5-beleza.png', editorialColecao: 'Ritual de autocuidado',
      editorialTitulo: 'A sua rotina começa aqui.',
      editorialChamada: 'Produtos escolhidos para cuidar, realçar e inspirar todos os dias.',
      produtos: [
        { id: 'demo-beleza-1', nome: 'Kit cuidado e beleza', preco: '24.500 Kz', categoria: 'Beleza', imagens: ['oferta-5-beleza.png'], estoque: 8, vendedorNome: 'Casa Aura', ativo: true, monetizacao: { destaque: true } },
        { id: 'demo-beleza-2', nome: 'Rotina essencial para a pele', preco: '18.900 Kz', categoria: 'Beleza', imagens: ['oferta-5-beleza.png'], estoque: 5, vendedorNome: 'Casa Aura', ativo: true }
      ]
    },
    editorial_livros: {
      nomeLoja: 'Páginas & Companhia', categoria: 'Livros', morada: 'Maianga, Luanda',
      descricao: 'Uma livraria com leitura editorial: capa, sinopse curta e recomendações numa só montra.',
      capaUrl: 'blog-imagens/blog-7-guia-compras.png', editorialColecao: 'Seleção da livraria',
      editorialTitulo: 'Histórias que merecem um lugar especial.',
      editorialChamada: 'Escolhas para oferecer, aprender e levar contigo para a próxima leitura.',
      produtos: [
        { id: 'demo-livro-1', nome: 'Guia de compras inteligentes', preco: '12.500 Kz', categoria: 'Livros', imagens: ['blog-imagens/blog-7-guia-compras.png'], estoque: 9, vendedorNome: 'Páginas & Companhia', ativo: true, monetizacao: { destaque: true } },
        { id: 'demo-livro-2', nome: 'Caderno de ideias e projetos', preco: '8.900 Kz', categoria: 'Livros', imagens: ['blog-imagens/blog-7-guia-compras.png'], estoque: 7, vendedorNome: 'Páginas & Companhia', ativo: true }
      ]
    }
  };
  const editorial = demosEditoriais[estiloDemo];
  produtosDaLoja = editorial ? editorial.produtos : PRODUTOS_DEMO;
  const nota = $('demoNote');
  if (nota) nota.style.display = 'block';
  preencherPerfil({
    nomeLoja: editorial?.nomeLoja || 'Kwanza Tech',
    categoria: editorial?.categoria || 'Tecnologia',
    morada: editorial?.morada || 'Luanda, Angola',
    descricao: editorial?.descricao || 'Loja de demonstração da VORA 313 para mostrar a vitrine de um vendedor.',
    perfilPublico: {
      horario: 'Seg–Sáb, 08:00–18:00',
      destaque: editorial ? editorial.editorialColecao : 'Tecnologia e acessórios selecionados',
      ...(editorial ? {
        capaUrl: editorial.capaUrl,
        estiloVitrine: estiloDemo,
        editorialColecao: editorial.editorialColecao,
        editorialTitulo: editorial.editorialTitulo,
        editorialChamada: editorial.editorialChamada,
        editorialProdutoId: editorial.produtos[0].id
      } : {})
    }
  }, produtosDaLoja);
  renderizarDestaques(produtosDaLoja.filter(emDestaque));
  mostrarProdutosDaLoja(produtosDaLoja);
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
    renderizarDestaques([], 'Esta loja ainda não tem produtos em destaque.');
    mostrarProdutosDaLoja([]);
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
  renderizarDestaques(produtosDaLoja.filter(emDestaque));
  mostrarProdutosDaLoja(produtosDaLoja);
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
    renderizarDestaques([], 'Não foi possível carregar os destaques agora.');
    mostrarProdutosDaLoja([], 'Não foi possível carregar os produtos agora. Atualize a página para tentar de novo.');
  });
}, 0);

atualizarAtalhoSacola();
$('carregarMaisProdutosLoja')?.addEventListener('click', carregarMaisProdutosDaLoja);
