import { escapeHTML, extrairValorNumerico, formatarMoeda, mostrarToast, validarCliente } from './utils.js';
import { auth, CONFIG, functions } from './config.js';
import { signInAnonymously } from './supabase-compat.js';
import { httpsCallable } from './supabase-compat.js';

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
let pedidoEmPagamento = null;
let metodoPagamentoSelecionado = 'transferencia_manual';
const CHECKOUT_IDEMPOTENCY_KEY = 'vora313_checkout_idempotency';
const PAYMENT_IDEMPOTENCY_PREFIX = 'vora313_payment_idempotency_';

function invalidarTentativaCheckout() {
  localStorage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
}

function obterChavePedido() {
  const existente = localStorage.getItem(CHECKOUT_IDEMPOTENCY_KEY);
  if (existente && /^[a-zA-Z0-9_-]{16,128}$/.test(existente)) return existente;
  const nova = crypto.randomUUID ? crypto.randomUUID() : `vora_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  localStorage.setItem(CHECKOUT_IDEMPOTENCY_KEY, nova);
  return nova;
}

function obterChavePagamento(pedidoId) {
  const chave = `${PAYMENT_IDEMPOTENCY_PREFIX}${pedidoId}`;
  const existente = localStorage.getItem(chave);
  if (existente && /^[a-zA-Z0-9_-]{16,128}$/.test(existente)) return existente;
  const nova = crypto.randomUUID ? crypto.randomUUID() : `pay_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  localStorage.setItem(chave, nova);
  return nova;
}

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
  document.querySelectorAll('[data-metodo-pagamento]').forEach((botao) => {
    botao.addEventListener('click', () => definirMetodoPagamento(botao.dataset.metodoPagamento));
  });

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
      invalidarTentativaCheckout();
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
  invalidarTentativaCheckout();
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
  invalidarTentativaCheckout();
  atualizarCarrinho();
  mostrarToast('Produto adicionado!', 'sucesso');
}

export function aplicarCupom(valor) {
  const codigo = String(valor || '').trim().toUpperCase();
  if (!codigo) return mostrarToast('Digite o código do cupom.', 'info');
  if (!/^[A-Z0-9_-]{3,60}$/.test(codigo)) return mostrarToast('Formato de cupom inválido.', 'info');
  cupomAplicado = codigo;
  invalidarTentativaCheckout();
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
      cupom: cupomAplicado,
      idempotencyKey: obterChavePedido()
    });
    fecharModalCliente();
    invalidarTentativaCheckout();
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
  pedidoEmPagamento = pedido;
  metodoPagamentoSelecionado = 'transferencia_manual';
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
  definirMetodoPagamento(metodoPagamentoSelecionado);
  document.getElementById('btnConfirmarPagamento').onclick = iniciarPagamentoManual;
  modalPagamento.style.display = 'flex';
}

function definirMetodoPagamento(metodo) {
  if (!metodo) return;
  metodoPagamentoSelecionado = metodo;
  document.querySelectorAll('[data-metodo-pagamento]').forEach((botao) => {
    const ativo = botao.dataset.metodoPagamento === metodo;
    botao.setAttribute('aria-pressed', String(ativo));
    botao.style.borderColor = ativo ? 'var(--cor-esmeralda)' : '#e4e8e6';
    botao.style.background = ativo ? '#eaf7f2' : '#fff';
    botao.style.color = ativo ? 'var(--cor-esmeralda)' : '#3d4b47';
  });
  const mensagem = document.getElementById('pagMetodoEstado');
  const botaoConfirmar = document.getElementById('btnConfirmarPagamento');
  if (metodo === 'transferencia_manual') {
    if (mensagem) mensagem.textContent = 'Envie o comprovativo. A VORA confirma o pagamento antes de processar o pedido.';
    if (botaoConfirmar) {
      botaoConfirmar.disabled = false;
      botaoConfirmar.textContent = '📤 Enviar comprovativo por WhatsApp';
      botaoConfirmar.style.opacity = '1';
      botaoConfirmar.style.cursor = 'pointer';
    }
  }
}

async function iniciarPagamentoManual() {
  const pedido = pedidoEmPagamento;
  if (!pedido) return;
  if (metodoPagamentoSelecionado !== 'transferencia_manual') {
    mostrarToast('Este método de pagamento ainda não está ativo.', 'info');
    return;
  }
  const botao = document.getElementById('btnConfirmarPagamento');
  if (botao) {
    botao.disabled = true;
    botao.textContent = '⏳ A preparar comprovativo…';
  }
  try {
    await garantirSessao();
    const iniciarPagamento = httpsCallable(functions, 'iniciarPagamentoPedido');
    await iniciarPagamento({
      pedidoId: pedido.pedidoId,
      metodo: metodoPagamentoSelecionado,
      idempotencyKey: obterChavePagamento(pedido.pedidoId)
    });
  } catch (error) {
    // A migração ou a nova Edge Function pode ainda não ter sido publicada.
    // Mantemos o fluxo atual por WhatsApp para não bloquear uma venda legítima.
    console.warn('Registo seguro do pagamento ainda indisponível:', error);
    mostrarToast('Pedido criado. O registo do pagamento será concluído pela equipa VORA.', 'info');
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = '📤 Enviar comprovativo por WhatsApp';
    }
  }
  enviarPedidoWhatsApp(pedido);
}

