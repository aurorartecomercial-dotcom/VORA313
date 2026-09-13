/*
 * Funções privilegiadas da VORA 313.
 *
 * Credenciais de Stripe, Multicaixa e qualquer segredo de um provedor de
 * pagamento pertencem a este ambiente (Secret Manager), nunca ao browser.
 */
const { randomBytes } = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const FRETES = Object.freeze({
  'Luanda Centro': 1000,
  Ingombota: 1000,
  Maianga: 1200,
  Rangel: 1500,
  Cazenga: 2000,
  Viana: 3500,
  Talatona: 4000,
  Kilamba: 4500,
  Benfica: 3000,
  'Ondjiva (Cunene)': 1500,
  'Cuanhama (Ondjiva)': 1500,
  'Ombadja (Xangongo)': 2500,
  'Cuvelai (Cunene)': 2500,
  'Namacunde (Santa Clara)': 2000,
  'Curoca (Cunene)': 3500,
  'Cahama (Cunene)': 3000,
  'Outro (Cunene)': 4000
});

const ESTADOS = new Set([
  'aguardando_pagamento',
  'pago',
  'em_preparacao',
  'enviado',
  'entregue',
  'cancelado'
]);

function erro(code, message) {
  throw new HttpsError(code, message);
}

function texto(value, field, maxLength, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) erro('invalid-argument', `${field} é obrigatório.`);
  if (result.length > maxLength) erro('invalid-argument', `${field} excede o limite permitido.`);
  return result;
}

function inteiroPositivo(value, field, max = 100) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > max) {
    erro('invalid-argument', `${field} é inválido.`);
  }
  return result;
}

function centavosDePreco(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  const original = String(value ?? '').replace(/[^0-9.,]/g, '');
  if (!original) return 0;

  const comma = original.lastIndexOf(',');
  const dot = original.lastIndexOf('.');
  let normalizado = original;
  if (comma > dot) normalizado = original.replace(/\./g, '').replace(',', '.');
  else if (dot > comma) normalizado = original.replace(/,/g, '');
  else if (comma !== -1) normalizado = original.replace(',', '.');

  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) : 0;
}

function moeda(centavos) {
  return Number((centavos / 100).toFixed(2));
}

const COMISSAO_PADRAO_PERCENTUAL = 7;
const COMISSAO_MAXIMA_PERCENTUAL = 30;

function percentualComissao(produto) {
  const valor = Number(produto?.monetizacao?.percentualComissao ?? produto?.percentualComissao ?? COMISSAO_PADRAO_PERCENTUAL);
  if (!Number.isFinite(valor) || valor < 0 || valor > COMISSAO_MAXIMA_PERCENTUAL) {
    erro('failed-precondition', `Comissão inválida para ${produto?.nome || 'produto'}.`);
  }
  return valor;
}

function vendedorDoProduto(produto) {
  const id = typeof produto?.vendedorId === 'string' && produto.vendedorId.trim() ? produto.vendedorId.trim() : 'vora313';
  const nome = typeof produto?.vendedorNome === 'string' && produto.vendedorNome.trim() ? produto.vendedorNome.trim() : 'VORA 313';
  return { id: id.slice(0, 128), nome: nome.slice(0, 160) };
}

function codigo(prefix) {
  return `${prefix}-${randomBytes(10).toString('hex').toUpperCase()}`;
}

function podeUsarCupom(cupom, uid, agora) {
  if (!cupom || cupom.ativo !== true) return false;
  if (cupom.uidCliente && cupom.uidCliente !== uid) return false;
  if (cupom.validade) {
    const validade = cupom.validade.toDate ? cupom.validade.toDate() : new Date(cupom.validade);
    if (Number.isNaN(validade.getTime()) || validade < agora) return false;
  }
  if (Number.isFinite(cupom.maxUsos) && (cupom.usos || 0) >= cupom.maxUsos) return false;
  return Number.isFinite(Number(cupom.percentual)) && Number(cupom.percentual) > 0 && Number(cupom.percentual) <= 100;
}

async function buscarCupom(codigoCupom) {
  if (!codigoCupom) return null;
  const snapshot = await db.collection('cupons')
    .where('codigo', '==', codigoCupom)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

function garantirAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    erro('permission-denied', 'Acesso administrativo necessário.');
  }
}

function garantirVendedorAprovado(request) {
  if (!request.auth || request.auth.token.seller !== true) erro('permission-denied', 'Conta de vendedor aprovada necessária.');
}

function limparTexto(value, max, required = false) { return texto(value, 'Campo', max, required); }

