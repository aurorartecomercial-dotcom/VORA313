import { auth, functions } from './config.js';
import { httpsCallable } from './supabase-compat.js';
import { escapeHTML, formatarMoeda } from './utils.js';
import { gerarFaturaHTML } from './carrinho.js?v=10';
import { adicionarAvaliacao, consultarElegibilidadeAvaliacao } from './avaliacoes.js';

const ETAPAS_TIMELINE = [
  { status: 'aguardando_pagamento', titulo: 'Pagamento pendente', icone: '💳' },
  { status: 'pago', titulo: 'Pagamento confirmado', icone: '✅' },
  { status: 'em_preparacao', titulo: 'Em preparação', icone: '📦' },
  { status: 'enviado', titulo: 'Enviado', icone: '🚚' },
  { status: 'entregue', titulo: 'Entregue', icone: '🏠' }
];
const ROTULOS = {
  aguardando_pagamento: 'Aguardando pagamento', pago: 'Pagamento confirmado', em_preparacao: 'Em preparação', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado'
};

function dataFormatada(valor) {
  if (!valor) return 'Data não disponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data não disponível' : data.toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' });
}

function classeEstado(status) {
  return status === 'aguardando_pagamento' ? 'pendente' : status === 'cancelado' ? 'cancelado' : '';
}

function renderizarTimeline(pedido) {
  const status = String(pedido.status || 'aguardando_pagamento');
  const historico = Array.isArray(pedido.historicoStatus) ? pedido.historicoStatus : [];
  const datas = new Map(historico.map((evento) => [String(evento.statusNovo || evento.status_novo || ''), evento.criadoEm || evento.criado_em]));
  const ordem = ETAPAS_TIMELINE.map((etapa) => etapa.status);
  const atual = ordem.indexOf(status);
  const cancelado = status === 'cancelado';
  return `<div class="pedido-acompanhamento" aria-label="Linha do tempo do pedido">
    <div class="pedido-realizado"><span class="pedido-timeline-icone">🛒</span><div><strong>Pedido realizado</strong><small>${escapeHTML(dataFormatada(pedido.criadoEm))}</small></div></div>
    <div class="pedido-timeline-lista">${ETAPAS_TIMELINE.map((etapa, indice) => {
      const concluida = cancelado ? historico.some((e) => String(e.statusNovo || e.status_novo) === etapa.status) : atual >= indice;
      const atualEtapa = !cancelado && status === etapa.status;
      const data = datas.get(etapa.status);
      return `<div class="pedido-timeline-item ${concluida ? 'concluida' : ''} ${atualEtapa ? 'atual' : ''}"><span class="pedido-timeline-ponto">${etapa.icone}</span><div><strong>${escapeHTML(etapa.titulo)}</strong>${data ? `<small>${escapeHTML(dataFormatada(data))}</small>` : ''}</div></div>`;
    }).join('')}
    ${cancelado ? `<div class="pedido-timeline-item cancelado concluida atual"><span class="pedido-timeline-ponto">❌</span><div><strong>Pedido cancelado</strong><small>${escapeHTML(dataFormatada(datas.get('cancelado') || pedido.atualizadoEm))}</small></div></div>` : ''}</div>
  </div>`;
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
        const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const vendedoresDoPedido = new Set();
    const itensHtml = itens.map((item, itemIndex) => {
      const variacao = Array.isArray(item.variacao) ? item.variacao.map((opcao) => `${opcao?.nome || ''}: ${opcao?.valor || ''}`).filter(Boolean).join(' · ') : '';
      const sellerKey = item.vendedorId ? String(item.vendedorId) : '';
      const mostrarSeller = sellerKey && !vendedoresDoPedido.has(sellerKey);
      if (sellerKey) vendedoresDoPedido.add(sellerKey);
      return `<div class="pedido-item pedido-item-avaliavel"><div><b>${escapeHTML(item.nome || 'Produto')} × ${Number(item.quantidade || 0)}</b><span>${variacao ? `Opções: ${escapeHTML(variacao)} · ` : ''}${escapeHTML(formatarMoeda(item.preco || 0))}</span></div>${status === 'entregue' ? `<div class="pedido-avaliacoes" data-avaliacao-item="${escapeHTML(item.id || '')}" data-produto-id="${escapeHTML(item.produtoId || '')}" data-pedido-id="${escapeHTML(pedido.id || '')}" data-vendedor-id="${escapeHTML(item.vendedorId || '')}" data-vendedor-nome="${escapeHTML(item.vendedorNome || 'Vendedor')}" data-vendedor-primeiro="${mostrarSeller ? 'true' : 'false'}"><small>A verificar elegibilidade para avaliação…</small></div>` : ''}</div>`;
    }).join('');
    const pagamento = pedido.pagamentoDetalhe || pedido.pagamento || {};
    const pagamentoTexto = pagamento.status === 'aguarda_comprovativo' ? 'Comprovativo em análise' : (pagamento.status === 'pago' ? 'Pagamento confirmado' : 'Pagamento pendente');
    return `<article class="pedido-card"><div class="pedido-cabeca"><div><strong>Pedido ${escapeHTML(pedido.codigoRastreio || '—')}</strong><small>Fatura ${escapeHTML(pedido.numeroFatura || '—')} · ${escapeHTML(dataFormatada(pedido.criadoEm))}</small></div><span class="pedido-estado ${classeEstado(status)}">${escapeHTML(ROTULOS[status] || status)}</span></div><div class="pedido-itens">${itensHtml || '<span>Nenhum item encontrado.</span>'}</div><div class="pedido-resumo"><small>${escapeHTML(pagamentoTexto)}${pedido.expiraEm && status === 'aguardando_pagamento' ? ` · vence ${escapeHTML(dataFormatada(pedido.expiraEm))}` : ''}</small><strong class="pedido-total">${escapeHTML(formatarMoeda(pedido.valorTotal || 0))}</strong></div>${renderizarTimeline(pedido)}<div class="pedido-acoes"><small>${status === 'aguardando_pagamento' ? 'Envie o comprovativo para a VORA confirmar.' : 'Acompanhe a atualização mais recente do pedido.'}</small><button type="button" data-fatura="${indice}">🧾 Abrir fatura</button></div></article>`;
  }).join('');
  alvo.querySelectorAll('[data-fatura]').forEach((botao) => botao.addEventListener('click', () => gerarFaturaHTML(faturaDoPedido(pedidos[Number(botao.dataset.fatura)]))));
}


