import { escapeHTML, extrairValorNumerico, formatarMoeda, mostrarToast, validarCliente } from './utils.js';
import { auth, CONFIG, functions } from './config.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

let carrinho = [];
let listaProdutosHTML;
let totalHTML;
let badgeContador;
let sidebar;
let overlay;
let modalCliente;
let modalPagamento;
let inputNome;
let inputTelefone;
let inputNif;
let inputMorada;
let selectBairro;
let inputObservacao;
let btnSalvarCliente;
let cupomAplicado = '';

export function initCarrinho() {
  listaProdutosHTML = document.getElementById('itensCarrinhoLoja');
  totalHTML = document.getElementById('totalCarrinhoLoja');
  badgeContador = document.getElementById('badgeContador');
  sidebar = document.getElementById('carrinhoSidebar');
  overlay = document.getElementById('carrinhoOverlay');
  modalCliente = document.getElementById('modalCliente');
  modalPagamento = document.getElementById('modalPagamento');
  inputNome = document.getElementById('inputNome');
  inputTelefone = document.getElementById('inputTelefone');
  inputNif = document.getElementById('inputNif');
  inputMorada = document.getElementById('inputMorada');
  selectBairro = document.getElementById('selectBairro');
  inputObservacao = document.getElementById('inputObservacao');
  btnSalvarCliente = document.getElementById('btnSalvarCliente');

  if (!listaProdutosHTML || !totalHTML || !badgeContador || !sidebar || !overlay) return;

  carregarCarrinho();
  atualizarCarrinho();
  document.getElementById('abrirCarrinhoFlutuante')?.addEventListener('click', abrirCarrinho);
  document.getElementById('btnFecharCarrinho')?.addEventListener('click', fecharCarrinho);
  overlay.addEventListener('click', fecharCarrinho);
  document.getElementById('btnFinalizarWhatsApp')?.addEventListener('click', () => {
    if (!carrinho.length) return mostrarToast('A sua sacola está vazia.', 'info');
    abrirModalCliente();
  });

  const inputCupom = document.getElementById('inputCupom');
  document.getElementById('btnAplicarCupom')?.addEventListener('click', () => aplicarCupom(inputCupom?.value));
  document.getElementById('btnFecharModal')?.addEventListener('click', fecharModalCliente);
  document.getElementById('btnFecharPagamento')?.addEventListener('click', fecharModalPagamento);
  document.getElementById('toastFechar')?.addEventListener('click', () => {
    document.getElementById('toast-notificacao').style.top = '-100px';
  });
  btnSalvarCliente?.addEventListener('click', finalizarPedido);

  modalCliente?.addEventListener('click', (event) => {
    if (event.target === modalCliente) fecharModalCliente();
  });
  modalPagamento?.addEventListener('click', (event) => {
    if (event.target === modalPagamento) fecharModalPagamento();
  });
  listaProdutosHTML.addEventListener('click', (event) => {
    const remover = event.target.closest('button[data-remover]');
    const alterar = event.target.closest('button[data-index][data-mudanca]');
    if (remover) {
      carrinho.splice(Number(remover.dataset.remover), 1);
      atualizarCarrinho();
    } else if (alterar) {
      alterarQuantidade(Number(alterar.dataset.index), Number(alterar.dataset.mudanca));
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fecharCarrinho();
      fecharModalCliente();
      fecharModalPagamento();
    }
  });
  configurarGPS();
}