async function obterVendedor(uid) {
  const snap = await db.collection('vendedores').doc(uid).get();
  if (!snap.exists) erro('not-found', 'Perfil de vendedor não encontrado.');
  const v = snap.data();
  if (v.status !== 'aprovado' || v.ativo === false) erro('permission-denied', 'A loja não está ativa.');
  return { id: uid, ...v };
}

/*
 * Cria um pedido pendente. Preço, frete, cupom e dados de catálogo são
 * sempre calculados no servidor; o navegador não tem autoridade sobre eles.
 */
exports.criarPedido = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) erro('unauthenticated', 'Inicie sessão para finalizar o pedido.');

  const input = request.data || {};
  if (!Array.isArray(input.itens) || input.itens.length === 0 || input.itens.length > 30) {
    erro('invalid-argument', 'O carrinho é inválido.');
  }

  const cliente = {
    nome: texto(input.cliente?.nome, 'Nome', 120),
    telefone: texto(input.cliente?.telefone, 'Telefone', 15),
    nif: texto(input.cliente?.nif, 'NIF', 10),
    morada: texto(input.cliente?.morada, 'Morada', 300, false),
    bairro: texto(input.cliente?.bairro, 'Bairro', 80),
    observacao: texto(input.cliente?.observacao, 'Observação', 500, false)
  };

  if (!/^[0-9]{9,15}$/.test(cliente.telefone)) erro('invalid-argument', 'Telefone inválido.');
  if (!/^[0-9]{10}$/.test(cliente.nif)) erro('invalid-argument', 'NIF inválido.');
  if (!Object.hasOwn(FRETES, cliente.bairro)) erro('invalid-argument', 'Bairro não atendido.');

  const itensPorProduto = new Map();
  for (const item of input.itens) {
    const produtoId = texto(item?.produtoId, 'Produto', 128);
    const quantidade = inteiroPositivo(item?.quantidade, 'Quantidade', 20);
    itensPorProduto.set(produtoId, (itensPorProduto.get(produtoId) || 0) + quantidade);
  }
  if ([...itensPorProduto.values()].some((quantidade) => quantidade > 20)) {
    erro('invalid-argument', 'Quantidade máxima por produto excedida.');
  }

  const codigoCupom = texto(input.cupom, 'Cupom', 60, false).toUpperCase();
  const cupomRef = await buscarCupom(codigoCupom);
  const pedidoRef = db.collection('vendas').doc();
  const codigoRastreio = codigo('VORA');
  const rastreioRef = db.collection('rastreiosPublicos').doc(codigoRastreio);
  const numeroFatura = codigo('FR');
  const agora = Timestamp.now();

  const pedido = await db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const produtoId of itensPorProduto.keys()) {
      let snapshot = await transaction.get(db.collection('produtos').doc(produtoId));
      // Compatibilidade com produtos antigos, criados antes de o ID público ser
      // usado como ID do documento. Novos produtos não passam por esta consulta.
      if (!snapshot.exists) {
        const legado = await transaction.get(db.collection('produtos').where('id', '==', produtoId).limit(1));
        if (legado.empty) erro('not-found', 'Um produto do carrinho já não existe.');
        snapshot = legado.docs[0];
      }
      snapshots.push(snapshot);
    }
    let subtotalCentavos = 0;
    const itens = [];

    snapshots.forEach((snapshot) => {
      const produto = snapshot.data();
      const quantidade = itensPorProduto.get(String(produto.id || snapshot.id));
      const estoque = Number(produto.estoque ?? 0);
      const precoCentavos = centavosDePreco(produto.preco);
      if (!Number.isInteger(estoque) || estoque < quantidade) {
        erro('failed-precondition', `${produto.nome || 'Produto'} não possui estoque suficiente.`);
      }
      if (precoCentavos <= 0) erro('failed-precondition', 'Um produto tem preço inválido.');

      subtotalCentavos += precoCentavos * quantidade;
      const comissaoPercentual = percentualComissao(produto);
      const vendedor = vendedorDoProduto(produto);
      const brutoItemCentavos = precoCentavos * quantidade;
      const comissaoItemCentavos = Math.round(brutoItemCentavos * (comissaoPercentual / 100));
      itens.push({
        produtoId: snapshot.id,
        nome: texto(produto.nome, 'Nome do produto', 160),
        quantidade,
        preco: moeda(precoCentavos),
        observacao: '',
        vendedorId: vendedor.id,
        vendedorNome: vendedor.nome,
        comissaoPercentual,
        valorBruto: moeda(brutoItemCentavos),
        comissaoVora: moeda(comissaoItemCentavos),
        valorVendedor: moeda(brutoItemCentavos - comissaoItemCentavos)
      });
    });

    let descontoCentavos = 0;
    let cupomAplicado = null;
    if (cupomRef) {
      const cupomSnapshot = await transaction.get(cupomRef.ref);
      if (!cupomSnapshot.exists || !podeUsarCupom(cupomSnapshot.data(), request.auth.uid, agora.toDate())) {
        erro('failed-precondition', 'Cupom inválido, expirado ou indisponível.');
      }
      const cupom = cupomSnapshot.data();
      descontoCentavos = Math.round(subtotalCentavos * (Number(cupom.percentual) / 100));
      cupomAplicado = { codigo: codigoCupom, percentual: Number(cupom.percentual) };
    } else if (codigoCupom) {
      erro('failed-precondition', 'Cupom inválido.');
    }

    const freteCentavos = Math.round(FRETES[cliente.bairro] * 100);
    const totalCentavos = subtotalCentavos - descontoCentavos + freteCentavos;
    const comissaoProdutosCentavos = itens.reduce((total, item) => total + Math.round(Number(item.comissaoVora || 0) * 100), 0);
    const receitaVoraCentavos = comissaoProdutosCentavos + freteCentavos;
    const valorVendedoresCentavos = Math.max(0, subtotalCentavos - comissaoProdutosCentavos);
    const venda = {
      codigoRastreio,
      numeroFatura,
      uidCliente: request.auth.uid,
      status: 'aguardando_pagamento',
      pagamento: { metodo: 'multicaixa_manual', status: 'pendente' },
      nomeCliente: cliente.nome,
      telefoneCliente: cliente.telefone,
      nifCliente: cliente.nif,
      moradaCliente: cliente.morada,
      bairro: cliente.bairro,
      observacao: cliente.observacao,
      itens,
      produtosResumo: itens.map((item) => `${item.nome} (x${item.quantidade})`).join(', '),
      totalItens: itens.reduce((total, item) => total + item.quantidade, 0),
      subtotal: moeda(subtotalCentavos),
      frete: moeda(freteCentavos),
      valorDesconto: moeda(descontoCentavos),
      valorTotal: moeda(totalCentavos),
      cupomAplicado,
      monetizacao: {
        modelo: 'comissao_por_venda',
        comissaoProdutos: moeda(comissaoProdutosCentavos),
        receitaVora: moeda(receitaVoraCentavos),
        valorVendedores: moeda(valorVendedoresCentavos),
        comissaoGerada: false
      },
      criadoEm: agora,
      atualizadoEm: agora,
      dataHora: agora.toDate().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' }),
      expiraEm: Timestamp.fromMillis(agora.toMillis() + 2 * 60 * 60 * 1000)
    };

    transaction.create(pedidoRef, venda);
    transaction.create(rastreioRef, {
      codigo: codigoRastreio,
      status: venda.status,
      criadoEm: agora,
      atualizadoEm: agora
    });
    return venda;
  });

  logger.info('Pedido pendente criado', { pedidoId: pedidoRef.id, uid: request.auth.uid });
  return {
    pedidoId: pedidoRef.id,
    codigoRastreio: pedido.codigoRastreio,
    numeroFatura: pedido.numeroFatura,
    status: pedido.status,
    subtotal: pedido.subtotal,
    frete: pedido.frete,
    valorDesconto: pedido.valorDesconto,
    valorTotal: pedido.valorTotal,
    itens: pedido.itens,
    cupomAplicado: pedido.cupomAplicado
  };
});

