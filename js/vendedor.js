import { auth, db, storage, functions, supabase } from './config.js';
import { collection, doc, getDoc, getDocs, query, where, limit, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword, httpsCallable, ref, uploadToSignedUrl, getDownloadURL, validarPalavraPasseSegura } from './supabase-compat.js';
import { escapeHTML, extrairValorNumerico, imagemProdutoSegura, urlSegura } from './utils.js';
import { preencherCategoriaVendedor, preencherSubcategoria, preencherCategoriaProduto, nomeSubcategoria } from './categorias-vora.js';

const $ = (id) => document.getElementById(id);
const call = (name) => httpsCallable(functions, name);
const RASCUNHO_CHAVE = 'vora313:candidatura-vendedor';
let vendedor = null;
let produtos = [];
let pedidos = [];
let movimentos = [];
let levantamentos = [];
let destaques = [];
let avaliacaoDaLoja = { media: 0, total: 0 };
let viewAtual = 'resumo';
let modoRecuperacao = /(?:^|[?&#])type=recovery(?:&|#|$)/.test(location.href) || new URLSearchParams(location.search).has('code');

function mensagem(texto, ok = true) {
  const box = $('vendMensagem');
  if (!box) return;
  box.textContent = String(texto || '');
  box.className = `seller-message ${ok ? 'ok' : 'err'}`;
}

function erroTexto(erro) {
  return String(erro?.message || erro || 'Ocorreu um erro inesperado.');
}

function moeda(valor) {
  return `${new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor || 0))} Kz`;
}

function dataHora(valor) {
  if (!valor) return 'Sem data';
  const data = valor?.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Sem data' : data.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dataValor(valor) {
  const data = valor?.toDate ? valor.toDate() : new Date(valor || 0);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}

function iniciais(valor) {
  const letras = String(valor || 'Loja').trim().split(/\s+/).map((parte) => parte[0]).filter(Boolean).slice(0, 2).join('');
  return (letras || 'L').toUpperCase();
}

function perfilPublico() {
  return vendedor?.perfilPublico && typeof vendedor.perfilPublico === 'object' ? vendedor.perfilPublico : {};
}

function lojaAtiva() {
  return vendedor?.status === 'aprovado' && vendedor?.ativo !== false;
}

function estadoProduto(produto) {
  const estado = String(produto?.statusAprovacao || produto?.status_aprovacao || 'aguardando_aprovacao');
  if (estado === 'aprovado' && produto?.ativo === false) return 'desativado';
  return estado === 'aprovado' ? 'aprovado' : estado;
}

function nomeEstado(estado) {
  return ({ aprovado: 'Publicado', desativado: 'Desativado', aguardando_aprovacao: 'Em aprovação', recusado: 'Recusado', pendente: 'Pendente', suspenso: 'Suspenso', pago: 'Pago', em_preparacao: 'Em preparação', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado', aguardando_pagamento: 'Aguardando pagamento', ativo: 'Ativo', retido: 'Retido', disponivel: 'Disponível', reembolsado: 'Reembolsado', em_disputa: 'Em disputa', reembolso_solicitado: 'Reembolso solicitado', devolucao_em_transito: 'Devolução em trânsito', encerrado: 'Encerrado', concluido: 'Concluído' })[estado] || estado || 'Sem estado';
}

function classeEstado(estado) {
  if (['aprovado', 'entregue', 'pago', 'ativo'].includes(estado)) return 'approved';
  if (['recusado', 'suspenso', 'cancelado'].includes(estado)) return 'refused';
  return 'pending';
}

function alterarVisibilidade(id, mostrar) {
  const elemento = $(id);
  if (elemento) elemento.hidden = !mostrar;
}

function setTexto(id, valor) {
  const elemento = $(id);
  if (elemento) elemento.textContent = valor == null ? '' : String(valor);
}

function setValor(id, valor) {
  const elemento = $(id);
  if (elemento) elemento.value = valor == null ? '' : String(valor);
}

function mostrarImagem(idImagem, idFallback, url, fallback) {
  const imagem = $(idImagem);
  const texto = $(idFallback);
  const segura = urlSegura(url, '');
  if (!imagem || !texto) return;
  if (segura) {
    imagem.src = segura;
    imagem.style.display = 'block';
    texto.style.display = 'none';
  } else {
    imagem.removeAttribute('src');
    imagem.style.display = 'none';
    texto.textContent = fallback;
    texto.style.display = '';
  }
}

function guardarRascunho(dados) {
  try {
    const seguro = { nome: dados.nome || '', nomeLoja: dados.nomeLoja || '', telefone: dados.telefone || '', morada: dados.morada || '', categoria: dados.categoria || '', categoriaSubcategoria: dados.categoriaSubcategoria || '', descricao: dados.descricao || '', email: String(dados.email || '').trim().toLowerCase() };
    sessionStorage.setItem(RASCUNHO_CHAVE, JSON.stringify(seguro));
  } catch (_) {}
}

function obterRascunho() {
  try { return JSON.parse(sessionStorage.getItem(RASCUNHO_CHAVE) || 'null'); } catch (_) { return null; }
}

function limparRascunho() {
  try { sessionStorage.removeItem(RASCUNHO_CHAVE); } catch (_) {}
}

function mostrarCadastro() {
  alterarVisibilidade('vendCadastro', true);
  alterarVisibilidade('vendAuth', false);
  alterarVisibilidade('vendDashboard', false);
  alterarVisibilidade('vendRecuperacao', false);
  prepararFormularioCandidatura();
}

function mostrarLogin() {
  alterarVisibilidade('vendCadastro', false);
  alterarVisibilidade('vendAuth', true);
  alterarVisibilidade('vendDashboard', false);
  alterarVisibilidade('vendRecuperacao', false);
}

function mostrarRecuperacao() {
  alterarVisibilidade('vendCadastro', false);
  alterarVisibilidade('vendAuth', false);
  alterarVisibilidade('vendDashboard', false);
  alterarVisibilidade('vendRecuperacao', true);
}

function prepararCategoriasVendedor() {
  const candidatura = $('vendCategoria');
  const perfil = $('perfilCategoria');
  if (candidatura && !candidatura.dataset.taxonomia) {
    preencherCategoriaVendedor(candidatura, candidatura.value);
    candidatura.dataset.taxonomia = '1';
  }
  if (perfil && !perfil.dataset.taxonomia) {
    preencherCategoriaVendedor(perfil, perfil.value);
    perfil.dataset.taxonomia = '1';
  }
  preencherSubcategoria($('vendCategoriaSubcategoria'), candidatura?.value || '', $('vendCategoriaSubcategoria')?.value || '');
  preencherSubcategoria($('perfilCategoriaSubcategoria'), perfil?.value || '', $('perfilCategoriaSubcategoria')?.value || '');
  const produto = document.querySelector('#formProdutoVendedor select[name="categoria"]');
  if (produto && !produto.dataset.taxonomia) {
    preencherCategoriaProduto(produto, produto.value);
    produto.dataset.taxonomia = '1';
  }
  preencherSubcategoria($('vendProdutoSubcategoria'), produto?.value || '', $('vendProdutoSubcategoria')?.value || '');
}

function prepararFormularioCandidatura() {
  const user = auth.currentUser;
  const email = $('vendCadastroEmail');
  const senha = $('vendCadastroSenha');
  const senhaCampo = $('vendSenhaCampo');
  const nota = $('vendContaAtual');
  const trocar = $('btnTrocarConta');
  const rascunho = obterRascunho();
  const form = $('formVendedor');
  if (user?.email) {
    if (rascunho?.email && rascunho.email === String(user.email).toLowerCase()) {
      setValor('vendNome', rascunho.nome);
      setValor('vendLoja', rascunho.nomeLoja);
      setValor('vendTelefone', rascunho.telefone);
      setValor('vendMorada', rascunho.morada);
      setValor('vendCategoria', rascunho.categoria);
      preencherCategoriaVendedor($('vendCategoria'), rascunho.categoria || '');
      setValor('vendCategoriaSubcategoria', rascunho.categoriaSubcategoria || '');
      preencherSubcategoria($('vendCategoriaSubcategoria'), rascunho.categoria || '', rascunho.categoriaSubcategoria || '');
      setValor('vendDescricao', rascunho.descricao);
    }
    email.value = user.email;
    email.readOnly = true;
    email.required = false;
    senha.value = '';
    senha.required = false;
    senhaCampo.hidden = true;
    nota.textContent = `A candidatura será associada à conta autenticada: ${user.email}. Para usar outro e-mail, escolha “Usar outro e-mail”.`;
    nota.hidden = false;
    trocar.hidden = false;
  } else {
    email.readOnly = false;
    email.required = true;
    senha.required = true;
    senhaCampo.hidden = false;
    nota.hidden = true;
    trocar.hidden = true;
    if (!form.dataset.preenchido) form.reset();
  }
  form.dataset.preenchido = '1';
}

async function guardarTaxonomiaVendedor(subcategoria = '') {
  const valor = String(subcategoria || '').trim();
  if (!auth.currentUser?.id) return;
  try {
    await supabase.rpc('guardar_taxonomia_vendedor', { p_subcategoria: valor });
  } catch (_) {
    // Compatibilidade: se a migration de taxonomia ainda não foi publicada,
    // a categoria principal continua a funcionar normalmente.
  }
}

async function guardarSubcategoriaProduto(produtoId, subcategoria = '') {
  if (!produtoId) return;
  try {
    await supabase.rpc('guardar_subcategoria_produto_vendedor', { p_produto_id: String(produtoId), p_subcategoria: String(subcategoria || '').trim() });
  } catch (_) {
    // A subcategoria é opcional; falha da migration não impede guardar o produto.
  }
}

async function solicitarCandidatura(dados) {
  try {
    return await call('solicitarVendedor')({
      nome: dados.nome, nomeLoja: dados.nomeLoja, telefone: dados.telefone,
      morada: dados.morada || '', categoria: dados.categoria, descricao: dados.descricao || ''
    });
  } catch (erroEdge) {
    const { data, error } = await supabase.rpc('solicitar_candidatura_vendedor', {
      p_nome: dados.nome, p_nome_loja: dados.nomeLoja, p_telefone: dados.telefone,
      p_morada: dados.morada || '', p_categoria: dados.categoria, p_descricao: dados.descricao || ''
    });
    if (!error) return { data };
    throw new Error(`Não foi possível enviar a candidatura. A alternativa segura também falhou: ${erroTexto(error)}. Confirme que a migration 011 foi executada.`);
  }
}

async function guardarProduto(produto, produtoId) {
  try {
    return produtoId
      ? await call('atualizarProdutoVendedor')({ produtoId, produto })
      : await call('criarProdutoVendedor')(produto);
  } catch (erroEdge) {
    const { data, error } = await supabase.rpc('guardar_produto_vendedor', { p_produto: produto, p_produto_id: produtoId || null });
    if (!error) return { data };
    throw new Error(`Não foi possível guardar o produto. A alternativa segura também falhou: ${erroTexto(error)}. Confirme que a migration 011 foi executada.`);
  }
}

async function lerColecao(nome, filtros = []) {
  const referencia = collection(db, nome);
  const snapshot = await getDocs(filtros.length ? query(referencia, ...filtros) : referencia);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function carregarDadosLoja() {
  const vendedorId = auth.currentUser?.id;
  if (!vendedorId) return;
  const resultados = await Promise.allSettled([
    lerColecao('produtos', [where('vendedorId', '==', vendedorId)]),
    lerColecao('vendasVendedor', [where('uidVendedor', '==', vendedorId)]),
    lerColecao('movimentosVendedores', [where('uidVendedor', '==', vendedorId)]),
    lerColecao('levantamentos', [where('uidVendedor', '==', vendedorId)]),
    lerColecao('destaquesSolicitados', [where('uidVendedor', '==', vendedorId)])
  ]);
  const nomes = ['produtos', 'pedidos', 'movimentos', 'levantamentos', 'destaques'];
  const falhas = [];
  resultados.forEach((resultado, indice) => {
    if (resultado.status === 'fulfilled') {
      if (nomes[indice] === 'produtos') produtos = resultado.value;
      if (nomes[indice] === 'pedidos') pedidos = resultado.value;
      if (nomes[indice] === 'movimentos') movimentos = resultado.value;
      if (nomes[indice] === 'levantamentos') levantamentos = resultado.value;
      if (nomes[indice] === 'destaques') destaques = resultado.value;
    } else falhas.push(nomes[indice]);
  });
  if (falhas.length) mensagem(`Alguns dados não puderam ser atualizados agora: ${falhas.join(', ')}. Atualize a página dentro de instantes.`, false);
  await carregarAvaliacaoDaLoja();
}

async function carregarAvaliacaoDaLoja() {
  avaliacaoDaLoja = { media: 0, total: 0 };
  const ids = produtos.map((produto) => String(produto.id || '')).filter(Boolean);
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

async function carregarCentral() {
  const user = auth.currentUser;
  if (!user) return mostrarCadastro();
  const snapshot = await getDoc(doc(db, 'vendedores', user.id));
  if (!snapshot.exists()) {
    vendedor = null;
    mostrarCadastro();
    mensagem('A sua conta existe. Complete a candidatura para ela aparecer no painel do administrador.');
    return;
  }
  vendedor = { id: snapshot.id, ...snapshot.data() };
  alterarVisibilidade('vendCadastro', false);
  alterarVisibilidade('vendAuth', false);
  alterarVisibilidade('vendRecuperacao', false);
  alterarVisibilidade('vendDashboard', true);
  produtos = []; pedidos = []; movimentos = []; levantamentos = []; destaques = []; avaliacaoDaLoja = { media: 0, total: 0 };
  await carregarDadosLoja();
  renderizarCentral();
  abrirView(viewAtual, true);
}

function renderizarCentral() {
  if (!vendedor) return;
  const ativo = lojaAtiva();
  const perfil = perfilPublico();
  const nomeLoja = vendedor.nomeLoja || vendedor.nome || 'A sua loja';
  const letras = iniciais(nomeLoja);
  setTexto('vendNomeTopo', nomeLoja);
  setTexto('vendNomeLateral', nomeLoja);
  setTexto('vendResponsavel', String(vendedor.nome || nomeLoja).split(' ')[0]);
  mostrarImagem('vendTopoLogo', 'vendTopoIniciais', perfil.logoUrl, letras);
  mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', perfil.logoUrl, letras);
  const link = `loja.html?id=${encodeURIComponent(vendedor.id)}`;
  $('vendLinkLoja').href = link;
  $('vendLinkLoja2').href = link;
  $('vendLinkLoja').style.display = ativo ? '' : 'none';
  $('vendLinkLoja2').style.display = ativo ? '' : 'none';
  const aviso = $('vendAviso');
  aviso.textContent = ativo
    ? 'A loja está aprovada e ativa. Produtos novos ou editados ficam em aprovação antes de serem publicados.'
    : vendedor.status === 'recusado'
      ? `A candidatura foi recusada.${vendedor.motivoRecusa ? ` Motivo: ${vendedor.motivoRecusa}` : ' Atualize os dados e contacte a VORA 313 se precisar de orientação.'}`
      : vendedor.status === 'suspenso'
        ? 'A loja está suspensa. Contacte a VORA 313 para saber como reativar o acesso.'
        : 'A candidatura está pendente de aprovação. Pode completar a apresentação da loja enquanto aguarda.';
  preencherPerfil();
  renderizarResumo();
  renderizarProdutos();
  renderizarPedidos();
  renderizarFinancas();
  renderizarPromocoes();
  renderizarEstatisticas();
  renderizarConfiguracoes();
  document.querySelectorAll('[data-requer-loja-ativa]').forEach((item) => { item.disabled = !ativo; });
}

function preencherPerfil() {
  prepararCategoriasVendedor();
  const perfil = perfilPublico();
  setValor('perfilNome', vendedor.nome);
  setValor('perfilNomeLoja', vendedor.nomeLoja);
  setValor('perfilTelefone', vendedor.telefone);
  setValor('perfilMorada', vendedor.morada);
  setValor('perfilCategoria', vendedor.categoria || 'Outros');
  preencherCategoriaVendedor($('perfilCategoria'), vendedor.categoria || 'Outros');
  preencherSubcategoria($('perfilCategoriaSubcategoria'), vendedor.categoria || 'Outros', perfil.categoriaSubcategoria || '');
  setValor('perfilDescricao', vendedor.descricao);
  setValor('perfilLogoUrl', perfil.logoUrl);
  setValor('perfilCapaUrl', perfil.capaUrl);
  setValor('perfilHorario', perfil.horario);
  setValor('perfilInstagram', perfil.instagram);
  setValor('perfilDestaque', perfil.destaque);
  setValor('perfilEstiloVitrine', perfil.estiloVitrine || 'padrao');
  setValor('perfilEditorialColecao', perfil.editorialColecao);
  setValor('perfilEditorialTitulo', perfil.editorialTitulo);
  setValor('perfilEditorialChamada', perfil.editorialChamada);
  preencherProdutosEditorial(perfil.editorialProdutoId);
  atualizarEditorEditorial();
  const recebimento = vendedor.dadosRecebimento || {};
  setValor('vendMetodoRecebimento', recebimento.metodo);
  setValor('vendTitular', recebimento.titular);
  setValor('vendReferencia', recebimento.referencia);
}

function instalarEditorEditorial() {
  const formulario = $('formPerfilVendedor');
  const acoes = formulario?.querySelector('.seller-actions');
  if (!formulario || !acoes || $('perfilEstiloVitrine')) return;
  const bloco = document.createElement('section');
  bloco.className = 'seller-editorial-config seller-span-2';
  bloco.innerHTML = `
    <div class="seller-editorial-head"><div><span class="seller-eyebrow">Nova apresentação</span><h2>Vitrine da loja</h2><p>Escolha o padrão VORA, um tema automático da categoria ou uma apresentação editorial. Apenas produtos já publicados podem ser destacados.</p></div><span class="seller-editorial-mark" aria-hidden="true">✦</span></div>
    <label><span>Estilo da loja</span><select id="perfilEstiloVitrine" name="estiloVitrine"><option value="padrao">Padrão VORA — catálogo tradicional</option><option value="tema_categoria">Tema da categoria — cores automáticas</option><option value="editorial_moda">Editorial — Moda e roupa</option><option value="editorial_beleza">Editorial — Beleza e cosméticos</option><option value="editorial_livros">Editorial — Livros e cultura</option></select></label>
    <p id="temaCategoriaInfo" class="seller-tema-info" hidden></p>
    <div id="camposEditorial" class="seller-editorial-fields" hidden>
      <p class="seller-editorial-tip">Use na capa uma imagem vertical (proporção 4:5) para mostrar melhor vestidos, looks ou produtos. A imagem de capa da loja será usada aqui.</p>
      <label><span>Nome da edição / coleção</span><input id="perfilEditorialColecao" name="editorialColecao" maxlength="80" placeholder="Ex.: Coleção Primavera 2026"></label>
      <label><span>Primeiro produto da coleção</span><select id="perfilEditorialProdutoId" name="editorialProdutoId"><option value="">Selecionar produto publicado</option></select></label>
      <label class="seller-editorial-span"><span>Título da capa</span><input id="perfilEditorialTitulo" name="editorialTitulo" maxlength="120" placeholder="Ex.: Vestidos para ser vista por inteiro"></label>
      <label class="seller-editorial-span"><span>Texto da capa</span><textarea id="perfilEditorialChamada" name="editorialChamada" maxlength="320" placeholder="Explique em poucas palavras a coleção ou a rotina de produtos."></textarea></label>
    </div>`;
  acoes.before(bloco);
}

function atualizarEditorEditorial() {
  const estilo = $('perfilEstiloVitrine')?.value || 'padrao';
  const campos = $('camposEditorial');
  if (campos) campos.hidden = !estilo.startsWith('editorial_');
  const informacao = $('temaCategoriaInfo');
  if (!informacao) return;
  const categoria = $('perfilCategoria')?.value || vendedor?.categoria || 'a sua categoria';
  const descricoes = {
    Eletrónicos: 'Tecnologia: azul e grafite, com aparência limpa e moderna.',
    Moda: 'Moda: vinho, rosa suave e tons creme, com aparência editorial.',
    Beleza: 'Beleza: rosa e lilás, com aparência leve e elegante.',
    Casa: 'Casa: verde oliva, areia e tons acolhedores.',
    Automotivo: 'Automotivo: grafite e vermelho profundo, com aparência de showroom.',
    Games: 'Games: azul escuro e roxo, com contraste energético.'
  };
  informacao.hidden = estilo !== 'tema_categoria';
  informacao.textContent = descricoes[categoria] || `Será aplicado um tema seguro de acordo com a categoria “${categoria}”.`;
}

function preencherProdutosEditorial(idSelecionado = '') {
  const seletor = $('perfilEditorialProdutoId');
  if (!seletor) return;
  const publicados = produtos.filter((produto) => estadoProduto(produto) === 'aprovado');
  seletor.replaceChildren();
  const inicial = document.createElement('option');
  inicial.value = '';
  inicial.textContent = publicados.length ? 'Selecionar produto publicado' : 'Publique um produto para o destacar';
  seletor.append(inicial);
  publicados.forEach((produto) => {
    const opcao = document.createElement('option');
    opcao.value = String(produto.id || '');
    opcao.textContent = String(produto.nome || 'Produto');
    seletor.append(opcao);
  });
  const permitido = publicados.some((produto) => String(produto.id || '') === String(idSelecionado || ''));
  seletor.value = permitido ? String(idSelecionado) : '';
  seletor.disabled = !publicados.length;
}

function valorPedido(pedido) {
  return Number(pedido.valorVenda ?? pedido.valor_venda ?? pedido.valorVendedor ?? pedido.valor_vendedor ?? 0);
}

function renderizarResumo() {
  const publicados = produtos.filter((produto) => estadoProduto(produto) === 'aprovado').length;
  const emAprovacao = produtos.filter((produto) => estadoProduto(produto) === 'aguardando_aprovacao').length;
  const faturamento = pedidos.reduce((soma, pedido) => soma + valorPedido(pedido), 0);
  const grade = document.querySelector('#viewResumo .seller-kpi-grid');
  grade?.classList.add('seller-kpi-grid-dashboard');
  if (grade) grade.innerHTML = '<article><span>Produtos</span><strong id="kpiProdutos">—</strong><small id="kpiProdutosAjuda">A carregar</small></article><article><span>Em aprovação</span><strong id="kpiEmAprovacao">—</strong><small>A aguardar validação</small></article><article><span>Pedidos</span><strong id="kpiPedidos">—</strong><small>Vendas registadas</small></article><article><span>Faturamento</span><strong id="kpiFaturamento">—</strong><small>Valor das vendas</small></article><article><span>Saldo disponível</span><strong id="kpiSaldo">—</strong><small>Elegível para levantamento</small></article><article><span>Avaliações</span><strong id="kpiAvaliacao">—</strong><small id="kpiAvaliacaoAjuda">A carregar avaliações</small></article>';
  setTexto('kpiProdutos', produtos.length);
  setTexto('kpiProdutosAjuda', `${publicados} publicado${publicados === 1 ? '' : 's'}`);
  setTexto('kpiEmAprovacao', emAprovacao);
  setTexto('kpiPedidos', pedidos.length);
  setTexto('kpiFaturamento', moeda(faturamento));
  setTexto('kpiSaldo', moeda(vendedor.saldoDisponivel));
  setTexto('kpiAvaliacao', avaliacaoDaLoja.total ? `${avaliacaoDaLoja.media.toLocaleString('pt-AO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★` : '—');
  setTexto('kpiAvaliacaoAjuda', avaliacaoDaLoja.total ? `${avaliacaoDaLoja.total} avaliação${avaliacaoDaLoja.total === 1 ? '' : 'ões'} verificada${avaliacaoDaLoja.total === 1 ? '' : 's'}` : 'Ainda sem avaliações verificadas');
  setTexto('navProdutosCount', produtos.length);
  setTexto('navPedidosCount', pedidos.length);
  const logo = urlSegura(perfilPublico().logoUrl, '');
  const status = String(vendedor.status || 'pendente');
  $('resumoLoja').innerHTML = `<div class="seller-logo-summary">${logo ? `<img src="${escapeHTML(logo)}" alt="">` : escapeHTML(iniciais(vendedor.nomeLoja))}</div><div><strong>${escapeHTML(vendedor.nomeLoja || 'A sua loja')}</strong><p>${escapeHTML(vendedor.categoria || 'Categoria não definida')} · ${escapeHTML(vendedor.morada || 'Localização não informada')}</p><span class="seller-status ${classeEstado(status)}">${escapeHTML(nomeEstado(status))}</span></div>`;
  const recentes = [...pedidos].sort((a, b) => dataValor(b.criadoEm || b.criado_em) - dataValor(a.criadoEm || a.criado_em)).slice(0, 4);
  $('resumoPedidos').innerHTML = recentes.length ? recentes.map((pedido) => linhaPedido(pedido)).join('') : vazio('Ainda não há pedidos registados para esta loja.');
}

function vazio(texto) { return `<div class="seller-empty">${escapeHTML(texto)}</div>`; }

function linhaPedido(pedido) {
  const status = String(pedido.status || 'aguardando_pagamento');
  return `<div class="seller-row"><div><strong>${escapeHTML(pedido.codigoRastreio || pedido.codigo_rastreio || pedido.id || 'Pedido')}</strong><small>${escapeHTML(pedido.produtosResumo || pedido.produtos_resumo || 'Produtos da loja')} · ${escapeHTML(dataHora(pedido.criadoEm || pedido.criado_em))}</small></div><div><span class="seller-chip ${classeEstado(status)}">${escapeHTML(nomeEstado(status))}</span><b>${escapeHTML(moeda(valorPedido(pedido)))}</b></div></div>`;
}

function renderizarProdutos() {
  const busca = String($('filtroProdutosVendedor')?.value || '').trim().toLowerCase();
  const filtro = $('filtroEstadoProduto')?.value || 'todos';
  const lista = [...produtos].filter((produto) => {
    const estado = estadoProduto(produto);
    const texto = `${produto.nome || ''} ${produto.marca || ''} ${produto.categoria || ''}`.toLowerCase();
    return (filtro === 'todos' || estado === filtro) && (!busca || texto.includes(busca));
  }).sort((a, b) => dataValor(b.atualizadoEm || b.atualizado_em || b.criadoEm || b.criado_em) - dataValor(a.atualizadoEm || a.atualizado_em || a.criadoEm || a.criado_em));
  const box = $('vendProdutos');
  if (!lista.length) { box.innerHTML = vazio(produtos.length ? 'Nenhum produto corresponde ao filtro.' : 'Ainda não há produtos. Adicione o primeiro produto quando a loja for aprovada.'); return; }
  box.innerHTML = lista.map((produto) => {
    const imagem = imagemProdutoSegura(Array.isArray(produto.imagens) ? produto.imagens[0] : '', '');
    const estado = estadoProduto(produto);
    const motivo = produto.motivoRecusa || produto.motivo_recusa;
    const podeAlternar = ['aprovado', 'desativado'].includes(estado);
    const variacoes = Array.isArray(produto.variacoes) ? produto.variacoes.filter((grupo) => grupo?.nome).map((grupo) => grupo.nome).join(', ') : '';
    return `<article class="seller-product-row"><div class="seller-product-thumb">${imagem ? `<img src="${escapeHTML(imagem)}" alt="">` : '📦'}</div><div><h3>${escapeHTML(produto.nome || 'Produto sem nome')}</h3><p>${escapeHTML(produto.categoria || 'Sem categoria')}${produto.subcategoria ? ` · ${escapeHTML(nomeSubcategoria(produto.subcategoria))}` : ''} · ${escapeHTML(moeda(extrairValorNumerico(produto.preco || 0)))} · estoque ${escapeHTML(produto.estoque ?? 0)}</p><div class="seller-product-meta"><span class="seller-chip ${classeEstado(estado)}">${escapeHTML(nomeEstado(estado))}</span>${variacoes ? `<span class="seller-chip">Opções: ${escapeHTML(variacoes)}</span>` : ''}${produto.freteGratis ? '<span class="seller-chip">Frete grátis</span>' : ''}</div></div><div class="seller-product-actions"><a href="detalhe.html?id=${encodeURIComponent(produto.id)}" target="_blank" rel="noopener">Ver</a><button type="button" data-editar-produto="${escapeHTML(produto.id)}">Editar</button>${estado === 'aprovado' ? `<button type="button" data-destacar-produto="${escapeHTML(produto.id)}">Destacar</button>` : ''}${podeAlternar ? `<button type="button" data-alternar-produto="${escapeHTML(produto.id)}" data-produto-ativo="${estado === 'desativado' ? 'true' : 'false'}">${estado === 'desativado' ? 'Ativar' : 'Desativar'}</button>` : ''}</div>${estado === 'recusado' && motivo ? `<p class="seller-product-reason"><strong>Motivo da recusa:</strong> ${escapeHTML(motivo)}</p>` : ''}</article>`;
  }).join('');
}

function renderizarPedidos() {
  const estadoFiltro = $('filtroPedidosStatus')?.value || 'todos';
  const dias = Number($('filtroPedidosPeriodo')?.value || 0);
  const limite = dias ? Date.now() - dias * 86400000 : 0;
  const lista = [...pedidos].filter((pedido) => (estadoFiltro === 'todos' || pedido.status === estadoFiltro) && (!limite || dataValor(pedido.criadoEm || pedido.criado_em) >= limite)).sort((a, b) => dataValor(b.criadoEm || b.criado_em) - dataValor(a.criadoEm || a.criado_em));
  $('vendPedidos').innerHTML = lista.length ? lista.map(linhaPedido).join('') : vazio('Não há pedidos para os filtros selecionados.');
}

function nomeMovimentoFinanceiro(tipo) {
  return ({
    venda_pendente: 'Venda confirmada', entrega_confirmada: 'Entrega confirmada', venda_liberada: 'Saldo liberado',
    compensacao_divida: 'Compensação de saldo', levantamento_solicitado: 'Levantamento solicitado',
    levantamento_pago: 'Levantamento pago', levantamento_recusado: 'Levantamento recusado',
    disputa_aberta: 'Valor retido para disputa', disputa_liberada: 'Disputa resolvida a seu favor',
    reembolso_aprovado: 'Reembolso aprovado', cancelamento_reembolso: 'Cancelamento e estorno'
  })[tipo] || tipo || 'Movimento financeiro';
}

function nomeEstadoFinanceiro(estado) {
  return ({ pendente: 'Pendente de liberação', retido: 'Retido', disponivel: 'Disponível', reembolsado: 'Reembolsado', cancelado: 'Cancelado' })[estado] || nomeEstado(estado);
}

function renderizarFinancas() {
  const saldoDisponivel = Number(vendedor.saldoDisponivel || 0);
  const saldoPendente = Number(vendedor.saldoPendente || 0);
  const saldoRetido = Number(vendedor.saldoRetido || 0);
  const saldoPago = Number(vendedor.saldoPago || 0);
  const saldoDevedor = Number(vendedor.saldoDevedor || 0);
  setTexto('finSaldoDisponivel', moeda(saldoDisponivel));
  setTexto('finSaldoPendente', moeda(saldoPendente));
  setTexto('finSaldoRetido', moeda(saldoRetido));
  setTexto('finSaldoPago', moeda(saldoPago));

  const aviso = $('finAviso');
  if (saldoDevedor > 0) aviso.textContent = `Existe ${moeda(saldoDevedor)} em regularização por reembolso ou disputa. Este valor será compensado antes de um novo levantamento.`;
  else if (saldoRetido > 0) aviso.textContent = `${moeda(saldoRetido)} está reservado por um levantamento ou por uma análise de pós-venda.`;
  else aviso.textContent = '';

  const mov = [...movimentos].sort((a, b) => dataValor(b.criadoEm || b.criado_em) - dataValor(a.criadoEm || a.criado_em));
  $('vendMovimentos').innerHTML = mov.length ? mov.slice(0, 15).map((item) => {
    const valor = Number(item.valorVendedor ?? item.valor_vendedor ?? 0);
    const prefixo = valor > 0 ? '+' : valor < 0 ? '−' : '';
    const detalhes = item.detalhes && typeof item.detalhes === 'object' ? item.detalhes : {};
    const nota = detalhes.motivo || detalhes.nota || '';
    return `<div class="seller-row"><div><strong>${escapeHTML(nomeMovimentoFinanceiro(item.tipo))}</strong><small>${escapeHTML(item.codigoRastreio || item.codigo_rastreio || 'Sem pedido')} · ${escapeHTML(dataHora(item.criadoEm || item.criado_em))}${nota ? ` · ${escapeHTML(nota)}` : ''}</small></div><div><span class="seller-chip ${classeEstado(String(item.status || 'pendente'))}">${escapeHTML(nomeEstado(String(item.status || 'pendente')))}</span><b>${prefixo}${escapeHTML(moeda(Math.abs(valor)))}</b></div></div>`;
  }).join('') : vazio('Nenhum movimento financeiro foi registado ainda.');

  const pendentes = [...pedidos].filter((pedido) => ['pendente', 'retido'].includes(String(pedido.financeiroStatus || pedido.financeiro_status || 'pendente'))).sort((a, b) => dataValor(a.liberavelEm || a.liberavel_em) - dataValor(b.liberavelEm || b.liberavel_em));
  $('vendValoresPendentes').innerHTML = pendentes.length ? pendentes.map((pedido) => {
    const estado = String(pedido.financeiroStatus || pedido.financeiro_status || 'pendente');
    const liberavel = pedido.liberavelEm || pedido.liberavel_em;
    const detalhe = estado === 'retido' ? 'Aguarda a decisão da análise.' : liberavel ? `Liberação prevista após ${dataHora(liberavel)}.` : 'Aguarda confirmação de entrega.';
    return `<div class="seller-row"><div><strong>${escapeHTML(pedido.codigoRastreio || pedido.codigo_rastreio || 'Pedido')}</strong><small>${escapeHTML(pedido.produtosResumo || pedido.produtos_resumo || 'Produtos da loja')} · ${escapeHTML(detalhe)}</small></div><div><span class="seller-chip ${classeEstado(estado)}">${escapeHTML(nomeEstadoFinanceiro(estado))}</span><b>${escapeHTML(moeda(pedido.valorVendedor ?? pedido.valor_vendedor))}</b></div></div>`;
  }).join('') : vazio('Não há valores pendentes de liberação.');

  const lista = [...levantamentos].sort((a, b) => dataValor(b.criadoEm || b.criado_em) - dataValor(a.criadoEm || a.criado_em));
  $('vendLevantamentos').innerHTML = lista.length ? lista.map((item) => {
    const comprovativo = urlSegura(item.comprovativoUrl || item.comprovativo_url, '');
    const nota = item.notaAdmin || item.nota_admin;
    return `<div class="seller-row"><div><strong>${escapeHTML(moeda(item.valor))}</strong><small>${escapeHTML(dataHora(item.criadoEm || item.criado_em))}${nota ? ` · ${escapeHTML(nota)}` : ''}${comprovativo ? ` · <a href="${escapeHTML(comprovativo)}" target="_blank" rel="noopener">Comprovativo</a>` : ''}</small></div><span class="seller-chip ${classeEstado(String(item.status || 'pendente'))}">${escapeHTML(nomeEstado(String(item.status || 'pendente')))}</span></div>`;
  }).join('') : vazio('Nenhum levantamento foi solicitado.');
}

function renderizarPromocoes() {
  const publicados = produtos.filter((produto) => estadoProduto(produto) === 'aprovado');
  const seletor = $('vendProdutoDestaque');
  seletor.innerHTML = publicados.length ? '<option value="">Selecionar produto</option>' + publicados.map((produto) => `<option value="${escapeHTML(produto.id)}">${escapeHTML(produto.nome)}</option>`).join('') : '<option value="">Ainda não há produto publicado</option>';
  $('btnSolicitarDestaque').disabled = !publicados.length || !lojaAtiva();
  const lista = [...destaques].sort((a, b) => dataValor(b.criadoEm || b.criado_em) - dataValor(a.criadoEm || a.criado_em));
  $('vendDestaques').innerHTML = lista.length ? lista.map((item) => `<div class="seller-row"><div><strong>${escapeHTML(item.nomeProduto || item.nome_produto || 'Produto')}</strong><small>${escapeHTML(item.dias || '')} dias · ${escapeHTML(moeda(item.valor))}</small></div><span class="seller-chip ${classeEstado(String(item.status || 'pendente'))}">${escapeHTML(nomeEstado(String(item.status || 'pendente')))}</span></div>`).join('') : vazio('Ainda não existe nenhuma solicitação de destaque.');
}

function renderizarEstatisticas() {
  const vendasValidas = pedidos.filter((pedido) => pedido.status !== 'cancelado');
  const faturamento = vendasValidas.reduce((soma, pedido) => soma + valorPedido(pedido), 0);
  setTexto('estTicketMedio', moeda(vendasValidas.length ? faturamento / vendasValidas.length : 0));
  setTexto('estConcluidos', pedidos.filter((pedido) => pedido.status === 'entregue').length);
  setTexto('estPublicados', produtos.filter((produto) => estadoProduto(produto) === 'aprovado').length);
  const dias = Array.from({ length: 7 }, (_, indice) => {
    const data = new Date(); data.setHours(0, 0, 0, 0); data.setDate(data.getDate() - (6 - indice));
    return data;
  });
  const valores = dias.map((dia) => {
    const inicio = dia.getTime(); const fim = inicio + 86400000;
    return vendasValidas.filter((pedido) => { const valor = dataValor(pedido.criadoEm || pedido.criado_em); return valor >= inicio && valor < fim; }).reduce((soma, pedido) => soma + valorPedido(pedido), 0);
  });
  const maior = Math.max(...valores, 1);
  $('graficoVendasVendedor').innerHTML = dias.map((dia, indice) => `<div class="seller-bar"><strong>${escapeHTML(moeda(valores[indice]))}</strong><i style="height:${Math.max(4, Math.round((valores[indice] / maior) * 120))}px"></i><small>${escapeHTML(dia.toLocaleDateString('pt-AO', { weekday: 'short' }).replace('.', ''))}</small></div>`).join('');
}

function renderizarConfiguracoes() {
  const email = auth.currentUser?.email || vendedor.email || '—';
  $('vendDadosConta').innerHTML = `<div><dt>E-mail da conta</dt><dd>${escapeHTML(email)}</dd></div><div><dt>Plano</dt><dd>${escapeHTML(vendedor.plano || 'basico')}</dd></div><div><dt>Estado da loja</dt><dd>${escapeHTML(nomeEstado(vendedor.status || 'pendente'))}</dd></div>`;
}

function abrirView(nome, silencioso = false) {
  const existe = document.querySelector(`[data-view-panel="${nome}"]`);
  if (!existe) return;
  const exigeAprovacao = ['produtos', 'pedidos', 'financas', 'promocoes', 'estatisticas', 'configuracoes'].includes(nome);
  if (vendedor && exigeAprovacao && !lojaAtiva()) {
    if (!silencioso) mensagem('Esta área será liberada quando a loja for aprovada e ativada pela VORA 313.', false);
    nome = 'loja';
  }
  viewAtual = nome;
  document.querySelectorAll('[data-view-panel]').forEach((painel) => painel.classList.toggle('active', painel.dataset.viewPanel === nome));
  document.querySelectorAll('.seller-nav [data-view]').forEach((botao) => botao.classList.toggle('active', botao.dataset.view === nome));
  $('sellerSidebar').classList.remove('open');
  $('btnMenuVendedor').setAttribute('aria-expanded', 'false');
  if (nome === 'produtos') renderizarProdutos();
  if (nome === 'pedidos') renderizarPedidos();
}

async function enviarCadastro(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const dados = Object.fromEntries(new FormData(form));
  try {
    let user = auth.currentUser;
    if (!user) {
      validarPalavraPasseSegura(dados.senha);
      guardarRascunho(dados);
      const criado = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
      user = criado.user;
      if (!criado.session) {
        form.reset();
        $('vendLoginEmail').value = dados.email || '';
        mostrarLogin();
        mensagem('Conta criada. Confirme o e-mail e entre com a palavra-passe para concluir o envio da candidatura.');
        return;
      }
    }
    if (!user?.id) throw new Error('Não foi possível iniciar a sessão. Entre novamente para enviar a candidatura.');
    await solicitarCandidatura(dados);
    await guardarTaxonomiaVendedor(dados.categoriaSubcategoria || '');
    limparRascunho();
    mensagem('Candidatura enviada com sucesso. Aguarde a aprovação da VORA 313.');
    await carregarCentral();
  } catch (erro) {
    if (erro?.code === 'auth/email-already-in-use') {
      $('vendLoginEmail').value = dados.email || '';
      mostrarLogin();
      mensagem('Este e-mail já possui uma conta. Entre para continuar a candidatura.', false);
      return;
    }
    mensagem(erroTexto(erro), false);
  }
}

async function entrar(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  try { await signInWithEmailAndPassword(auth, dados.email, dados.senha); await carregarCentral(); }
  catch (erro) { mensagem(erroTexto(erro), false); }
}

async function trocarConta() {
  try {
    await signOut(auth); limparRascunho();
    $('formVendedor').reset(); $('formVendedor').dataset.preenchido = '';
    prepararFormularioCandidatura();
    mensagem('Sessão terminada. Agora pode criar ou usar outra conta de e-mail.');
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function recuperarSenha() {
  const email = String($('vendLoginEmail').value || auth.currentUser?.email || '').trim();
  if (!email) return mensagem('Informe o e-mail para receber o link de recuperação.', false);
  try {
    await sendPasswordResetEmail(auth, email, `${location.origin}${location.pathname}`);
    mensagem('Enviámos o link de recuperação. Abra-o no navegador para definir a nova palavra-passe.');
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function redefinirSenha(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  try { validarPalavraPasseSegura(dados.senha); }
  catch (erro) { return mensagem(erroTexto(erro), false); }
  if (dados.senha !== dados.confirmacao) return mensagem('As palavras-passe não coincidem.', false);
  try {
    await updatePassword(auth, dados.senha);
    modoRecuperacao = false;
    history.replaceState(null, '', location.pathname);
    await signOut(auth); mostrarLogin();
    mensagem('Palavra-passe alterada. Entre com a nova palavra-passe.');
  } catch (_) { mensagem('O link de recuperação expirou ou não é válido. Peça um novo link.', false); }
}

function variacoesParaTexto(variacoes) {
  if (!Array.isArray(variacoes)) return '';
  return variacoes.map((grupo) => {
    const nome = String(grupo?.nome || '').trim();
    const opcoes = Array.isArray(grupo?.opcoes) ? grupo.opcoes.map((opcao) => String(opcao?.nome || opcao || '').trim()).filter(Boolean) : [];
    return nome && opcoes.length ? `${nome}: ${opcoes.join(' | ')}` : '';
  }).filter(Boolean).join('\n');
}

function variacoesDoTexto(valor) {
  const nomes = new Set();
  const grupos = String(valor || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean).map((linha) => {
    const separador = linha.indexOf(':');
    if (separador < 1) throw new Error('Use o formato “Tamanho: P | M | G” para as variações.');
    const nome = linha.slice(0, separador).trim();
    const opcoes = linha.slice(separador + 1).split('|').map((opcao) => opcao.trim()).filter(Boolean);
    if (!nome || !opcoes.length) throw new Error('Cada variação deve ter um nome e pelo menos uma opção.');
    const chave = nome.toLocaleLowerCase('pt-AO');
    if (nomes.has(chave)) throw new Error('Não repita o mesmo tipo de variação.');
    nomes.add(chave);
    return { nome, obrigatoria: true, opcoes: opcoes.map((opcao) => ({ nome: opcao })) };
  });
  if (grupos.length > 3) throw new Error('Use no máximo três tipos de variação por produto.');
  return grupos;
}

function instalarCampoVariacoes(form) {
  if (!form || form.elements.namedItem('variacoes')) return;
  const descricao = form.elements.namedItem('descricao')?.closest('label');
  if (!descricao) return;
  const label = document.createElement('label');
  label.className = 'seller-span-2';
  label.innerHTML = '<span>Variações (opcional)</span><textarea name="variacoes" maxlength="500" placeholder="Uma linha por tipo. Ex.: Tamanho: P | M | G&#10;Cor: Preto | Branco | Azul"></textarea><small>O cliente escolhe as opções antes de adicionar. Nesta fase o estoque é total do produto.</small>';
  descricao.before(label);
}

function abrirEditorProduto(produto = null) {
  if (!lojaAtiva()) return mensagem('A loja precisa estar aprovada para gerir produtos.', false);
  const editor = $('produtoEditor'); const form = $('formProdutoVendedor');
  instalarCampoVariacoes(form);
  editor.hidden = false;
  form.reset(); form.dataset.editId = '';
  form.elements.namedItem('estoque').value = '1';
  setTexto('vendFormProdutoTitulo', produto ? 'Editar produto' : 'Novo produto');
  if (produto) {
    const dados = { nome: produto.nome, categoria: produto.categoria, subcategoria: produto.subcategoria || produto.categoriaSubcategoria || '', preco: produto.preco, precoAntigo: produto.precoAntigo, marca: produto.marca, sku: produto.sku, desconto: produto.desconto, parcelas: produto.parcelas, tag: produto.tag, estoque: produto.estoque, descricao: produto.descricao, imagens: (produto.imagens || []).join(', '), variacoes: variacoesParaTexto(produto.variacoes) };
    Object.entries(dados).forEach(([nome, valor]) => { const campo = form.elements.namedItem(nome); if (campo) campo.value = valor || ''; });
    form.elements.namedItem('freteGratis').checked = produto.freteGratis === true;
    form.dataset.editId = produto.id;
  }
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharEditorProduto() {
  $('produtoEditor').hidden = true;
  $('formProdutoVendedor').reset();
  $('formProdutoVendedor').dataset.editId = '';
}

async function salvarProduto(evento) {
  evento.preventDefault();
  if (!lojaAtiva()) return mensagem('A loja precisa estar aprovada para guardar produtos.', false);
  const form = evento.currentTarget; const dados = Object.fromEntries(new FormData(form));
  let variacoes;
  try { variacoes = variacoesDoTexto(dados.variacoes); }
  catch (erro) { return mensagem(erroTexto(erro), false); }
  const produto = { nome: dados.nome, categoria: dados.categoria, subcategoria: dados.subcategoria || '', preco: dados.preco, precoAntigo: dados.precoAntigo, desconto: dados.desconto, parcelas: dados.parcelas, marca: dados.marca, sku: dados.sku, tag: dados.tag, estoque: Number(dados.estoque), descricao: dados.descricao, imagens: String(dados.imagens || '').split(',').map((valor) => valor.trim()).filter(Boolean), variacoes, freteGratis: form.elements.namedItem('freteGratis').checked };
  try {
    const resultado = await guardarProduto(produto, form.dataset.editId || null);
    const produtoId = form.dataset.editId || resultado?.data?.produtoId || resultado?.data?.id || resultado?.produtoId || resultado?.id;
    await guardarSubcategoriaProduto(produtoId, dados.subcategoria || '');
    fecharEditorProduto();
    mensagem('Produto enviado para aprovação. Ele será publicado após a validação da VORA 313.');
    await carregarCentral();
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function enviarImagensProduto() {
  const input = $('vendImagemUpload');
  if (!input.files?.length) return mensagem('Selecione pelo menos uma imagem.', false);
  try {
    const urls = [];
    for (const arquivo of input.files) {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(arquivo.type)) throw new Error('Use imagem JPG, PNG, WEBP ou GIF.');
      if (arquivo.size > 5 * 1024 * 1024) throw new Error('Cada imagem deve ter no máximo 5 MB.');
      const { data: autorizacao } = await call('criarUploadAssinado')({ tipo: 'produto', mimeType: arquivo.type, tamanho: arquivo.size });
      const destino = ref(storage, autorizacao.caminho);
      await uploadToSignedUrl(destino, autorizacao.token, arquivo, { contentType: arquivo.type });
      urls.push(await getDownloadURL(destino));
    }
    $('vendImagens').value = [$('vendImagens').value, ...urls].filter(Boolean).join(', ');
    input.value = '';
    mensagem('Imagens enviadas. Clique em guardar produto para as associar ao catálogo.');
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function enviarLogo() {
  const input = $('perfilLogoUpload'); const arquivo = input.files?.[0];
  if (!arquivo) return mensagem('Selecione o logótipo da loja.', false);
  try {
    if (!/^image\/(jpeg|png|webp)$/i.test(arquivo.type)) throw new Error('Use imagem JPG, PNG ou WEBP.');
    if (arquivo.size > 2 * 1024 * 1024) throw new Error('O logótipo deve ter no máximo 2 MB.');
    const { data: autorizacao } = await call('criarUploadAssinado')({ tipo: 'logo', mimeType: arquivo.type, tamanho: arquivo.size });
    const destino = ref(storage, autorizacao.caminho);
    await uploadToSignedUrl(destino, autorizacao.token, arquivo, { contentType: arquivo.type });
    const url = await getDownloadURL(destino);
    setValor('perfilLogoUrl', url);
    mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', url, iniciais($('perfilNomeLoja').value || vendedor.nomeLoja));
    input.value = '';
    mensagem('Logótipo enviado. Guarde as informações da loja para o publicar.');
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function salvarPerfil(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  const perfil = {
    logoUrl: dados.logoUrl || '', capaUrl: dados.capaUrl || '', horario: dados.horario || '', instagram: dados.instagram || '', destaque: dados.destaque || '',
    estiloVitrine: dados.estiloVitrine || 'padrao', editorialColecao: dados.editorialColecao || '', editorialTitulo: dados.editorialTitulo || '',
    editorialChamada: dados.editorialChamada || '', editorialProdutoId: dados.editorialProdutoId || '',
    categoriaSubcategoria: dados.categoriaSubcategoria || ''
  };
  const parametros = { p_nome: dados.nome, p_nome_loja: dados.nomeLoja, p_telefone: dados.telefone, p_morada: dados.morada || '', p_categoria: dados.categoria, p_descricao: dados.descricao || '', p_perfil_publico: perfil };
  try {
    const { error } = await supabase.rpc('atualizar_perfil_central_vendedor', parametros);
    if (error) {
      await call('atualizarPerfilVendedor')({ nome: dados.nome, nomeLoja: dados.nomeLoja, telefone: dados.telefone, morada: dados.morada || '', categoria: dados.categoria, descricao: dados.descricao || '', perfilPublico: perfil });
    }
    await guardarTaxonomiaVendedor(dados.categoriaSubcategoria || '');
    mensagem('Informações da loja atualizadas.');
    await carregarCentral();
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function salvarRecebimento(evento) {
  evento.preventDefault();
  if (!lojaAtiva()) return mensagem('A loja precisa estar aprovada para guardar dados de recebimento.', false);
  const metodo = $('vendMetodoRecebimento').value; const titular = $('vendTitular').value.trim(); const referencia = $('vendReferencia').value.trim();
  try {
    const { error } = await supabase.rpc('atualizar_recebimento_central_vendedor', { p_metodo: metodo, p_titular: titular, p_referencia: referencia });
    if (error) await call('atualizarDadosRecebimento')({ metodo, titular, referencia });
    mensagem('Dados de recebimento guardados com segurança.');
    await carregarCentral();
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function solicitarLevantamento() {
  if (!lojaAtiva()) return mensagem('A loja precisa estar aprovada para solicitar levantamentos.', false);
  const campoValor = $('vendValorLevantamento');
  const bruto = String(campoValor?.value || '').trim().replace(',', '.');
  const valor = bruto ? Number(bruto) : null;
  if (bruto && (!Number.isFinite(valor) || valor < 5000)) return mensagem('Informe um valor igual ou superior a 5.000,00 Kz.', false);
  try {
    const resultado = await call('solicitarLevantamento')({ valor });
    const valor = resultado?.data?.valor ?? vendedor.saldoDisponivel;
    if (campoValor) campoValor.value = '';
    mensagem(`Levantamento solicitado: ${moeda(valor)}. A VORA 313 processará o pedido em até 3 dias úteis.`);
    await carregarCentral();
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

async function solicitarDestaque() {
  const produtoId = $('vendProdutoDestaque').value; const dias = Number($('vendDiasDestaque').value);
  if (!produtoId) return mensagem('Selecione um produto publicado.', false);
  try { await call('solicitarDestaque')({ produtoId, dias }); mensagem('Solicitação de destaque enviada. A ativação depende da confirmação do pagamento.'); await carregarCentral(); }
  catch (erro) { mensagem(erroTexto(erro), false); }
}

async function alterarDisponibilidadeProduto(produtoId, ativo) {
  if (!lojaAtiva()) return mensagem('A loja precisa estar aprovada para gerir produtos.', false);
  try {
    const { error } = await supabase.rpc('definir_disponibilidade_produto_vendedor', { p_produto_id: produtoId, p_ativo: ativo });
    if (error) await call('alterarDisponibilidadeProdutoVendedor')({ produtoId, ativo });
    mensagem(ativo ? 'Produto reativado na loja pública.' : 'Produto desativado. Ele deixou de aparecer na loja pública.');
    await carregarCentral();
  } catch (erro) { mensagem(erroTexto(erro), false); }
}

function ligarEventos() {
  prepararCategoriasVendedor();
  instalarEditorEditorial();
  $('formVendedor').addEventListener('submit', enviarCadastro);
  $('formLoginVendedor').addEventListener('submit', entrar);
  $('formRedefinirSenha').addEventListener('submit', redefinirSenha);
  $('formPerfilVendedor').addEventListener('submit', salvarPerfil);
  $('formProdutoVendedor').addEventListener('submit', salvarProduto);
  $('formRecebimento').addEventListener('submit', salvarRecebimento);
  $('btnMostrarLogin').addEventListener('click', mostrarLogin);
  $('btnMostrarCadastro').addEventListener('click', mostrarCadastro);
  $('btnTrocarConta').addEventListener('click', trocarConta);
  $('btnRecuperarSenha').addEventListener('click', recuperarSenha);
  $('btnRecuperarSenhaConfig').addEventListener('click', recuperarSenha);
  $('btnSairVendedor').addEventListener('click', () => signOut(auth));
  $('btnNovoProduto').addEventListener('click', () => abrirEditorProduto());
  $('btnFecharProduto').addEventListener('click', fecharEditorProduto);
  $('btnCancelarProduto').addEventListener('click', fecharEditorProduto);
  $('btnUploadVendedor').addEventListener('click', enviarImagensProduto);
  $('btnLogoUpload').addEventListener('click', enviarLogo);
  $('btnLevantamento').addEventListener('click', solicitarLevantamento);
  $('btnSolicitarDestaque').addEventListener('click', solicitarDestaque);
  $('filtroProdutosVendedor').addEventListener('input', renderizarProdutos);
  $('filtroEstadoProduto').addEventListener('change', renderizarProdutos);
  $('filtroPedidosStatus').addEventListener('change', renderizarPedidos);
  $('filtroPedidosPeriodo').addEventListener('change', renderizarPedidos);
  $('perfilLogoUrl').addEventListener('input', () => mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', $('perfilLogoUrl').value, iniciais($('perfilNomeLoja').value || vendedor?.nomeLoja)));
  $('perfilEstiloVitrine')?.addEventListener('change', atualizarEditorEditorial);
  $('perfilCategoria')?.addEventListener('change', () => {
    preencherSubcategoria($('perfilCategoriaSubcategoria'), $('perfilCategoria').value);
    atualizarEditorEditorial();
  });
  $('vendCategoria')?.addEventListener('change', () => preencherSubcategoria($('vendCategoriaSubcategoria'), $('vendCategoria').value));
  document.querySelector('#formProdutoVendedor select[name="categoria"]')?.addEventListener('change', (evento) => preencherSubcategoria($('vendProdutoSubcategoria'), evento.currentTarget.value));
  $('btnMenuVendedor').addEventListener('click', () => { const aberto = $('sellerSidebar').classList.toggle('open'); $('btnMenuVendedor').setAttribute('aria-expanded', String(aberto)); });
  document.addEventListener('click', (evento) => {
    const nav = evento.target.closest('[data-view]');
    const ir = evento.target.closest('[data-go]');
    const editar = evento.target.closest('[data-editar-produto]');
    const destacar = evento.target.closest('[data-destacar-produto]');
    const alternar = evento.target.closest('[data-alternar-produto]');
    if (nav) abrirView(nav.dataset.view);
    if (ir) abrirView(ir.dataset.go);
    if (editar) { const produto = produtos.find((item) => String(item.id) === String(editar.dataset.editarProduto)); if (produto) { abrirView('produtos'); abrirEditorProduto(produto); } }
    if (destacar) { abrirView('promocoes'); $('vendProdutoDestaque').value = destacar.dataset.destacarProduto; }
    if (alternar) alterarDisponibilidadeProduto(alternar.dataset.alternarProduto, alternar.dataset.produtoAtivo === 'true');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ligarEventos();
  if (modoRecuperacao) mostrarRecuperacao();
  onAuthStateChanged(auth, (user) => {
    if (modoRecuperacao) return mostrarRecuperacao();
    if (user) carregarCentral().catch((erro) => mensagem(erroTexto(erro), false));
    else { vendedor = null; mostrarCadastro(); }
  });
});