function configurarGPS() {
  const button = document.getElementById('btnGPS');
  if (!button || !inputMorada) return;
  button.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('O seu navegador não suporta GPS.');
    button.disabled = true;
    button.textContent = '⏳ Buscando…';
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`;
          const response = await fetch(url);
          const data = await response.json();
          inputMorada.value = data.display_name || `${coords.latitude}, ${coords.longitude}`;
        } catch {
          inputMorada.value = `${coords.latitude}, ${coords.longitude}`;
        } finally {
          button.disabled = false;
          button.textContent = '📍 GPS';
        }
      },
      () => {
        button.disabled = false;
        button.textContent = '📍 GPS';
        alert('Não foi possível obter a localização.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

function carregarCarrinho() {
  try {
    const salvo = JSON.parse(localStorage.getItem('carrinho_aurora') || '[]');
    carrinho = Array.isArray(salvo) ? salvo.filter((item) =>
      typeof item?.produtoId === 'string' && item.produtoId &&
      Number.isInteger(item.quantidade) && item.quantidade > 0
    ) : [];
  } catch {
    carrinho = [];
  }
}

function salvarCarrinho() {
  localStorage.setItem('carrinho_aurora', JSON.stringify(carrinho));
}

function atualizarBadge() {
  const total = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  if (badgeContador) {
    badgeContador.textContent = total;
    badgeContador.style.display = total ? 'inline' : 'none';
  }
}

export function atualizarCarrinho() {
  if (!listaProdutosHTML) return;
  listaProdutosHTML.replaceChildren();
  let total = 0;
  if (!carrinho.length) {
    const vazio = document.createElement('li');
    vazio.textContent = 'A sua sacola está vazia.';
    vazio.style.cssText = 'text-align:center;color:#999;margin-top:40px;font-size:15px;';
    listaProdutosHTML.append(vazio);
  }
  carrinho.forEach((item, index) => {
    total += extrairValorNumerico(item.preco) * item.quantidade;
    const li = document.createElement('li');
    li.className = 'item-carrinho-loja';
    const imagem = document.createElement('div');
    imagem.className = 'v32-cart-thumb';
    if (item.imagem) {
      const img = document.createElement('img');
      img.src = item.imagem;
      img.alt = item.nome;
      img.loading = 'lazy';
      img.addEventListener('error', () => imagem.classList.add('sem-imagem'));
      imagem.append(img);
    } else {
      imagem.textContent = '🛍️';
      imagem.classList.add('sem-imagem');
    }
    const info = document.createElement('div');
    info.className = 'item-info-loja';
    const nome = document.createElement('h4');
    nome.textContent = item.nome;
    const preco = document.createElement('p');
    preco.textContent = item.preco;
    info.append(nome, preco);
    if (item.observacao) {
      const observacao = document.createElement('small');
      observacao.style.color = '#888';
      observacao.textContent = `📝 ${item.observacao}`;
      info.append(observacao);
    }
    const controles = document.createElement('div');
    controles.className = 'item-controles';
    controles.style.cssText = 'display:flex;align-items:center;gap:4px;background:#f0f0f0;padding:4px 8px;border-radius:20px;';
    controles.append(
      criarBotao('−', { index, mudanca: -1 }),
      criarQuantidade(item.quantidade),
      criarBotao('+', { index, mudanca: 1 }),
      criarBotao('🗑️', { remover: index }, 'Remover do carrinho')
    );
    li.append(imagem, info, controles);
    listaProdutosHTML.append(li);
  });
  totalHTML.textContent = formatarMoeda(total).replace(/\s*Kz$/, '');
  const subtotalResumo = document.getElementById('v32CartSubtotal');
  if (subtotalResumo) subtotalResumo.textContent = formatarMoeda(total);
  atualizarBadge();
  salvarCarrinho();
}

function criarQuantidade(quantidade) {
  const span = document.createElement('span');
  span.style.cssText = 'font-weight:600;min-width:20px;text-align:center;';
  span.textContent = quantidade;
  return span;
}

function criarBotao(texto, dados, title = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = texto;
  button.title = title;
  button.style.cssText = 'background:none;border:none;font-size:16px;cursor:pointer;padding:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;';
  Object.entries(dados).forEach(([chave, valor]) => { button.dataset[chave] = String(valor); });
  return button;
}

function alterarQuantidade(index, mudanca) {
  const item = carrinho[index];
  if (!item || !Number.isInteger(mudanca)) return;
  item.quantidade += mudanca;
  if (item.quantidade <= 0) carrinho.splice(index, 1);
  atualizarCarrinho();
}

export function adicionarProdutoCarrinho(produto, observacao = '') {
  if (!produto || typeof produto.id !== 'string' || !produto.id) {
    mostrarToast('Este produto precisa ser atualizado antes de ser comprado.', 'info');
    return;
  }
  const estoque = Number(produto.estoque ?? 0);
  if (!Number.isFinite(estoque) || estoque <= 0) return mostrarToast('🚫 Produto esgotado!', 'info');
  const existente = carrinho.find((item) => item.produtoId === produto.id && item.observacao === observacao);
  if (existente && existente.quantidade >= estoque) return mostrarToast('🚫 Estoque esgotado!', 'info');
  if (existente) existente.quantidade += 1;
  else carrinho.push({
    produtoId: produto.id,
    nome: String(produto.nome || 'Produto'),
    preco: String(produto.preco || ''),
    imagem: String(produto.imagem || produto.imagemUrl || produto.foto || produto.image || ''),
    quantidade: 1,
    observacao: String(observacao || '').slice(0, 500)
  });
  atualizarCarrinho();
  mostrarToast('Produto adicionado!', 'sucesso');
}

export function aplicarCupom(valor) {
  const codigo = String(valor || '').trim().toUpperCase();
  if (!codigo) return mostrarToast('Digite o código do cupom.', 'info');
  if (!/^[A-Z0-9_-]{3,60}$/.test(codigo)) return mostrarToast('Formato de cupom inválido.', 'info');
  cupomAplicado = codigo;
  mostrarToast('Cupom será validado com segurança ao finalizar o pedido.', 'info');
}

function abrirCarrinho() {
  sidebar?.classList.add('ativo');
  if (overlay) overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function fecharCarrinho() {
  sidebar?.classList.remove('ativo');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function abrirModalCliente() {
  if (!modalCliente) return;
  modalCliente.style.display = 'flex';
  inputNome?.focus();
}

function fecharModalCliente() {
  if (modalCliente) modalCliente.style.display = 'none';
}

function fecharModalPagamento() {
  if (modalPagamento) modalPagamento.style.display = 'none';
}

async function garantirSessao() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

async function finalizarPedido() {
  const cliente = {
    nome: inputNome?.value.trim() || '',
    telefone: inputTelefone?.value.trim() || '',
    nif: inputNif?.value.trim() || '',
    morada: inputMorada?.value.trim() || '',
    bairro: selectBairro?.value || '',
    observacao: inputObservacao?.value.trim() || ''
  };
  const erros = validarCliente(cliente.nome, cliente.telefone, cliente.nif);
  for (const campo of ['nome', 'telefone', 'nif']) {
    const alvo = document.getElementById(`erro${campo[0].toUpperCase()}${campo.slice(1)}`);
    if (alvo) alvo.textContent = erros[campo] || '';
  }
  if (Object.keys(erros).length || !cliente.bairro) {
    if (!cliente.bairro) mostrarToast('Selecione o bairro para entrega.', 'info');
    return;
  }
  try {
    btnSalvarCliente.disabled = true;
    btnSalvarCliente.textContent = '⏳ A validar pedido…';
    await garantirSessao();
    const criarPedido = httpsCallable(functions, 'criarPedido');
    const resposta = await criarPedido({
      itens: carrinho.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })),
      cliente,
      cupom: cupomAplicado
    });
    fecharModalCliente();
    limparCarrinho();
    abrirModalPagamento(resposta.data);
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    mostrarToast(error.message || 'Não foi possível criar o pedido.', 'info');
  } finally {
    btnSalvarCliente.disabled = false;
    btnSalvarCliente.textContent = '✅ Gerar Fatura e Pagar';
  }
}

function abrirModalPagamento(pedido) {
  if (!modalPagamento || !pedido) return;
  document.getElementById('pagProdutos').textContent = formatarMoeda(pedido.subtotal);
  document.getElementById('pagFrete').textContent = formatarMoeda(pedido.frete);
  document.getElementById('pagValor').textContent = formatarMoeda(pedido.valorTotal);
  document.getElementById('pagRef').textContent = pedido.numeroFatura;
  const linhaDesconto = document.getElementById('linhaDesconto');
  if (pedido.valorDesconto > 0) {
    document.getElementById('pagDesconto').textContent = `-${formatarMoeda(pedido.valorDesconto)}`;
    linhaDesconto.style.display = 'block';
  } else linhaDesconto.style.display = 'none';
  const qr = document.getElementById('pagQR');
  if (qr) qr.style.display = 'none';
  document.getElementById('btnCopiarRef').onclick = async () => {
    try {
      await navigator.clipboard.writeText(pedido.numeroFatura);
      mostrarToast('Referência copiada.', 'sucesso');
    } catch {
      mostrarToast(`Referência: ${pedido.numeroFatura}`, 'info');
    }
  };
  document.getElementById('btnConfirmarPagamento').onclick = () => enviarPedidoWhatsApp(pedido);
  modalPagamento.style.display = 'flex';
}

function limparCarrinho() {
  carrinho = [];
  cupomAplicado = '';
  localStorage.removeItem('carrinho_aurora');
  atualizarCarrinho();
  fecharCarrinho();
}

function enviarPedidoWhatsApp(pedido) {
  gerarFaturaHTML(pedido);
  const linhas = pedido.itens.map((item) => `• ${item.nome} (x${item.quantidade}) - ${formatarMoeda(item.preco * item.quantidade)}`);
  const texto = [
    '*VORA 313 — PEDIDO PENDENTE*', '',
    `Pedido: ${pedido.codigoRastreio}`,
    `Referência: ${pedido.numeroFatura}`,
    ...linhas, '',
    `Total: ${formatarMoeda(pedido.valorTotal)}`, '',
    'Envio o comprovativo de pagamento para confirmação.'
  ].join('\n');
  window.open(`https://api.whatsapp.com/send?phone=${CONFIG.NUMERO_WHATSAPP}&text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  fecharModalPagamento();
  mostrarToast('Pedido criado. Aguarde a confirmação do pagamento.', 'sucesso');
}