/*
 * Uso administrativo após conferir o pagamento no provedor ou em um webhook
 * autenticado. A baixa de estoque ocorre atomamente apenas uma vez, quando o
 * pedido efetivamente passa para "pago".
 */
exports.atualizarEstadoPedido = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request);
  const codigoRastreio = texto(request.data?.codigoRastreio, 'Código de rastreio', 64).toUpperCase();
  const novoStatus = texto(request.data?.status, 'Estado', 32);
  if (!ESTADOS.has(novoStatus)) erro('invalid-argument', 'Estado inválido.');

  const pedidoQuery = await db.collection('vendas')
    .where('codigoRastreio', '==', codigoRastreio)
    .limit(1)
    .get();
  if (pedidoQuery.empty) erro('not-found', 'Pedido não encontrado.');

  const pedidoRef = pedidoQuery.docs[0].ref;
  const rastreioRef = db.collection('rastreiosPublicos').doc(codigoRastreio);

  await db.runTransaction(async (transaction) => {
    const pedidoSnapshot = await transaction.get(pedidoRef);
    if (!pedidoSnapshot.exists) erro('not-found', 'Pedido não encontrado.');
    const pedido = pedidoSnapshot.data();
    const atual = pedido.status;

    const transicoes = {
      aguardando_pagamento: ['pago', 'cancelado'],
      pago: ['em_preparacao', 'enviado', 'cancelado'],
      em_preparacao: ['enviado', 'cancelado'],
      enviado: ['entregue'],
      entregue: [],
      cancelado: []
    };
    if (atual !== novoStatus && !(transicoes[atual] || []).includes(novoStatus)) {
      erro('failed-precondition', `Não é permitido mudar de ${atual} para ${novoStatus}.`);
    }

    if (atual !== 'pago' && novoStatus === 'pago') {
      const expiraEm = pedido.expiraEm?.toDate ? pedido.expiraEm.toDate() : null;
      if (expiraEm && expiraEm.getTime() < Date.now()) {
        erro('failed-precondition', 'Este pedido expirou. Crie um novo pedido para continuar.');
      }
      const refs = (pedido.itens || []).map((item) => db.collection('produtos').doc(item.produtoId));
      const produtos = await transaction.getAll(...refs);
      produtos.forEach((produtoSnapshot, index) => {
        const item = pedido.itens[index];
        if (!produtoSnapshot.exists) erro('failed-precondition', 'Produto não encontrado para baixa de estoque.');
        const estoque = Number(produtoSnapshot.data().estoque ?? 0);
        if (!Number.isInteger(estoque) || estoque < item.quantidade) {
          erro('failed-precondition', `Estoque insuficiente para ${item.nome}.`);
        }
        transaction.update(produtoSnapshot.ref, { estoque: estoque - item.quantidade, atualizadoEm: Timestamp.now() });
      });

      // O cupom só é consumido quando o pagamento é efetivamente confirmado.
      if (pedido.cupomAplicado?.codigo) {
        const cupomRef = await buscarCupom(pedido.cupomAplicado.codigo);
        if (!cupomRef) erro('failed-precondition', 'O cupom do pedido não está mais disponível.');
        const cupomSnapshot = await transaction.get(cupomRef.ref);
        if (!cupomSnapshot.exists || !podeUsarCupom(cupomSnapshot.data(), pedido.uidCliente, Timestamp.now().toDate())) {
          erro('failed-precondition', 'O cupom do pedido expirou ou atingiu o limite de uso.');
        }
        transaction.update(cupomRef.ref, { usos: FieldValue.increment(1), atualizadoEm: Timestamp.now() });
      }

      const pontos = Math.floor(Number(pedido.valorTotal || 0) / 1000);
      const comissaoRef = db.collection('comissoes').doc(pedidoRef.id);
      transaction.set(comissaoRef, {
        pedidoId: pedidoRef.id,
        codigoRastreio: pedido.codigoRastreio,
        numeroFatura: pedido.numeroFatura,
        uidCliente: pedido.uidCliente,
        modelo: 'comissao_por_venda',
        valorVendaProdutos: Number(pedido.subtotal || 0),
        comissaoVora: Number(pedido.monetizacao?.comissaoProdutos || 0),
        receitaFreteVora: Number(pedido.frete || 0),
        receitaTotalVora: Number(pedido.monetizacao?.receitaVora || 0),
        status: 'gerada',
        criadoEm: agora
      }, { merge: true });

      // Regista saldo e um espelho por vendedor para o painel da loja.
      const porVendedor = new Map();
      for (const item of (pedido.itens || [])) {
        const vid = item.vendedorId || 'vora313';
        const atualV = porVendedor.get(vid) || { valorVenda: 0, comissao: 0, valorVendedor: 0, produtos: [] };
        atualV.valorVenda += Number(item.valorBruto || 0);
        atualV.comissao += Number(item.comissaoVora || 0);
        atualV.valorVendedor += Number(item.valorVendedor || 0);
        atualV.produtos.push(`${item.nome} (x${item.quantidade})`);
        porVendedor.set(vid, atualV);
      }
      for (const [uidVendedor, resumo] of porVendedor.entries()) {
        if (uidVendedor === 'vora313') continue;
        const vendedorRef = db.collection('vendedores').doc(uidVendedor);
        const movimentoRef = db.collection('movimentosVendedores').doc();
        const espelhoRef = db.collection('vendasVendedor').doc(`${uidVendedor}_${pedidoRef.id}`);
        transaction.set(movimentoRef, { uidVendedor, pedidoId: pedidoRef.id, codigoRastreio: pedido.codigoRastreio, tipo: 'venda_paga', valorVenda: resumo.valorVenda, comissaoVora: resumo.comissao, valorVendedor: resumo.valorVendedor, status: 'disponivel', criadoEm: agora });
        transaction.set(espelhoRef, { uidVendedor, pedidoId: pedidoRef.id, codigoRastreio: pedido.codigoRastreio, status: 'pago', valorVenda: resumo.valorVenda, comissaoVora: resumo.comissao, valorVendedor: resumo.valorVendedor, produtosResumo: resumo.produtos.join(', '), criadoEm: agora, atualizadoEm: agora });
        transaction.set(vendedorRef, { saldoDisponivel: FieldValue.increment(resumo.valorVendedor), totalVendas: FieldValue.increment(1), atualizadoEm: agora }, { merge: true });
      }

      transaction.update(pedidoRef, {
        'monetizacao.comissaoGerada': true,
        'monetizacao.comissaoGeradaEm': agora
      });

      if (pontos > 0 && pedido.uidCliente) {
        const clienteRef = db.collection('clientes').doc(pedido.uidCliente);
        transaction.set(clienteRef, {
          pontos: FieldValue.increment(pontos),
          historico: FieldValue.arrayUnion({
            data: Timestamp.now(),
            tipo: 'ganho',
            pontos,
            descricao: `Compra ${pedido.numeroFatura || pedido.codigoRastreio}`
          })
        }, { merge: true });
      }
    }

    // Cancelamento após pagamento exigiria estorno e reposição de estoque.
    // Para evitar inconsistências, o painel só pode cancelar pedidos ainda pendentes.
    if (novoStatus === 'cancelado' && atual !== 'aguardando_pagamento') {
      erro('failed-precondition', 'Um pedido pago/em preparação não pode ser cancelado por este fluxo. Faça o estorno e a reposição por um processo específico.');
    }

    const agora = Timestamp.now();
    transaction.update(pedidoRef, {
      status: novoStatus,
      'pagamento.status': novoStatus === 'pago' ? 'confirmado' : pedido.pagamento?.status || 'pendente',
      atualizadoEm: agora
    });
    transaction.set(rastreioRef, { status: novoStatus, atualizadoEm: agora }, { merge: true });
  });

  return { codigoRastreio, status: novoStatus };
});


