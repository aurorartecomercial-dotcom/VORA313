import { auth, functions } from './config.js';
import { httpsCallable } from './supabase-compat.js';
import { escapeHTML, formatarMoeda } from './utils.js';
import { gerarFaturaHTML } from './carrinho.js?v=10';

const ORDEM = ['pago', 'em_preparacao', 'enviado', 'entregue'];
const ROTULOS = {
  aguardando_pagamento: 'Aguardando pagamento', pago: 'Pagamento confirmado', em_preparacao: 'Em preparação', enviado: 'Em entrega', entregue: 'Entregue', cancelado: 'Cancelado'
};

function dataFormatada(valor) {
  if (!valor) return 'Data não disponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data não disponível' : data.toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' });
}

function classeEstado(status) {
  return status === 'aguardando_pagamento' ? 'pendente' : status === 'cancelado' ? 'cancelado' : '';
}

function etapaAtual(status) {
  if (status === 'aguardando_pagamento' || status === 'cancelado') return -1;
  return ORDEM.indexOf(status);
}

function faturaDoPedido(pedido) {
  return {
    pedidoId: pedido.id, codigoRastreio: pedido.codigoRastreio, numeroFatura: pedido.numeroFatura, status: pedido.status,
    subtotal: pedido.subtotal, frete: pedido.frete, valorDesconto: pedido.valorDesconto, valorTotal: pedido.valorTotal,
    itens: pedido.itens || [], cliente: { nome: pedido.nomeCliente, telefone: pedido.telefoneCliente, nif: pedido.nifCliente, morada: pedido.moradaCliente, bairro: pedido.bairro }, emitidoEm: pedido.criadoEm, expiraEm: pedido.expiraEm, pagamento: pedido.pagamento
  };
}

function renderizarPedidos(pedidos) {
  const alvo = document.getElementById('meusPedidosConteudo');
  if (!alvo) return;
  if (!pedidos.length) {
    alvo.innerHTML = '<section class="pedido-vazio"><h2>Ainda não tem pedidos</h2><p>Quando finalizar uma compra, ela aparecerá aqui com a fatura e o acompanhamento.</p><a class="pedido-login" href="index.html">Ver produtos</a></section>';
    return;
  }
  alvo.innerHTML = pedidos.map((pedido, indice) => {
    const status = String(pedido.status || 'aguardando_pagamento');
    const atual = etapaAtual(status);
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensHtml = itens.map((item) => {
      const variacao = Array.isArray(item.variacao) ? item.variacao.map((opcao) => `${opcao?.nome || ''}: ${opcao?.valor || ''}`).filter(Boolean).join(' · ') : '';
      return `<div class="pedido-item"><b>${escapeHTML(item.nome || 'Produto')} × ${Number(item.quantidade || 0)}</b><span>${variacao ? `Opções: ${escapeHTML(variacao)} · ` : ''}${escapeHTML(formatarMoeda(item.preco || 0))}</span></div>`;
    }).join('');
    const pagamento = pedido.pagamentoDetalhe || pedido.pagamento || {};
    const pagamentoTexto = pagamento.status === 'aguarda_comprovativo' ? 'Comprovativo em análise' : (pagamento.status === 'pago' ? 'Pagamento confirmado' : 'Pagamento pendente');
    return `<article class="pedido-card"><div class="pedido-cabeca"><div><strong>Pedido ${escapeHTML(pedido.codigoRastreio || '—')}</strong><small>Fatura ${escapeHTML(pedido.numeroFatura || '—')} · ${escapeHTML(dataFormatada(pedido.criadoEm))}</small></div><span class="pedido-estado ${classeEstado(status)}">${escapeHTML(ROTULOS[status] || status)}</span></div><div class="pedido-itens">${itensHtml || '<span>Nenhum item encontrado.</span>'}</div><div class="pedido-resumo"><small>${escapeHTML(pagamentoTexto)}${pedido.expiraEm && status === 'aguardando_pagamento' ? ` · vence ${escapeHTML(dataFormatada(pedido.expiraEm))}` : ''}</small><strong class="pedido-total">${escapeHTML(formatarMoeda(pedido.valorTotal || 0))}</strong></div><div class="pedido-timeline" aria-label="Progresso do pedido">${ORDEM.map((_, etapa) => `<span class="pedido-etapa ${etapa <= atual ? 'ativa' : ''}"></span>`).join('')}</div><div class="pedido-acoes"><small>${status === 'aguardando_pagamento' ? 'Envie o comprovativo para a VORA confirmar.' : 'Acompanhe a atualização mais recente do pedido.'}</small><button type="button" data-fatura="${indice}">🧾 Abrir fatura</button></div></article>`;
  }).join('');
  alvo.querySelectorAll('[data-fatura]').forEach((botao) => botao.addEventListener('click', () => gerarFaturaHTML(faturaDoPedido(pedidos[Number(botao.dataset.fatura)]))));
}

async function iniciar() {
  const alvo = document.getElementById('meusPedidosConteudo');
  await new Promise((resolver) => {
    if (auth._ready) return resolver();
    const ouvinte = () => { auth._listeners.delete(ouvinte); resolver(); };
    auth._listeners.add(ouvinte);
    setTimeout(ouvinte, 1200);
  });
  if (!auth.currentUser || auth.currentUser.is_anonymous) {
    alvo.innerHTML = '<section class="pedido-vazio"><h2>Entre para ver os seus pedidos</h2><p>Usamos a sua conta para proteger os dados de entrega e as faturas.</p><a class="pedido-login" href="perfil.html">Entrar na minha conta</a></section>';
    return;
  }
  try {
    const listar = httpsCallable(functions, 'listarMeusPedidos');
    const resposta = await listar({});
    renderizarPedidos(Array.isArray(resposta?.data?.pedidos) ? resposta.data.pedidos : []);
  } catch (erro) {
    console.error('Falha ao carregar pedidos:', erro);
    alvo.innerHTML = '<section class="pedido-vazio"><h2>Não foi possível carregar os pedidos</h2><p>Atualize a página. Se o problema continuar, contacte o suporte VORA 313.</p></section>';
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