function gerarFaturaHTML(pedido) {
  const linhas = pedido.itens.map((item) => {
    const subtotal = Number(item.preco) * Number(item.quantidade);
    return `<tr><td>${escapeHTML(item.nome)}</td><td>${item.quantidade}</td><td>${escapeHTML(formatarMoeda(item.preco))}</td><td>${escapeHTML(formatarMoeda(subtotal))}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Fatura ${escapeHTML(pedido.numeroFatura)}</title><style>body{font-family:Arial;margin:30px}h1{color:#005A4C;text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#005A4C;color:white}.total{text-align:right;font-size:20px;font-weight:bold}@media print{body{margin:0}}</style></head><body><h1>VORA 313</h1><p><strong>Fatura:</strong> ${escapeHTML(pedido.numeroFatura)}</p><p><strong>Rastreio:</strong> ${escapeHTML(pedido.codigoRastreio)}</p><p><strong>Estado:</strong> Aguardando confirmação de pagamento</p><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Preço</th><th>Subtotal</th></tr></thead><tbody>${linhas}</tbody></table><p class="total">Total: ${escapeHTML(formatarMoeda(pedido.valorTotal))}</p><script>window.print();</script></body></html>`;
  const janela = window.open('', '_blank', 'noopener');
  if (!janela) return;
  janela.document.write(html);
  janela.document.close();
}