exports.solicitarVendedor = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) erro('unauthenticated', 'Inicie sessão para enviar a candidatura.');
  const uid = request.auth.uid;
  const nome = limparTexto(request.data?.nome, 120, true);
  const nomeLoja = limparTexto(request.data?.nomeLoja, 120, true);
  const telefone = limparTexto(request.data?.telefone, 15, true);
  const email = limparTexto(request.data?.email || request.auth.token.email, 160, true);
  const morada = limparTexto(request.data?.morada, 300, false);
  const categoria = limparTexto(request.data?.categoria, 80, true);
  const descricao = limparTexto(request.data?.descricao, 1000, false);
  if (!/^\d{9,15}$/.test(telefone)) erro('invalid-argument', 'Telefone inválido.');
  const ref = db.collection('vendedores').doc(uid);
  const existente = await ref.get();
  if (existente.exists) {
    const status = String(existente.data().status || '');
    if (status === 'aprovado') return { ok: true, status };
    if (status === 'pendente') return { ok: true, status };
    if (status === 'suspenso') erro('failed-precondition', 'A sua loja está suspensa. Contacte a VORA 313.');
  }
  const agora = Timestamp.now();
  const base = { uid, nome, nomeLoja, telefone, email, morada, categoria, descricao, status: 'pendente', ativo: false, plano: 'basico', atualizadoEm: agora };
  if (!existente.exists) Object.assign(base, { saldoDisponivel: 0, saldoRetido: 0, totalVendas: 0, totalProdutos: 0, criadoEm: agora });
  await ref.set(base, { merge: true });
  return { ok: true, status: 'pendente' };
});