async function configurarAvaliacoesDosPedidos(pedidos) {
  const containers = [...document.querySelectorAll('[data-avaliacao-item]')];
  for (const container of containers) {
    const produtoId = container.dataset.produtoId;
    const itemId = container.dataset.avaliacaoItem;
    const pedidoId = container.dataset.pedidoId;
    const vendedorId = container.dataset.vendedorId;
    if (!produtoId || !itemId) {
      container.innerHTML = '<small>Este item não pode ser avaliado porque o vínculo da compra não está disponível.</small>';
      continue;
    }
    try {
      const elegibilidade = await consultarElegibilidadeAvaliacao(produtoId, { itemId });
      const produtoOk = Boolean(elegibilidade?.podeAvaliarProduto && String(elegibilidade.itemId) === String(itemId));
      const sellerOk = Boolean(container.dataset.vendedorPrimeiro === 'true' && vendedorId && elegibilidade?.podeAvaliarVendedor && String(elegibilidade.pedidoId) === String(pedidoId));
      const produtoForm = produtoOk
        ? `<form class="pedido-review-form" data-review-tipo="produto"><strong>Avaliar produto</strong><select name="nota" aria-label="Nota do produto"><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select><textarea name="comentario" maxlength="1000" rows="2" placeholder="Comentário opcional"></textarea><button type="submit">Publicar avaliação</button></form>`
        : `<small class="avaliacao-verificada-status">${elegibilidade?.produtoJaAvaliado ? '✓ Produto já avaliado por esta compra.' : '✓ Avaliação do produto indisponível para este item.'}</small>`;
      const sellerForm = sellerOk
        ? `<form class="pedido-review-form" data-review-tipo="vendedor"><strong>Avaliar ${escapeHTML(container.dataset.vendedorNome || 'vendedor')}</strong><select name="nota" aria-label="Nota do vendedor"><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select><textarea name="comentario" maxlength="1000" rows="2" placeholder="Como foi a experiência com o vendedor? (opcional)"></textarea><button type="submit">Publicar avaliação</button></form>`
        : '';
      container.innerHTML = produtoForm + sellerForm;
      container.querySelectorAll('form').forEach((form) => form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        try {
          const nota = Number(form.querySelector('[name="nota"]')?.value || 5);
          const comentario = form.querySelector('[name="comentario"]')?.value || '';
          if (form.dataset.reviewTipo === 'produto') {
            await adicionarAvaliacao(produtoId, nota, comentario, { tipo: 'produto', itemId });
          } else {
            await adicionarAvaliacao('', nota, comentario, { tipo: 'vendedor', pedidoId, vendedorId });
          }
          form.outerHTML = '<small class="avaliacao-verificada-status sucesso">✓ Avaliação verificada publicada.</small>';
        } catch (erro) {
          botao.disabled = false;
          botao.textContent = erro?.message || 'Tentar novamente';
        }
      }));
    } catch (erro) {
      container.innerHTML = '<small>Não foi possível verificar a elegibilidade agora.</small>';
    }
  }
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
    const pedidos = Array.isArray(resposta?.data?.pedidos) ? resposta.data.pedidos : [];
    renderizarPedidos(pedidos);
    await configurarAvaliacoesDosPedidos(pedidos);
  } catch (erro) {
    console.error('Falha ao carregar pedidos:', erro);
    alvo.innerHTML = '<section class="pedido-vazio"><h2>Não foi possível carregar os pedidos</h2><p>Atualize a página. Se o problema continuar, contacte o suporte VORA 313.</p></section>';
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
