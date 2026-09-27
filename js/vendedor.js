import { auth, db, storage, functions, supabase } from './config.js';
import { collection, doc, getDoc, getDocs, query, where, limit } from './supabase-compat.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, getIdToken, sendPasswordResetEmail, updatePassword } from './supabase-compat.js';
import { httpsCallable } from './supabase-compat.js';
import { ref, uploadBytes, getDownloadURL } from './supabase-compat.js';
import { escapeHTML, extrairValorNumerico, urlSegura } from './utils.js';

const $ = (id) => document.getElementById(id);
const call = (name) => httpsCallable(functions, name);
const money = (value) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' Kz';
let vend = null;
let produtos = [];
let recuperacaoAtiva = /(?:^|[?&#])type=recovery(?:&|#|$)/.test(location.href) || new URLSearchParams(location.search).has('code');

function msg(texto, ok = true) {
  const box = $('vendMensagem');
  if (!box) return;
  box.textContent = texto;
  box.className = 'seller-message ' + (ok ? 'ok' : 'err');
}

function erroTexto(erro) {
  return String(erro?.message || erro || 'Erro desconhecido.');
}

function textoSeguro(valor, max = 300) {
  return String(valor || '').trim().slice(0, max);
}

function iniciais(nome) {
  const letras = String(nome || 'Loja').trim().split(/\s+/).map((parte) => parte[0]).filter(Boolean).slice(0, 2).join('');
  return (letras || 'L').toUpperCase();
}

function perfilPublico() {
  const perfil = vend?.perfilPublico || {};
  return perfil && typeof perfil === 'object' ? perfil : {};
}

function imagemSegura(valor) {
  return urlSegura(String(valor || '').trim(), '');
}

function mostrarImagem(idImagem, idFallback, url, fallback) {
  const imagem = $(idImagem);
  const texto = $(idFallback);
  const segura = imagemSegura(url);
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

function telas(authOk) {
  $('vendAuth').style.display = authOk ? 'none' : '';
  $('vendCadastro').style.display = 'none';
  $('vendDashboard').style.display = authOk ? 'block' : 'none';
  $('vendRecuperacao').style.display = 'none';
}

function mostrarRecuperacaoSenha() {
  telas(false);
  $('vendAuth').style.display = 'none';
  $('vendRecuperacao').style.display = 'block';
}

async function solicitarCandidatura(dados) {
  try {
    return await call('solicitarVendedor')({
      nome: dados.nome,
      nomeLoja: dados.nomeLoja,
      telefone: dados.telefone,
      email: auth.currentUser?.email,
      morada: dados.morada,
      categoria: dados.categoria,
      descricao: dados.descricao
    });
  } catch (erroEdge) {
    const { data, error } = await supabase.rpc('solicitar_candidatura_vendedor', {
      p_nome: dados.nome,
      p_nome_loja: dados.nomeLoja,
      p_telefone: dados.telefone,
      p_morada: dados.morada || '',
      p_categoria: dados.categoria,
      p_descricao: dados.descricao || ''
    });
    if (!error) return { data };
    throw new Error(`Não foi possível enviar a candidatura. A Edge Function falhou (${erroTexto(erroEdge)}) e a alternativa do Supabase também falhou (${erroTexto(error)}). Execute a migration 011 e tente novamente.`);
  }
}

async function guardarProdutoComAlternativa(produto, id) {
  try {
    if (id) return await call('atualizarProdutoVendedor')({ produtoId: id, produto });
    return await call('criarProdutoVendedor')(produto);
  } catch (erroEdge) {
    const { data, error } = await supabase.rpc('guardar_produto_vendedor', { p_produto: produto, p_produto_id: id || null });
    if (!error) return { data };
    throw new Error(`Não foi possível guardar o produto. A Edge Function falhou (${erroTexto(erroEdge)}) e a alternativa do Supabase também falhou (${erroTexto(error)}). Execute a migration 011 e tente novamente.`);
  }
}

function prepararCadastroContaAtual() {
  const user = auth.currentUser;
  const emailInput = $('vendCadastroEmail');
  const senhaInput = $('vendCadastroSenha');
  const aviso = $('vendContaAtual');
  const trocar = $('btnTrocarConta');
  if (user?.email && emailInput) {
    emailInput.value = user.email;
    emailInput.readOnly = true;
    emailInput.required = false;
    senhaInput.value = '';
    senhaInput.style.display = 'none';
    senhaInput.required = false;
    aviso.textContent = `A candidatura será ligada à conta atualmente iniciada: ${user.email}.`;
    aviso.style.display = 'block';
    trocar.style.display = 'inline-flex';
    return;
  }
  if (emailInput) { emailInput.readOnly = false; emailInput.required = true; }
  if (senhaInput) { senhaInput.style.display = ''; senhaInput.required = true; }
  if (aviso) aviso.style.display = 'none';
  if (trocar) trocar.style.display = 'none';
}

async function carregar() {
  const user = auth.currentUser;
  if (!user) return;
  const snapshot = await getDoc(doc(db, 'vendedores', user.id));
  if (!snapshot.exists()) {
    telas(true);
    $('vendDashboard').style.display = 'none';
    $('vendCadastro').style.display = 'block';
    prepararCadastroContaAtual();
    msg('A sua conta existe, mas ainda não há candidatura de vendedor. Complete o formulário e envie a candidatura para aparecer no painel do administrador.');
    return;
  }
  vend = { id: snapshot.id, ...snapshot.data() };
  telas(true);
  render();
  if (vend.status === 'aprovado' && vend.ativo !== false) {
    try { await getIdToken(user, true); } catch (_) {}
    await Promise.all([carregarProdutos(), carregarPedidos(), carregarDestaques()]);
  }
}

function render() {
  const nome = vend.nomeLoja || vend.nome || 'A sua loja';
  const user = auth.currentUser;
  const perfil = perfilPublico();
  const letras = iniciais(nome);
  mostrarImagem('vendTopoLogo', 'vendTopoIniciais', perfil.logoUrl, letras);
  mostrarImagem('vendLogoResumo', 'vendIniciaisResumo', perfil.logoUrl, letras);
  mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', perfil.logoUrl, letras);
  $('vendNomeTopo').textContent = nome;
  $('vendNomeLoja').textContent = nome;
  $('vendLinkLoja').href = 'loja.html?id=' + encodeURIComponent(vend.id);
  $('vendStatus').textContent = vend.status || 'pendente';
  $('vendSaldo').textContent = money(vend.saldoDisponivel);
  $('vendVendas').textContent = String(Number(vend.totalVendas || 0));
  $('vendProdutosResumo').textContent = String(Number(vend.totalProdutos || 0));
  $('perfilNome').value = vend.nome || '';
  $('perfilNomeLoja').value = vend.nomeLoja || '';
  $('perfilTelefone').value = vend.telefone || '';
  $('perfilMorada').value = vend.morada || '';
  $('perfilCategoria').value = vend.categoria || 'Outros';
  $('perfilDescricao').value = vend.descricao || '';
  $('perfilLogoUrl').value = perfil.logoUrl || '';
  $('perfilCapaUrl').value = perfil.capaUrl || '';
  $('perfilHorario').value = perfil.horario || '';
  $('perfilInstagram').value = perfil.instagram || '';
  $('perfilDestaque').value = perfil.destaque || '';
  const dadosRecebimento = vend.dadosRecebimento || {};
  $('vendMetodoRecebimento').value = dadosRecebimento.metodo || '';
  $('vendTitular').value = dadosRecebimento.titular || '';
  $('vendReferencia').value = dadosRecebimento.referencia || '';
  const emailInput = $('vendCadastroEmail');
  const senhaInput = $('vendCadastroSenha');
  if (emailInput && user) { emailInput.value = user.email || vend.email || ''; emailInput.readOnly = true; emailInput.required = false; }
  if (senhaInput && user) { senhaInput.style.display = 'none'; senhaInput.required = false; }
  const ativo = vend.status === 'aprovado' && vend.ativo !== false;
  $('vendAviso').textContent = ativo
    ? 'A sua loja está ativa. Produtos novos ficam em revisão antes de serem publicados na VORA 313.'
    : 'A sua loja ainda precisa de aprovação pela VORA 313. Pode completar os dados de marca enquanto aguarda.';
  document.querySelectorAll('[data-aprovado]').forEach((elemento) => { elemento.style.display = ativo ? '' : 'none'; });
}

function estadoProduto(produto) {
  return produto.statusAprovacao === 'aprovado' && produto.ativo === true ? 'Publicado' : (produto.statusAprovacao === 'recusado' ? 'Recusado' : 'Em aprovação');
}

function imagemProduto(produto) {
  const primeira = Array.isArray(produto.imagens) ? produto.imagens[0] : '';
  return imagemSegura(primeira);
}

function renderProdutos() {
  const box = $('vendProdutos');
  $('vendProdutosCount').textContent = String(produtos.length);
  $('vendProdutosResumo').textContent = String(produtos.length);
  if (!produtos.length) {
    box.innerHTML = '<div class="seller-product-empty">Ainda não há produtos nesta loja. Use o formulário acima para enviar o primeiro produto para aprovação.</div>';
    return;
  }
  box.innerHTML = produtos.map((produto) => {
    const imagem = imagemProduto(produto);
    const publicado = produto.statusAprovacao === 'aprovado' && produto.ativo === true;
    return `<article class="seller-product-row">
      <div class="seller-product-thumb">${imagem ? `<img src="${escapeHTML(imagem)}" alt="">` : '📦'}</div>
      <div><h3>${escapeHTML(produto.nome || 'Produto sem nome')}</h3><p>${escapeHTML(produto.categoria || 'Sem categoria')} · ${escapeHTML(money(extrairValorNumerico(produto.preco)))} · estoque ${escapeHTML(produto.estoque ?? 0)}</p><span class="seller-product-state ${publicado ? 'approved' : ''}">${escapeHTML(estadoProduto(produto))}</span></div>
      <div class="seller-product-actions"><button type="button" data-edit="${escapeHTML(produto.id)}">Editar</button>${publicado ? `<button type="button" data-select-dest="${escapeHTML(produto.id)}">Destacar</button>` : ''}</div>
    </article>`;
  }).join('');
}

function preencherSelecaoDestaque() {
  const select = $('vendProdutoDestaque');
  const publicados = produtos.filter((produto) => produto.statusAprovacao === 'aprovado' && produto.ativo === true);
  select.innerHTML = publicados.length
    ? '<option value="">Selecione um produto</option>' + publicados.map((produto) => `<option value="${escapeHTML(produto.id)}">${escapeHTML(produto.nome)}</option>`).join('')
    : '<option value="">Ainda não há produto publicado</option>';
  select.disabled = !publicados.length;
  $('btnSolicitarDestaque').disabled = !publicados.length;
}

async function carregarProdutos() {
  const snapshot = await getDocs(query(collection(db, 'produtos'), where('vendedorId', '==', auth.currentUser.id)));
  produtos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  renderProdutos();
  preencherSelecaoDestaque();
}

function renderListaVazia(id, texto) {
  const box = $(id);
  box.innerHTML = `<div class="seller-list-empty">${escapeHTML(texto)}</div>`;
}

async function carregarPedidos() {
  try {
    const snapshot = await getDocs(query(collection(db, 'vendasVendedor'), where('uidVendedor', '==', auth.currentUser.id), limit(5)));
    if (snapshot.empty) return renderListaVazia('vendPedidos', 'Nenhum pedido registado ainda.');
    $('vendPedidos').innerHTML = snapshot.docs.map((item) => {
      const pedido = item.data();
      return `<div class="seller-mini-row"><div><strong>${escapeHTML(pedido.codigoRastreio || item.id)}</strong><small>${escapeHTML(pedido.produtosResumo || 'Pedido VORA 313')}</small></div><b>${escapeHTML(money(pedido.valorVendedor))}</b></div>`;
    }).join('');
  } catch (_) { renderListaVazia('vendPedidos', 'Não foi possível carregar pedidos agora.'); }
}

async function carregarDestaques() {
  try {
    const snapshot = await getDocs(query(collection(db, 'destaquesSolicitados'), where('uidVendedor', '==', auth.currentUser.id), limit(5)));
    if (snapshot.empty) return renderListaVazia('vendDestaques', 'Nenhuma solicitação em andamento.');
    $('vendDestaques').innerHTML = snapshot.docs.map((item) => {
      const destaque = item.data();
      return `<div class="seller-mini-row"><div><strong>${escapeHTML(destaque.nomeProduto || destaque.produtoId)}</strong><small>${escapeHTML(destaque.status || 'pendente')}</small></div><b>${escapeHTML(destaque.dias || '')} dias</b></div>`;
    }).join('');
  } catch (_) { renderListaVazia('vendDestaques', 'Não foi possível carregar destaques agora.'); }
}

async function cadastro(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  try {
    let user = auth.currentUser;
    if (!user) {
      const criado = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
      user = criado.user;
      if (!criado.session) {
        $('vendLoginEmail').value = dados.email || '';
        $('btnMostrarLogin').click();
        msg('Conta criada. Confirme o e-mail e depois entre para enviar a candidatura.');
        return;
      }
      try { await updateProfile(user, { displayName: dados.nomeLoja }); } catch (_) {}
    }
    if (!user?.id) throw new Error('Não foi possível confirmar a sessão. Entre novamente para enviar a candidatura.');
    await solicitarCandidatura(dados);
    msg('Candidatura enviada. Aguarde a aprovação.');
    await carregar();
  } catch (erro) {
    if (erro?.code === 'auth/email-already-in-use') {
      $('vendCadastroEmail').value = dados.email || '';
      $('vendLoginEmail').value = dados.email || '';
      $('btnMostrarLogin').click();
      msg('Este e-mail já possui uma conta. Entre para continuar a candidatura.', false);
      return;
    }
    msg(erroTexto(erro), false);
  }
}

async function login(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  try { await signInWithEmailAndPassword(auth, dados.email, dados.senha); await carregar(); }
  catch (erro) { msg(erroTexto(erro), false); }
}

async function trocarConta() {
  try { await signOut(auth); $('formVendedor').reset(); prepararCadastroContaAtual(); msg('Sessão terminada. Agora pode usar outro e-mail.'); }
  catch (erro) { msg(erroTexto(erro), false); }
}

async function recuperarSenha() {
  const email = $('vendLoginEmail').value.trim();
  if (!email) return msg('Digite o e-mail para recuperar a palavra-passe.', false);
  try {
    await sendPasswordResetEmail(auth, email, `${location.origin}${location.pathname}`);
    msg('Enviámos as instruções de recuperação. Abra o link no mesmo navegador para definir a nova palavra-passe.');
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function redefinirSenha(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  if (String(dados.senha || '').length < 6) return msg('A palavra-passe deve ter pelo menos 6 caracteres.', false);
  if (dados.senha !== dados.confirmacao) return msg('As palavras-passe não coincidem.', false);
  try {
    await updatePassword(auth, dados.senha);
    recuperacaoAtiva = false;
    history.replaceState(null, '', location.pathname);
    await signOut(auth);
    telas(false);
    $('vendAuth').style.display = 'grid';
    msg('Palavra-passe alterada. Entre com a nova palavra-passe.');
  } catch (erro) { msg('O link de recuperação expirou ou não é válido. Peça um novo link.', false); }
}

async function produto(evento) {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const dados = Object.fromEntries(new FormData(formulario));
  const produtoNovo = {
    nome: dados.nome,
    categoria: dados.categoria,
    preco: dados.preco,
    precoAntigo: dados.precoAntigo,
    desconto: dados.desconto,
    parcelas: dados.parcelas,
    marca: dados.marca,
    sku: dados.sku,
    tag: dados.tag,
    estoque: Number(dados.estoque),
    descricao: dados.descricao,
    imagens: String(dados.imagens || '').split(',').map((valor) => valor.trim()).filter(Boolean),
    freteGratis: formulario.querySelector('[name=freteGratis]').checked
  };
  try {
    await guardarProdutoComAlternativa(produtoNovo, formulario.dataset.editId || null);
    formulario.reset();
    formulario.querySelector('[name=estoque]').value = '1';
    delete formulario.dataset.editId;
    $('vendFormProdutoTitulo').textContent = 'Adicionar produto';
    msg('Produto enviado para aprovação.');
    await carregarProdutos();
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function uploadImagensProduto() {
  const input = $('vendImagemUpload');
  if (!input.files.length) return msg('Selecione pelo menos uma imagem.', false);
  try {
    const urls = [];
    for (const arquivo of input.files) {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(arquivo.type)) throw new Error('Use imagem JPG, PNG, WEBP ou GIF.');
      if (arquivo.size > 5 * 1024 * 1024) throw new Error('Cada imagem deve ter no máximo 5 MB.');
      const destino = ref(storage, `vendedores/${auth.currentUser.id}/produtos/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      await uploadBytes(destino, arquivo, { contentType: arquivo.type });
      urls.push(await getDownloadURL(destino));
    }
    $('vendImagens').value = [$('vendImagens').value, ...urls].filter(Boolean).join(', ');
    input.value = '';
    msg('Imagens enviadas. Elas serão usadas ao guardar o produto.');
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function uploadLogo() {
  const input = $('perfilLogoUpload');
  const arquivo = input.files?.[0];
  if (!arquivo) return msg('Selecione o logótipo da loja.', false);
  try {
    if (!/^image\/(jpeg|png|webp)$/i.test(arquivo.type)) throw new Error('Use uma imagem JPG, PNG ou WEBP.');
    if (arquivo.size > 2 * 1024 * 1024) throw new Error('O logótipo deve ter no máximo 2 MB.');
    const extensao = arquivo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'png';
    const destino = ref(storage, `vendedores/${auth.currentUser.id}/perfil/logo_${Date.now()}.${extensao}`);
    await uploadBytes(destino, arquivo, { contentType: arquivo.type });
    const url = await getDownloadURL(destino);
    $('perfilLogoUrl').value = url;
    const letras = iniciais($('perfilNomeLoja').value || vend?.nomeLoja);
    mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', url, letras);
    input.value = '';
    msg('Logótipo enviado. Clique em “Guardar perfil público” para o publicar na sua loja.');
  } catch (erro) { msg(erroTexto(erro), false); }
}

function editarProduto(id) {
  const produtoAtual = produtos.find((produto) => String(produto.id) === String(id));
  if (!produtoAtual) return;
  const formulario = $('formProdutoVendedor');
  const dados = { nome: produtoAtual.nome || '', categoria: produtoAtual.categoria || 'eletronicos', preco: produtoAtual.preco || '', precoAntigo: produtoAtual.precoAntigo || '', desconto: produtoAtual.desconto || '', parcelas: produtoAtual.parcelas || '', marca: produtoAtual.marca || '', sku: produtoAtual.sku || '', tag: produtoAtual.tag || '', estoque: produtoAtual.estoque ?? 0, descricao: produtoAtual.descricao || '', imagens: (produtoAtual.imagens || []).join(', ') };
  for (const [chave, valor] of Object.entries(dados)) {
    const campo = formulario.elements.namedItem(chave);
    if (campo) campo.value = valor;
  }
  formulario.elements.namedItem('freteGratis').checked = produtoAtual.freteGratis === true;
  formulario.dataset.editId = produtoAtual.id;
  formulario.querySelector('details').open = true;
  $('vendFormProdutoTitulo').textContent = 'Editar produto';
  $('produtoLoja').scrollIntoView({ behavior: 'smooth', block: 'start' });
  msg('Produto carregado. Ao guardar, ele volta para aprovação.');
}

async function salvarPerfil(evento) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.currentTarget));
  const principal = { nome: dados.nome, nomeLoja: dados.nomeLoja, telefone: dados.telefone, morada: dados.morada, categoria: dados.categoria, descricao: dados.descricao };
  const publico = {
    logoUrl: textoSeguro(dados.logoUrl, 1200),
    capaUrl: textoSeguro(dados.capaUrl, 1200),
    horario: textoSeguro(dados.horario, 160),
    instagram: textoSeguro(dados.instagram, 120),
    destaque: textoSeguro(dados.destaque, 280)
  };
  try {
    try {
      await call('atualizarPerfilVendedor')({ ...principal, perfilPublico: publico });
    } catch (erroEdge) {
      const { error } = await supabase.from('vendedores').update({
        nome: principal.nome,
        nome_loja: principal.nomeLoja,
        telefone: principal.telefone,
        morada: principal.morada || '',
        categoria: principal.categoria,
        descricao: principal.descricao || '',
        atualizado_em: new Date().toISOString()
      }).eq('id', auth.currentUser.id);
      if (error) throw new Error(`Não foi possível guardar os dados básicos da loja: ${erroTexto(error)}`);
      console.warn('Edge Function indisponível; dados básicos guardados via RLS.', erroEdge);
    }
    const { error: perfilErro } = await supabase.rpc('atualizar_perfil_publico_vendedor', { p_perfil: publico });
    if (perfilErro) throw new Error(`Não foi possível guardar logótipo e apresentação. Execute a migration 012 no Supabase e tente novamente. Detalhe: ${erroTexto(perfilErro)}`);
    msg('Perfil público da loja atualizado.');
    await carregar();
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function solicitarDestaqueSelecionado() {
  const produtoId = $('vendProdutoDestaque').value;
  const dias = Number($('vendDiasDestaque').value);
  if (!produtoId) return msg('Selecione um produto publicado para destacar.', false);
  try {
    await call('solicitarDestaque')({ produtoId, dias });
    msg('Solicitação de destaque enviada. A VORA confirmará o pagamento antes da ativação.');
    await carregarDestaques();
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function salvarRecebimento(evento) {
  evento.preventDefault();
  const dados = { metodo: $('vendMetodoRecebimento').value, titular: $('vendTitular').value.trim(), referencia: $('vendReferencia').value.trim() };
  try {
    try { await call('atualizarDadosRecebimento')(dados); }
    catch (erroEdge) {
      const { error } = await supabase.from('vendedores').update({ dados_recebimento: { ...dados, atualizadoEm: new Date().toISOString() }, atualizado_em: new Date().toISOString() }).eq('id', auth.currentUser.id);
      if (error) throw error;
      console.warn('Edge Function indisponível; dados de recebimento guardados via RLS.', erroEdge);
    }
    msg('Dados de recebimento guardados com segurança.');
    await carregar();
  } catch (erro) { msg(erroTexto(erro), false); }
}

async function levantamento() {
  try {
    const resultado = await call('solicitarLevantamento')({});
    msg(`Levantamento solicitado: ${money(resultado.data.valor)}. Aguarde análise.`);
    await carregar();
  } catch (erro) { msg(erroTexto(erro), false); }
}

function selecionarDestaque(id) {
  $('vendProdutoDestaque').value = id;
  $('operacaoLoja').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', () => {
  $('formVendedor').addEventListener('submit', cadastro);
  $('formLoginVendedor').addEventListener('submit', login);
  $('formRedefinirSenha').addEventListener('submit', redefinirSenha);
  $('formPerfilVendedor').addEventListener('submit', salvarPerfil);
  $('formProdutoVendedor').addEventListener('submit', produto);
  $('formRecebimento').addEventListener('submit', salvarRecebimento);
  $('btnRecuperarSenha').addEventListener('click', recuperarSenha);
  $('btnTrocarConta').addEventListener('click', trocarConta);
  $('btnUploadVendedor').addEventListener('click', uploadImagensProduto);
  $('btnLogoUpload').addEventListener('click', uploadLogo);
  $('btnSolicitarDestaque').addEventListener('click', solicitarDestaqueSelecionado);
  $('btnLevantamento').addEventListener('click', levantamento);
  $('btnSairVendedor').addEventListener('click', () => signOut(auth));
  $('btnMostrarCadastro').addEventListener('click', () => { telas(false); $('vendAuth').style.display = 'none'; $('vendCadastro').style.display = 'block'; prepararCadastroContaAtual(); });
  $('btnMostrarLogin').addEventListener('click', () => { telas(false); $('vendAuth').style.display = 'grid'; });
  $('perfilLogoUrl').addEventListener('input', () => mostrarImagem('perfilLogoPreview', 'perfilLogoFallback', $('perfilLogoUrl').value, iniciais($('perfilNomeLoja').value || vend?.nomeLoja)));
  document.addEventListener('click', (evento) => {
    const editar = evento.target.closest('[data-edit]');
    const destacar = evento.target.closest('[data-select-dest]');
    if (editar) editarProduto(editar.dataset.edit);
    if (destacar) selecionarDestaque(destacar.dataset.selectDest);
  });
  if (recuperacaoAtiva) mostrarRecuperacaoSenha();
  onAuthStateChanged(auth, (user) => {
    if (recuperacaoAtiva) { mostrarRecuperacaoSenha(); return; }
    if (user) carregar().catch((erro) => msg(erroTexto(erro), false));
    else { telas(false); $('vendAuth').style.display = 'none'; $('vendCadastro').style.display = 'block'; prepararCadastroContaAtual(); }
  });
});