function limparCarrinho() {
  carrinho = [];
  cupomAplicado = '';
  invalidarTentativaCheckout();
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

export function gerarFaturaHTML(pedido) {
  const cliente = pedido.cliente || {};
  const pago = String(pedido.status || '').toLowerCase() === 'pago';
  const tipoDocumento = pago ? 'FATURA / RECIBO' : 'FATURA PROFORMA';
  const estadoDocumento = pago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO';
  const dataEmissao = pedido.emitidoEm
    ? new Date(pedido.emitidoEm).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' });
  const linhas = (pedido.itens || []).map((item, indice) => {
    const subtotal = Number(item.preco || 0) * Number(item.quantidade || 0);
    const vendedor = item.vendedorNome ? `<small>Vendido por: ${escapeHTML(item.vendedorNome)}</small>` : '';
    return `<tr><td class="linha-numero">${indice + 1}</td><td><strong>${escapeHTML(item.nome || 'Produto')}</strong>${vendedor}</td><td class="centro">${Number(item.quantidade || 0)}</td><td class="valor">${escapeHTML(formatarMoeda(item.preco || 0))}</td><td class="valor"><strong>${escapeHTML(formatarMoeda(subtotal))}</strong></td></tr>`;
  }).join('');
  const desconto = Number(pedido.valorDesconto || 0);
  const cupom = pedido.cupomAplicado?.codigo ? `<div class="total-row desconto"><span>Desconto (${escapeHTML(pedido.cupomAplicado.codigo)})</span><strong>− ${escapeHTML(formatarMoeda(desconto))}</strong></div>` : '';
  const morada = [cliente.morada, cliente.bairro].filter(Boolean).join(' · ') || 'Não informada';
  const avisoPagamento = pago
    ? 'Pagamento confirmado pela VORA 313. Guarde este documento como comprovativo do pedido.'
    : 'Este documento é uma fatura proforma e não comprova pagamento. O pedido será processado somente após a confirmação da VORA 313.';
  const html = `<!doctype html>
<html lang="pt-AO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${tipoDocumento} ${escapeHTML(pedido.numeroFatura || '')} — VORA 313</title>
<style>
  :root{--verde:#005a4c;--verde-escuro:#003d34;--ouro:#d4af37;--cinza:#667085;--linha:#e4e9e7;--fundo:#f4f8f6}
  *{box-sizing:border-box} body{margin:0;background:var(--fundo);color:#172b25;font-family:Arial,"Helvetica Neue",sans-serif;font-size:13px;line-height:1.45}.toolbar{max-width:210mm;margin:18px auto 10px;display:flex;justify-content:flex-end;gap:8px}.toolbar button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.btn-print{background:var(--verde);color:#fff}.btn-close{background:#fff;color:#46544f;border:1px solid var(--linha)!important}.invoice{width:210mm;min-height:297mm;margin:0 auto 24px;background:#fff;padding:18mm 16mm 16mm;box-shadow:0 10px 28px rgba(24,52,44,.12)}.topo{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:18px;border-bottom:3px solid var(--ouro)}.marca{display:flex;align-items:center;gap:11px}.marca-sinal{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#f7ce36,#d99f16);color:var(--verde-escuro);font-size:21px;font-weight:900}.marca-nome{font-size:25px;font-weight:900;letter-spacing:-1px;color:var(--verde)}.marca-nome span{color:var(--ouro)}.marca small{display:block;color:var(--cinza);font-size:10px;letter-spacing:.8px;text-transform:uppercase}.documento{text-align:right}.documento h1{margin:0;color:var(--verde);font-size:21px;letter-spacing:.3px}.documento p{margin:3px 0 0;color:var(--cinza);font-size:11px}.selo{display:inline-block;margin-top:8px;padding:5px 9px;border-radius:999px;background:${pago ? '#e3f7ee' : '#fff7da'};color:${pago ? '#087f5b' : '#8b6900'};font-size:10px;font-weight:800;letter-spacing:.4px}.referencias{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.referencia{border:1px solid var(--linha);border-radius:9px;padding:10px;background:#fbfdfc}.referencia span,.bloco-titulo{display:block;color:var(--cinza);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.55px}.referencia strong{display:block;margin-top:3px;color:var(--verde-escuro);font-size:12px;word-break:break-word}.dados{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0 20px}.bloco{border:1px solid var(--linha);border-radius:10px;padding:13px}.bloco-titulo{margin-bottom:6px;color:var(--verde)}.bloco p{margin:2px 0}.bloco p strong{font-size:14px}.tabela-produtos{width:100%;border-collapse:collapse;margin:8px 0 16px}.tabela-produtos th{padding:10px 8px;background:var(--verde);color:#fff;font-size:10px;letter-spacing:.45px;text-align:left;text-transform:uppercase}.tabela-produtos th.valor,.tabela-produtos td.valor{text-align:right}.tabela-produtos th.centro,.tabela-produtos td.centro{text-align:center}.tabela-produtos td{padding:11px 8px;border-bottom:1px solid var(--linha);vertical-align:top}.tabela-produtos small{display:block;margin-top:2px;color:var(--cinza);font-size:10px}.linha-numero{color:var(--cinza);width:28px}.rodape-total{display:flex;justify-content:flex-end;margin-top:8px}.totais{width:270px}.total-row{display:flex;justify-content:space-between;gap:15px;padding:6px 0;color:#4b5b56}.total-row.desconto{color:#b42318}.total-final{margin-top:4px;padding:11px 12px!important;border-radius:8px;background:var(--verde);color:#fff;font-size:16px}.pagamento{margin-top:26px;padding:13px 14px;border-radius:10px;background:#f7faf8;border-left:4px solid var(--ouro)}.pagamento h2{margin:0 0 5px;color:var(--verde);font-size:13px}.pagamento p{margin:0;color:#52615c}.rodape{position:relative;margin-top:34px;padding-top:13px;border-top:1px solid var(--linha);display:flex;justify-content:space-between;gap:16px;color:var(--cinza);font-size:10px}.rodape strong{color:var(--verde)}@page{size:A4;margin:0}@media print{body{background:#fff}.toolbar{display:none}.invoice{width:210mm;min-height:297mm;margin:0;box-shadow:none}}@media(max-width:720px){.toolbar{margin:10px}.invoice{width:100%;min-height:0;padding:22px 16px;margin:0}.topo,.dados{display:block}.documento{text-align:left;margin-top:14px}.referencias{grid-template-columns:1fr}.dados .bloco+.bloco{margin-top:12px}.tabela-produtos{font-size:11px}.tabela-produtos th:nth-child(1),.tabela-produtos td:nth-child(1){display:none}.tabela-produtos th,.tabela-produtos td{padding:8px 4px}.rodape-total{justify-content:stretch}.totais{width:100%}.rodape{display:block}.rodape div+div{margin-top:5px}}
</style></head><body>
<div class="toolbar"><button class="btn-close" onclick="window.close()">Fechar</button><button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button></div>
<main class="invoice"><header class="topo"><div class="marca"><div class="marca-sinal">◔</div><div><div class="marca-nome">VORA <span>313</span></div><small>Marketplace angolano</small></div></div><div class="documento"><h1>${tipoDocumento}</h1><p>Emitida em ${escapeHTML(dataEmissao)}</p><span class="selo">${estadoDocumento}</span></div></header>
<section class="referencias"><div class="referencia"><span>Número do documento</span><strong>${escapeHTML(pedido.numeroFatura || '—')}</strong></div><div class="referencia"><span>Pedido / rastreio</span><strong>${escapeHTML(pedido.codigoRastreio || '—')}</strong></div><div class="referencia"><span>Vencimento</span><strong>${pedido.expiraEm ? escapeHTML(new Date(pedido.expiraEm).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })) : '—'}</strong></div></section>
<section class="dados"><div class="bloco"><span class="bloco-titulo">Emitente</span><p><strong>VORA 313</strong></p><p>Marketplace · Luanda, Angola</p><p>NIF: 5000048151</p><p>Atendimento: +244 933 677 628</p></div><div class="bloco"><span class="bloco-titulo">Cliente e entrega</span><p><strong>${escapeHTML(cliente.nome || 'Cliente')}</strong></p><p>Tel.: ${escapeHTML(cliente.telefone || '—')} · NIF: ${escapeHTML(cliente.nif || '—')}</p><p>${escapeHTML(morada)}</p></div></section>
<table class="tabela-produtos"><thead><tr><th>#</th><th>Produto</th><th class="centro">Qtd.</th><th class="valor">Preço unit.</th><th class="valor">Total</th></tr></thead><tbody>${linhas}</tbody></table>
<section class="rodape-total"><div class="totais"><div class="total-row"><span>Subtotal dos produtos</span><strong>${escapeHTML(formatarMoeda(pedido.subtotal || 0))}</strong></div>${cupom}<div class="total-row"><span>Entrega</span><strong>${escapeHTML(formatarMoeda(pedido.frete || 0))}</strong></div><div class="total-row total-final"><span>Total a pagar</span><strong>${escapeHTML(formatarMoeda(pedido.valorTotal || 0))}</strong></div></div></section>
<section class="pagamento"><h2>${pago ? 'Pagamento confirmado' : 'Instrução de pagamento'}</h2><p>${escapeHTML(avisoPagamento)}</p>${pago ? '' : `<p style="margin-top:6px"><strong>Referência para o comprovativo:</strong> ${escapeHTML(pedido.numeroFatura || '—')}</p>`}</section>
<footer class="rodape"><div><strong>VORA 313</strong> · Compra simples, venda com confiança.</div><div>Documento eletrónico · ${escapeHTML(pedido.numeroFatura || '')}</div></footer></main></body></html>`;
  const janela = window.open('', '_blank', 'noopener');
  if (!janela) return;
  janela.document.write(html);
  janela.document.close();
}