exports.atualizarPerfilVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request);
  const nome = limparTexto(request.data?.nome, 120, true);
  const nomeLoja = limparTexto(request.data?.nomeLoja, 120, true);
  const telefone = limparTexto(request.data?.telefone, 15, true);
  const morada = limparTexto(request.data?.morada, 300, false);
  const categoria = limparTexto(request.data?.categoria, 80, true);
  const descricao = limparTexto(request.data?.descricao, 1000, false);
  if (!/^\d{9,15}$/.test(telefone)) erro('invalid-argument', 'Telefone inválido.');
  await db.collection('vendedores').doc(request.auth.uid).update({ nome, nomeLoja, telefone, morada, categoria, descricao, atualizadoEm: Timestamp.now() });
  return { ok: true };
});

exports.atualizarDadosRecebimento = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request);
  const metodo = texto(request.data?.metodo, 'Método de recebimento', 40);
  const titular = texto(request.data?.titular, 'Titular', 160);
  const referencia = texto(request.data?.referencia, 'Conta/IBAN/telefone de recebimento', 160);
  if (!['transferencia_bancaria', 'multicaixa_express', 'outro'].includes(metodo)) erro('invalid-argument', 'Método de recebimento inválido.');
  await db.collection('vendedores').doc(request.auth.uid).update({ dadosRecebimento: { metodo, titular, referencia, atualizadoEm: Timestamp.now() }, atualizadoEm: Timestamp.now() });
  return { ok: true };
});

