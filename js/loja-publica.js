import { db } from './config.js';
import { collection, doc, getDoc, getDocs, query, where } from './supabase-compat.js';
import { criarCardProduto } from './catalogo.js';
import { escapeHTML, urlSegura } from './utils.js';

const params = new URLSearchParams(location.search);
const vendedorId = params.get('id');
const $ = (id) => document.getElementById(id);
let produtosDaLoja = [];

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

function renderizarProdutos(lista, alvo = 'produtos', textoVazio = 'Esta loja ainda não tem produtos publicados.') {
  const grid = $(alvo);
  if (!grid) return;
  if (!lista.length) {
    grid.innerHTML = '<div class="loja-vazia">' + escapeHTML(textoVazio) + '</div>';
    return;
  }
  // criarCardProduto devolve um HTMLElement, não uma string. Usar append evita
  // que o navegador mostre "[object HTMLElement]" no lugar do produto.
  grid.replaceChildren(...lista.map(criarCardProduto).filter(Boolean));
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

  texto('notaLoja', '—');
  const avaliacoes = $('avaliacoesConteudo');
  if (avaliacoes) avaliacoes.innerHTML = '<div class="loja-vazia">Esta loja ainda não recebeu avaliações verificadas.</div>';
}

async function carregarLojaReal() {
  if (!vendedorId || params.get('demo') === '1') return;
  const [vendedorSnap, produtosSnap] = await Promise.all([
    getDoc(doc(db, 'vendedores', vendedorId)),
    getDocs(query(collection(db, 'produtos'), where('vendedorId', '==', vendedorId)))
  ]);

  if (!vendedorSnap.exists()) {
    texto('nome', 'Loja indisponível');
    texto('desc', 'Esta loja não está disponível publicamente neste momento.');
    renderizarProdutos([]);
    return;
  }

  const vendedor = vendedorSnap.data();
  produtosDaLoja = produtosSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })).filter((produto) => {
    const estado = String(produto.statusAprovacao || '').toLowerCase();
    return produto.ativo !== false && produto.vendedorAtivo !== false && (!estado || estado === 'aprovado' || estado === 'published');
  });
  preencherPerfil(vendedor, produtosDaLoja);
  renderizarProdutos(produtosDaLoja.filter(emDestaque), 'destaquesLoja', 'A loja ainda não selecionou produtos em destaque.');
  renderizarProdutos(produtosDaLoja);
  configurarFiltros();
}

setTimeout(() => {
  carregarLojaReal().catch((erro) => {
    console.error('Não foi possível carregar a loja pública:', erro);
    texto('desc', 'Não foi possível carregar os dados desta loja agora. Tente novamente em instantes.');
  });
}, 0);
