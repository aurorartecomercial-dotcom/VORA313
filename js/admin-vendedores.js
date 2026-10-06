import { auth, db, functions, supabase } from './config.js';
import { collection, getDocs, getIdTokenResult, signInWithEmailAndPassword, signOut, httpsCallable } from './supabase-compat.js';
import { escapeHTML } from './utils.js';

const $ = (id) => document.getElementById(id);
let vendedores = [];
let produtos = [];
let vendas = [];
let videosPendentes = [];

function estadoClasse(estado) { return estado === 'aprovado' ? 'approved' : ['recusado', 'suspenso'].includes(estado) ? 'refused' : ''; }
function estadoNome(estado) { return ({ pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', suspenso: 'Suspenso' })[estado] || estado || '—'; }
function moeda(valor) { return `${Number(valor || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`; }

function mostrarMensagem(texto, ok = true) {
  const box = $('mensagemVendedores');
  box.textContent = texto;
  box.className = `adm-message ${ok ? 'ok' : 'err'}`;
}

async function validarAdmin(user) {
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
}

async function carregar() {
  const [vendedoresSnap, produtosSnap, vendasSnap] = await Promise.all([
    getDocs(collection(db, 'vendedores')),
    getDocs(collection(db, 'produtos')),
    getDocs(collection(db, 'vendasVendedor'))
  ]);
  vendedores = vendedoresSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  produtos = produtosSnap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.vendedorId || item.vendedor_id);
  vendas = vendasSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  renderizar();
  await carregarVideosParaModeracao();
}

function tamanhoArquivo(bytes) {
  const mb = Number(bytes || 0) / 1024 / 1024;
  return Number.isFinite(mb) && mb > 0 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : '—';
}

function dataVideo(valor) {
  const data = new Date(valor || 0);
  return Number.isNaN(data.getTime()) ? 'Sem data' : data.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function carregarVideosParaModeracao() {
  const lista = $('listaVideosModeracao');
  if (!lista) return;
  try {
    const { data } = await httpsCallable(functions, 'listarVideosParaModeracao')({});
    videosPendentes = Array.isArray(data) ? data : [];
    renderizarVideosParaModeracao();
  } catch (erro) {
    videosPendentes = [];
    const detalhe = String(erro?.message || 'Não foi possível carregar os vídeos pendentes.');
    lista.replaceChildren();
    const aviso = document.createElement('div');
    aviso.className = 'adm-empty';
    aviso.textContent = `Não foi possível carregar a fila de vídeos. ${detalhe}`;
    lista.append(aviso);
    mostrarMensagem(detalhe, false);
  }
}

function renderizarVideosParaModeracao() {
  const lista = $('listaVideosModeracao');
  if (!lista) return;
  lista.replaceChildren();
  if (!videosPendentes.length) {
    lista.innerHTML = '<div class="adm-empty">✓ Não há vídeos aguardando análise.</div>';
    return;
  }
  videosPendentes.forEach((video) => {
    const artigo = document.createElement('article');
    artigo.className = 'adm-video-card';
    const media = document.createElement('div');
    media.className = 'adm-video-media';
    const player = document.createElement('video');
    player.controls = true;
    player.playsInline = true;
    player.preload = 'metadata';
    if (/^https:\/\//i.test(String(video.videoUrl || video.video_url || ''))) player.src = video.videoUrl || video.video_url;
    player.setAttribute('aria-label', String(video.titulo || 'Vídeo enviado pelo vendedor'));
    media.append(player);

    const corpo = document.createElement('div');
    corpo.className = 'adm-video-body';
    const titulo = document.createElement('h3');
    titulo.textContent = String(video.titulo || 'Vídeo sem título');
    const loja = document.createElement('p');
    loja.textContent = `Loja: ${video.lojaNome || video.loja_nome || video.vendedorNome || video.vendedor_nome || '—'}`;
    const produto = document.createElement('small');
    produto.textContent = (video.produtoNome || video.produto_nome) ? `Produto: ${video.produtoNome || video.produto_nome}` : 'Sem produto relacionado';
    const meta = document.createElement('small');
    const segundos = Number(video.duracaoSegundos || video.duracao_segundos || 0);
    meta.textContent = [tamanhoArquivo(video.tamanhoBytes || video.tamanho_bytes), segundos ? `${segundos}s` : '', dataVideo(video.criadoEm || video.criado_em)].filter(Boolean).join(' · ');
    const descricao = String(video.descricao || '').trim();
    const texto = document.createElement('p');
    texto.textContent = descricao || 'Sem descrição.';
    const motivo = document.createElement('textarea');
    motivo.maxLength = 600;
    motivo.placeholder = 'Motivo da recusa (obrigatório se recusar)';
    motivo.dataset.motivoVideo = String(video.id);
    const acoes = document.createElement('div');
    acoes.className = 'adm-video-actions';
    const aprovar = document.createElement('button');
    aprovar.type = 'button';
    aprovar.className = 'adm-btn';
    aprovar.dataset.moderarVideo = String(video.id);
    aprovar.dataset.acaoVideo = 'aprovar';
    aprovar.textContent = '✓ Aprovar e publicar';
    const recusar = document.createElement('button');
    recusar.type = 'button';
    recusar.className = 'adm-btn danger';
    recusar.dataset.moderarVideo = String(video.id);
    recusar.dataset.acaoVideo = 'recusar';
    recusar.textContent = 'Recusar';
    acoes.append(aprovar, recusar);
    corpo.append(titulo, loja, produto, meta, texto, motivo, acoes);
    artigo.append(media, corpo);
    lista.append(artigo);
  });
}

async function moderarVideo(videoId, acao, botao) {
  if (!videoId || !['aprovar', 'recusar'].includes(acao)) return;
  const seletorSeguro = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(videoId) : String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
  const motivo = String(document.querySelector(`[data-motivo-video="${seletorSeguro}"]`)?.value || '').trim();
  if (acao === 'recusar' && motivo.length < 5) {
    mostrarMensagem('Escreva um motivo claro, com pelo menos 5 caracteres, para o vendedor corrigir o vídeo.', false);
    return;
  }
  const confirmar = acao === 'aprovar' ? 'Aprovar este vídeo e publicar na loja do vendedor?' : 'Recusar este vídeo? O vendedor receberá o motivo.';
  if (!confirm(confirmar)) return;
  try {
    if (botao) { botao.disabled = true; botao.textContent = 'A processar…'; }
    await httpsCallable(functions, 'moderarVideoVendedor')({ videoId, acao, motivoRecusa: motivo });
    mostrarMensagem(acao === 'aprovar' ? 'Vídeo aprovado e publicado na loja.' : 'Vídeo recusado. O motivo ficou disponível para o vendedor.');
    await carregarVideosParaModeracao();
  } catch (erro) {
    mostrarMensagem(erro.message || 'Não foi possível decidir sobre o vídeo.', false);
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = acao === 'aprovar' ? '✓ Aprovar e publicar' : 'Recusar'; }
  }
}

function renderizar() {
  const termo = String($('filtroVendedores').value || '').trim().toLowerCase();
  const statusFiltro = $('statusVendedores').value || 'todos';
  const lista = vendedores.filter((vendedor) => {
    const texto = `${vendedor.nome || ''} ${vendedor.nomeLoja || ''} ${vendedor.email || ''}`.toLowerCase();
    return (!termo || texto.includes(termo)) && (statusFiltro === 'todos' || vendedor.status === statusFiltro);
  });
  const pendentesProdutos = produtos.filter((produto) => (produto.statusAprovacao || produto.status_aprovacao) === 'aguardando_aprovacao').length;
  $('kpiTotalVendedores').textContent = vendedores.length;
  $('kpiPendentesVendedores').textContent = vendedores.filter((vendedor) => vendedor.status === 'pendente').length;
  $('kpiAprovadosVendedores').textContent = vendedores.filter((vendedor) => vendedor.status === 'aprovado' && vendedor.ativo !== false).length;
  $('kpiProdutosPendentes').textContent = pendentesProdutos;
  const produtosPorVendedor = produtos.reduce((mapa, produto) => { const id = produto.vendedorId || produto.vendedor_id; mapa[id] = (mapa[id] || 0) + 1; return mapa; }, {});
  const vendasPorVendedor = vendas.reduce((mapa, venda) => { const id = venda.uidVendedor || venda.uid_vendedor; if (!id) return mapa; const atual = mapa[id] || { pedidos: 0, valor: 0 }; atual.pedidos += 1; atual.valor += Number(venda.valorVenda ?? venda.valor_venda ?? venda.valorVendedor ?? venda.valor_vendedor ?? 0); mapa[id] = atual; return mapa; }, {});
  const box = $('listaVendedores');
  if (!lista.length) { box.innerHTML = '<tr><td class="adm-empty" colspan="7">Nenhum vendedor encontrado para este filtro.</td></tr>'; return; }
  box.innerHTML = lista.map((vendedor) => {
    const dadosVendas = vendasPorVendedor[vendedor.id] || { pedidos: 0, valor: 0 };
    const estado = vendedor.status || 'pendente';
    let acoes = '';
    if (estado === 'pendente') acoes = `<button class="adm-btn" data-acao="aprovar" data-id="${escapeHTML(vendedor.id)}">Aprovar</button><button class="adm-btn danger" data-acao="recusar" data-id="${escapeHTML(vendedor.id)}">Recusar</button>`;
    else if (estado === 'aprovado' && vendedor.ativo !== false) acoes = `<button class="adm-btn warn" data-acao="suspender" data-id="${escapeHTML(vendedor.id)}">Suspender</button>`;
    else acoes = `<button class="adm-btn" data-acao="reativar" data-id="${escapeHTML(vendedor.id)}">Reativar</button>`;
    const loja = estado === 'aprovado' && vendedor.ativo !== false ? `<a class="adm-btn alt" target="_blank" rel="noopener" href="loja.html?vendedor=${encodeURIComponent(vendedor.id)}">Ver loja</a>` : '';
    const quantidadeProdutos = produtosPorVendedor[vendedor.id] || 0;
    const limparCatalogo = quantidadeProdutos
      ? `<button class="adm-btn danger" data-limpar-catalogo="${escapeHTML(vendedor.id)}">Limpar catálogo</button>`
      : '';
    return `<tr><td><strong>${escapeHTML(vendedor.nome || 'Sem nome')}</strong><small>${escapeHTML(vendedor.nomeLoja || 'Sem loja')}</small></td><td>${escapeHTML(vendedor.email || '—')}<small>${escapeHTML(vendedor.telefone || '')}</small></td><td><span class="adm-badge ${estadoClasse(estado)}">${escapeHTML(estadoNome(estado))}</span>${vendedor.motivoRecusa ? `<small>Motivo: ${escapeHTML(vendedor.motivoRecusa)}</small>` : ''}</td><td>${quantidadeProdutos}</td><td>${dadosVendas.pedidos}</td><td>${escapeHTML(moeda(dadosVendas.valor))}</td><td><div class="adm-actions">${loja}<button class="adm-btn alt" data-detalhe="produtos" data-id="${escapeHTML(vendedor.id)}">Produtos</button><button class="adm-btn alt" data-detalhe="vendas" data-id="${escapeHTML(vendedor.id)}">Vendas</button>${limparCatalogo}${acoes}</div></td></tr>`;
  }).join('');
}

function mostrarDetalheVendedor(id, tipo) {
  const vendedor = vendedores.find((item) => String(item.id) === String(id));
  const alvo = $('detalheVendedor');
  if (!vendedor || !alvo) return;
  const eProdutos = (produto) => String(produto.vendedorId || produto.vendedor_id || '') === String(id);
  const eVenda = (venda) => String(venda.uidVendedor || venda.uid_vendedor || '') === String(id);
  if (tipo === 'produtos') {
    const lista = produtos.filter(eProdutos);
    const tituloLoja = escapeHTML(vendedor.nomeLoja || vendedor.nome || 'vendedor');
    alvo.innerHTML = `<strong>Produtos de ${tituloLoja}</strong><p class="adm-detail-note">Cada eliminação é definitiva. Produtos que já têm pedido não podem ser apagados para proteger a fatura e a contabilidade.</p>${lista.length ? `<div class="adm-product-list">${lista.map((produto) => { const status = produto.statusAprovacao || produto.status_aprovacao || 'sem estado'; const ativo = produto.ativo !== false && produto.vendedor_ativo !== false; const disponibilidade = status === 'aprovado' ? `<button class="adm-btn ${ativo ? 'warn' : ''}" type="button" data-disponibilidade-produto="${escapeHTML(produto.id)}" data-acao-produto="${ativo ? 'ocultar' : 'reativar'}">${ativo ? '🙈 Ocultar' : '👁️ Reativar'}</button>` : ''; return `<div class="adm-product-row"><span><strong>${escapeHTML(produto.nome || 'Produto')}</strong><small>${escapeHTML(status)} · ${ativo ? '🟢 Publicado' : '⚪ Oculto'} · ${escapeHTML(moeda(produto.precoValor ?? produto.preco_valor ?? 0))}</small></span><div class="adm-actions">${disponibilidade}<button class="adm-btn danger" type="button" data-eliminar-produto-vendedor="${escapeHTML(produto.id)}">Eliminar</button></div></div>`; }).join('')}</div>` : 'Nenhum produto registado.'}`;
  } else {
    const lista = vendas.filter(eVenda);
    alvo.innerHTML = `<strong>Vendas de ${escapeHTML(vendedor.nomeLoja || vendedor.nome || 'vendedor')}</strong><br>${lista.length ? lista.map((venda) => `${escapeHTML(venda.codigoRastreio || venda.codigo_rastreio || venda.id)} · ${escapeHTML(venda.status || 'sem estado')} · ${escapeHTML(moeda(venda.valorVenda ?? venda.valor_venda ?? venda.valorVendedor ?? venda.valor_vendedor ?? 0))}`).join('<br>') : 'Nenhuma venda registada.'}`;
  }
  alvo.hidden = false;
}

async function alterarVendedor(id, acao) {
  const verbo = { aprovar: 'aprovar', recusar: 'recusar', suspender: 'suspender', reativar: 'reativar' }[acao] || acao;
  if (!confirm(`Confirmar ${verbo} este vendedor?`)) return;
  const motivo = acao === 'recusar' ? String(prompt('Motivo da recusa (opcional):') || '').trim() : '';
  const botoes = [...document.querySelectorAll('[data-acao]')].filter(btn => btn.dataset.id === String(id));
  botoes.forEach(btn => { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = 'A processar…'; });
  try {
    await httpsCallable(functions, 'gerirVendedor')({ uid: id, acao, motivoRecusa: motivo });
    mostrarMensagem(`Vendedor ${verbo} concluído com sucesso.`);
    await carregar();
  } catch (erro) {
    mostrarMensagem(`Não foi possível ${verbo} o vendedor. ${erro.message || erro}`, false);
  } finally {
    botoes.forEach(btn => { if (btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.originalText || verbo; } });
  }
}
function confirmarEliminacao(pergunta) {
  const resposta = prompt(`${pergunta}\n\nEsta ação é definitiva. Escreva ELIMINAR para continuar.`);
  if (resposta === null) return false;
  if (String(resposta).trim().toLocaleUpperCase('pt-AO') !== 'ELIMINAR') {
    mostrarMensagem('A eliminação foi cancelada: é preciso escrever exatamente ELIMINAR.', false);
    return false;
  }
  return true;
}

async function alterarDisponibilidadeProdutoAdmin(produtoId, acao) {
  if (!produtoId || !['ocultar', 'reativar'].includes(acao)) return;
  const produto = produtos.find((item) => String(item.id) === String(produtoId));
  if (!produto) { mostrarMensagem('Produto não encontrado. Atualize a lista e tente novamente.', false); return; }
  const nome = String(produto.nome || 'este produto');
  const pergunta = acao === 'ocultar'
    ? `Ocultar “${nome}” da loja pública? O histórico de vendas será preservado.`
    : `Reativar “${nome}” na loja pública? O produto e o vendedor precisam estar aprovados e ativos.`;
  if (!confirm(pergunta)) return;
  try {
    await httpsCallable(functions, 'administrarProdutoVendedor')({ produtoId, acao });
    mostrarMensagem(acao === 'ocultar' ? `Produto “${nome}” ocultado com segurança.` : `Produto “${nome}” reativado.`);
    await carregar();
  } catch (erro) {
    mostrarMensagem(`Não foi possível ${acao === 'ocultar' ? 'ocultar' : 'reativar'} o produto. ${erro.message || erro}`, false);
  }
}

async function eliminarProdutoVendedorAdmin(produtoId) {
  const produto = produtos.find((item) => String(item.id) === String(produtoId));
  if (!produto) {
    mostrarMensagem('Produto não encontrado na lista atual. Atualize o painel e tente novamente.', false);
    return;
  }
  const nome = String(produto.nome || 'este produto');
  if (!confirmarEliminacao(`Eliminar o produto “${nome}”?`)) return;
  await httpsCallable(functions, 'eliminarProdutoVendedorAdmin')({ produtoId, confirmacao: 'ELIMINAR' });
  mostrarMensagem(`Produto “${nome}” eliminado com sucesso.`);
  $('detalheVendedor').hidden = true;
  await carregar();
}

async function eliminarCatalogoVendedorAdmin(vendedorId) {
  const vendedor = vendedores.find((item) => String(item.id) === String(vendedorId));
  if (!vendedor) {
    mostrarMensagem('Vendedor não encontrado na lista atual. Atualize o painel e tente novamente.', false);
    return;
  }
  const nomeLoja = String(vendedor.nomeLoja || vendedor.nome || 'esta loja');
  if (!confirmarEliminacao(`Eliminar todos os produtos da loja “${nomeLoja}”?`)) return;
  const resultado = await httpsCallable(functions, 'eliminarCatalogoVendedorAdmin')({ vendedorId, confirmacao: 'ELIMINAR' });
  const eliminados = Number(resultado?.data?.eliminados || 0);
  mostrarMensagem(`${eliminados} produto(s) da loja “${nomeLoja}” foram eliminados.`);
  $('detalheVendedor').hidden = true;
  await carregar();
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await signOut(auth); } catch (_) {}
  $('btnLoginVendedores').addEventListener('click', async () => {
    $('erroLoginVendedores').textContent = '';
    try {
      const credencial = await signInWithEmailAndPassword(auth, $('emailVendedores').value.trim(), $('senhaVendedores').value);
      if (!await validarAdmin(credencial.user)) throw new Error('Esta conta não possui acesso administrativo.');
      $('loginVendedores').hidden = true; $('painelVendedores').hidden = false;
      await carregar();
    } catch (erro) { try { await signOut(auth); } catch (_) {} $('erroLoginVendedores').textContent = erro.message || 'Não foi possível entrar.'; }
  });
  $('senhaVendedores').addEventListener('keydown', (evento) => { if (evento.key === 'Enter') $('btnLoginVendedores').click(); });
  $('btnAtualizarVendedores').addEventListener('click', () => carregar().catch((erro) => mostrarMensagem(erro.message || erro, false)));
  $('btnAtualizarVideos').addEventListener('click', () => carregarVideosParaModeracao());
  $('btnSairVendedores').addEventListener('click', async () => { await signOut(auth); location.reload(); });
  $('filtroVendedores').addEventListener('input', renderizar);
  $('statusVendedores').addEventListener('change', renderizar);
  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    const detalhe = evento.target.closest('[data-detalhe]');
    const video = evento.target.closest('[data-moderar-video]');
    const produto = evento.target.closest('[data-eliminar-produto-vendedor]');
    const disponibilidade = evento.target.closest('[data-disponibilidade-produto]');
    const catalogo = evento.target.closest('[data-limpar-catalogo]');
    if (botao) alterarVendedor(botao.dataset.id, botao.dataset.acao).catch((erro) => mostrarMensagem(erro.message || erro, false));
    if (detalhe) mostrarDetalheVendedor(detalhe.dataset.id, detalhe.dataset.detalhe);
    if (video) moderarVideo(video.dataset.moderarVideo, video.dataset.acaoVideo, video);
    if (produto) eliminarProdutoVendedorAdmin(produto.dataset.eliminarProdutoVendedor).catch((erro) => mostrarMensagem(erro.message || 'Não foi possível eliminar o produto.', false));
    if (disponibilidade) alterarDisponibilidadeProdutoAdmin(disponibilidade.dataset.disponibilidadeProduto, disponibilidade.dataset.acaoProduto).catch((erro) => mostrarMensagem(erro.message || 'Não foi possível alterar a disponibilidade do produto.', false));
    if (catalogo) eliminarCatalogoVendedorAdmin(catalogo.dataset.limparCatalogo).catch((erro) => mostrarMensagem(erro.message || 'Não foi possível limpar o catálogo.', false));
  });
});