exports.criarProdutoVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request); const v = await obterVendedor(request.auth.uid); const input=request.data||{};
  const nome=limparTexto(input.nome,160,true), categoria=limparTexto(input.categoria,80,true), preco=limparTexto(input.preco,60,true), descricao=limparTexto(input.descricao,3000,true);
  const estoque=Number(input.estoque); if(!Number.isInteger(estoque)||estoque<0||estoque>100000) erro('invalid-argument','Estoque inválido.');
  const imagens=Array.isArray(input.imagens)?input.imagens.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[]; const ref=db.collection('produtos').doc(); const agora=Timestamp.now();
  const produto={id:ref.id,ordem:999999,nome,categoria,preco,precoAntigo:limparTexto(input.precoAntigo,60,false),desconto:limparTexto(input.desconto,30,false),parcelas:limparTexto(input.parcelas,80,false),freteGratis:input.freteGratis===true,descricao,imagens,tag:limparTexto(input.tag||categoria,80,false),estoque,marca:limparTexto(input.marca,120,false),sku:limparTexto(input.sku,80,false),vendedorId:request.auth.uid,vendedorNome:v.nomeLoja||v.nome,statusAprovacao:'aguardando_aprovacao',ativo:false,vendedorAtivo:true,monetizacao:{destaque:false},criadoEm:agora,atualizadoEm:agora};
  await ref.set(produto); await db.collection('vendedores').doc(request.auth.uid).set({totalProdutos:FieldValue.increment(1),atualizadoEm:agora},{merge:true}); return {ok:true,produtoId:ref.id,status:produto.statusAprovacao};
});

exports.atualizarProdutoVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request); const id=texto(request.data?.produtoId,'Produto',128); const ref=db.collection('produtos').doc(id); const snap=await ref.get();
  if(!snap.exists||snap.data().vendedorId!==request.auth.uid) erro('permission-denied','Produto não pertence à sua loja.'); const p=request.data?.produto||{};
  const estoque=Number(p.estoque); if(!Number.isInteger(estoque)||estoque<0||estoque>100000) erro('invalid-argument','Estoque inválido.');
  await ref.update({nome:limparTexto(p.nome,160,true),categoria:limparTexto(p.categoria,80,true),preco:limparTexto(p.preco,60,true),precoAntigo:limparTexto(p.precoAntigo,60,false),desconto:limparTexto(p.desconto,30,false),parcelas:limparTexto(p.parcelas,80,false),freteGratis:p.freteGratis===true,descricao:limparTexto(p.descricao,3000,true),imagens:Array.isArray(p.imagens)?p.imagens.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[],estoque,marca:limparTexto(p.marca,120,false),sku:limparTexto(p.sku,80,false),tag:limparTexto(p.tag,80,false),statusAprovacao:'aguardando_aprovacao',ativo:false,vendedorAtivo:true,atualizadoEm:Timestamp.now()});
  return {ok:true,status:'aguardando_aprovacao'};
});

exports.solicitarDestaque = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request); const id=texto(request.data?.produtoId,'Produto',128); const dias=Number(request.data?.dias); const precos={7:5000,15:9000,30:15000};
  if(!precos[dias]) erro('invalid-argument','Período de destaque inválido.'); const produto=await db.collection('produtos').doc(id).get();
  if(!produto.exists||produto.data().vendedorId!==request.auth.uid||produto.data().statusAprovacao!=='aprovado'||produto.data().ativo!==true) erro('permission-denied','Produto não está aprovado e publicado.');
  const existentes=await db.collection('destaquesSolicitados').where('uidVendedor','==',request.auth.uid).where('produtoId','==',id).get();
  const agoraMs=Date.now();
  for (const item of existentes.docs) {
    const d=item.data();
    if (['aguardando_pagamento','pendente'].includes(d.status)) erro('already-exists','Já existe uma solicitação de destaque pendente para este produto.');
    const fim=d.fim?.toDate ? d.fim.toDate().getTime() : 0;
    if (d.status==='ativo' && fim > agoraMs) erro('already-exists','Este produto já tem um destaque ativo.');
  }
  const ref=db.collection('destaquesSolicitados').doc(); await ref.set({uidVendedor:request.auth.uid,produtoId:id,nomeProduto:produto.data().nome,dias,valor:precos[dias],status:'aguardando_pagamento',criadoEm:Timestamp.now()}); return {ok:true,requestId:ref.id,valor:precos[dias]};
});

exports.solicitarLevantamento = onCall({ region: 'us-central1' }, async (request) => {
  garantirVendedorAprovado(request); const v=await obterVendedor(request.auth.uid); const dados=v.dadosRecebimento||{};
  if(!dados.metodo||!dados.titular||!dados.referencia) erro('failed-precondition','Configure os dados de recebimento antes de solicitar um levantamento.');
  const valor=Number(request.data?.valor||v.saldoDisponivel||0);
  if(!Number.isFinite(valor)||valor<=0||valor>Number(v.saldoDisponivel||0)) erro('failed-precondition','Valor de levantamento inválido ou superior ao saldo disponível.');
  const ref=db.collection('levantamentos').doc(); const agora=Timestamp.now();
  await db.runTransaction(async tx=>{const vr=db.collection('vendedores').doc(request.auth.uid);const fresh=await tx.get(vr);const saldo=Number(fresh.data()?.saldoDisponivel||0);if(valor>saldo) erro('failed-precondition','Saldo alterado. Tente novamente.');tx.update(vr,{saldoDisponivel:FieldValue.increment(-valor),saldoRetido:FieldValue.increment(valor),atualizadoEm:agora});tx.set(ref,{uidVendedor:request.auth.uid,valor,status:'pendente',dadosRecebimento:{...dados},criadoEm:agora,atualizadoEm:agora});});
  return {ok:true,levantamentoId:ref.id,valor};
});

async function atualizarProdutosDoVendedor(uid, vendedorAtivo) {
  const snap = await db.collection('produtos').where('vendedorId','==',uid).get();
  let batch = db.batch(); let count = 0;
  for (const produto of snap.docs) {
    batch.update(produto.ref, { vendedorAtivo, atualizadoEm: Timestamp.now() });
    count++;
    if (count === 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  if (count) await batch.commit();
}

exports.gerirVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const uid=texto(request.data?.uid,'Vendedor',128); const acao=texto(request.data?.acao,'Ação',30); const ref=db.collection('vendedores').doc(uid); const snap=await ref.get(); if(!snap.exists) erro('not-found','Vendedor não encontrado.');
  const user=await admin.auth().getUser(uid); const claims={...(user.customClaims||{})};
  if(acao==='aprovar'||acao==='reativar'){claims.seller=true;await admin.auth().setCustomUserClaims(uid,claims);await ref.update({status:'aprovado',ativo:true,atualizadoEm:Timestamp.now()});await atualizarProdutosDoVendedor(uid,true);}
  else if(acao==='recusar'||acao==='suspender'){claims.seller=false;await admin.auth().setCustomUserClaims(uid,claims);await ref.update({status:acao==='recusar'?'recusado':'suspenso',ativo:false,atualizadoEm:Timestamp.now()});await atualizarProdutosDoVendedor(uid,false);}
  else erro('invalid-argument','Ação inválida.'); return {ok:true,status:(await ref.get()).data().status};
});

exports.aprovarProdutoVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const id=texto(request.data?.produtoId,'Produto',128); const acao=texto(request.data?.acao,'Ação',20); if(!['aprovar','recusar'].includes(acao)) erro('invalid-argument','Ação inválida.');
  const ref=db.collection('produtos').doc(id); const snap=await ref.get(); if(!snap.exists||!snap.data().vendedorId) erro('not-found','Produto de vendedor não encontrado.');
  const produto=snap.data(); const vendedor=await obterVendedor(produto.vendedorId).catch(()=>null);
  const ativo=acao==='aprovar';
  if(ativo && !vendedor) erro('failed-precondition','O vendedor não está ativo/aprovado.');
  await ref.update({statusAprovacao:ativo?'aprovado':'recusado',ativo, vendedorAtivo: ativo ? true : produto.vendedorAtivo !== false, atualizadoEm:Timestamp.now()}); return {ok:true,status:ativo?'aprovado':'recusado'};
});

exports.definirDestaqueManual = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const id=texto(request.data?.produtoId,'Produto',128); const ativo=request.data?.ativo===true; const ref=db.collection('produtos').doc(id); const snap=await ref.get(); if(!snap.exists) erro('not-found','Produto não encontrado.');
  if (ativo) { const p=snap.data(); if (p.vendedorId) { const v=await obterVendedor(p.vendedorId).catch(()=>null); if(!v || p.statusAprovacao!=='aprovado') erro('failed-precondition','O vendedor/produto não está aprovado.'); } }
  await ref.update({'monetizacao.destaque':ativo, 'monetizacao.destaqueInicio': ativo ? Timestamp.now() : null, 'monetizacao.destaqueFim': ativo ? Timestamp.fromMillis(Date.now()+30*86400000) : null, 'monetizacao.atualizadoEm':Timestamp.now(), atualizadoEm:Timestamp.now()});
  return {ok:true,ativo};
});

exports.processarDestaque = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const id=texto(request.data?.requestId,'Solicitação',128); const acao=texto(request.data?.acao,'Ação',20); const reqRef=db.collection('destaquesSolicitados').doc(id); const snap=await reqRef.get(); if(!snap.exists) erro('not-found','Solicitação não encontrada.'); const d=snap.data();
  if(!['aguardando_pagamento','pendente'].includes(d.status)) erro('failed-precondition','Esta solicitação já foi processada.');
  if(acao==='recusar'){await reqRef.update({status:'recusado',atualizadoEm:Timestamp.now()});return{ok:true};} if(acao!=='aprovar') erro('invalid-argument','Ação inválida.');
  const produtoRef=db.collection('produtos').doc(d.produtoId); const vendedorRef=db.collection('vendedores').doc(d.uidVendedor); const inicio=Timestamp.now(); const fim=Timestamp.fromMillis(inicio.toMillis()+Number(d.dias)*86400000);
  await db.runTransaction(async tx=>{const ps=await tx.get(produtoRef);const vs=await tx.get(vendedorRef);if(!ps.exists||!vs.exists||vs.data().status!=='aprovado'||vs.data().ativo===false||ps.data().statusAprovacao!=='aprovado'||ps.data().ativo!==true) erro('failed-precondition','Vendedor ou produto deixou de estar ativo.'); const ativos=await db.collection('destaquesSolicitados').where('uidVendedor','==',d.uidVendedor).where('produtoId','==',d.produtoId).get(); for(const a of ativos.docs){const ad=a.data();const fimAtivo=ad.fim?.toDate?ad.fim.toDate().getTime():0;if(a.id!==id&&ad.status==='ativo'&&fimAtivo>Date.now()) erro('already-exists','O produto já possui um destaque ativo.');} tx.update(reqRef,{status:'ativo',inicio,fim,atualizadoEm:inicio});tx.update(produtoRef,{'monetizacao.destaque':true,'monetizacao.destaqueInicio':inicio,'monetizacao.destaqueFim':fim,'monetizacao.destaqueSolicitacaoId':id,atualizadoEm:inicio});});
  return {ok:true,fim:fim.toDate().toISOString()};
});

exports.definirPlanoVendedor = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const uid=texto(request.data?.uid,'Vendedor',128); const plano=texto(request.data?.plano,'Plano',20).toLowerCase(); if(!['basico','profissional','premium'].includes(plano)) erro('invalid-argument','Plano inválido.'); await db.collection('vendedores').doc(uid).update({plano,atualizadoEm:Timestamp.now()}); return {ok:true,plano};
});

exports.processarLevantamento = onCall({ region: 'us-central1' }, async (request) => {
  garantirAdmin(request); const id=texto(request.data?.levantamentoId,'Levantamento',128); const acao=texto(request.data?.acao,'Ação',20); const ref=db.collection('levantamentos').doc(id);
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists) erro('not-found','Levantamento não encontrado.');const d=snap.data();if(d.status!=='pendente') erro('failed-precondition','Levantamento já processado.');const vr=db.collection('vendedores').doc(d.uidVendedor);const vs=await tx.get(vr);const agora=Timestamp.now();if(acao==='aprovar'){tx.update(vr,{saldoRetido:FieldValue.increment(-Number(d.valor||0)),atualizadoEm:agora});tx.update(ref,{status:'pago',processadoEm:agora,atualizadoEm:agora});}else if(acao==='recusar'){tx.update(vr,{saldoRetido:FieldValue.increment(-Number(d.valor||0)),saldoDisponivel:FieldValue.increment(Number(d.valor||0)),atualizadoEm:agora});tx.update(ref,{status:'recusado',processadoEm:agora,atualizadoEm:agora});}else erro('invalid-argument','Ação inválida.');}); return {ok:true};
});
