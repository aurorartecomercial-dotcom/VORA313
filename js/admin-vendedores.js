import { auth, db, functions, supabase } from './config.js';
import { collection, getDocs, getIdTokenResult, signInWithEmailAndPassword, signOut, httpsCallable } from './supabase-compat.js';
import { escapeHTML, IMAGEM_FALLBACK, urlSegura } from './utils.js';

const $ = (id) => document.getElementById(id);
const CHECKLIST_REVISAO = ['imagens', 'produto', 'descricao', 'politica'];

let vendedores = [];
let produtos = [];
let vendas = [];
let produtoEmRevisao = null;

function estadoClasse(estado) {
  return estado === 'aprovado' ? 'approved' : ['recusado', 'suspenso'].includes(estado) ? 'refused' : '';
}

function estadoNome(estado) {
  return ({ pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', suspenso: 'Suspenso' })[estado] || estado || '—';
}

function estadoProduto(produto) {
  return String(produto?.statusAprovacao || produto?.status_aprovacao || 'aguardando_aprovacao');
}

function estadoProdutoNome(estado) {
  return ({ aguardando_aprovacao: 'Aguardando revisão', aprovado: 'Aprovado e publicado', recusado: 'Recusado' })[estado] || estado || '—';
}

function moeda(valor) {
  return `${Number(valor || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

function precoProduto(produto) {
  const preco = String(produto?.preco || '').trim();
  if (preco) return preco;
  return moeda(produto?.precoValor ?? produto?.preco_valor ?? 0);
}

function dataProduto(produto) {
  const valor = produto?.atualizadoEm || produto?.atualizado_em || produto?.criadoEm || produto?.criado_em;
  const data = new Date(valor || 0);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}

function dataLegivel(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString('pt-AO');
}

function imagensProduto(produto) {
  const origem = Array.isArray(produto?.imagens)
    ? produto.imagens
    : typeof produto?.imagens === 'string' ? produto.imagens.split(',') : [];
  return origem
    .filter((imagem) => typeof imagem === 'string' && imagem.trim())
    .map((imagem) => urlSegura(imagem.trim()))
    .filter(Boolean)
    .slice(0, 8);
}

function imagemPrincipalProduto(produto) {
  return imagensProduto(produto)[0] || IMAGEM_FALLBACK;
}

function vendedorDoProduto(produto) {
  const vendedorId = String(produto?.vendedorId || produto?.vendedor_id || '');
  return vendedores.find((vendedor) => String(vendedor.id) === vendedorId);
}

function vendedorAtivo(vendedor) {
  return vendedor?.status === 'aprovado' && vendedor?.ativo !== false;
}

function mostrarMensagem(texto, ok = true) {
  const box = $('mensagemVendedores');
  if (!box) return;
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
  produtos = produtosSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.vendedorId || item.vendedor_id);
  vendas = vendasSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  renderizar();
}

function renderizar() {
  const termo = String($('filtroVendedores')?.value || '').trim().toLowerCase();
  const statusFiltro = $('statusVendedores')?.value || 'todos';
  const lista = vendedores.filter((vendedor) => {
    const texto = `${vendedor.nome || ''} ${vendedor.nomeLoja || vendedor.nome_loja || ''} ${vendedor.email || ''}`.toLowerCase();
    return (!termo || texto.includes(termo)) && (statusFiltro === 'todos' || vendedor.status === statusFiltro);
  });
  const pendentesProdutos = produtos.filter((produto) => estadoProduto(produto) === 'aguardando_aprovacao').length;

  $('kpiTotalVendedores').textContent = vendedores.length;
  $('kpiPendentesVendedores').textContent = vendedores.filter((vendedor) => vendedor.status === 'pendente').length;
  $('kpiAprovadosVendedores').textContent = vendedores.filter(vendedorAtivo).length;
  $('kpiProdutosPendentes').textContent = pendentesProdutos;

  const produtosPorVendedor = produtos.reduce((mapa, produto) => {
    const id = produto.vendedorId || produto.vendedor_id;
    mapa[id] = (mapa[id] || 0) + 1;
    return mapa;
  }, {});
  const vendasPorVendedor = vendas.reduce((mapa, venda) => {
    const id = venda.uidVendedor || venda.uid_vendedor;
    if (!id) return mapa;
    const atual = mapa[id] || { pedidos: 0, valor: 0 };
    atual.pedidos += 1;
    atual.valor += Number(venda.valorVenda ?? venda.valor_venda ?? venda.valorVendedor ?? venda.valor_vendedor ?? 0);
    mapa[id] = atual;
    return mapa;
  }, {});

  const box = $('listaVendedores');
  if (!lista.length) {
    box.innerHTML = '<tr><td class="adm-empty" colspan="7">Nenhum vendedor encontrado para este filtro.</td></tr>';
  } else {
    box.innerHTML = lista.map((vendedor) => {
      const dadosVendas = vendasPorVendedor[vendedor.id] || { pedidos: 0, valor: 0 };
      const estado = vendedor.status || 'pendente';
      let acoes = '';
      if (estado === 'pendente') {
        acoes = `<button class="adm-btn" data-acao="aprovar" data-id="${escapeHTML(vendedor.id)}">Aprovar</button><button class="adm-btn danger" data-acao="recusar" data-id="${escapeHTML(vendedor.id)}">Recusar</button>`;
      } else if (vendedorAtivo(vendedor)) {
        acoes = `<button class="adm-btn warn" data-acao="suspender" data-id="${escapeHTML(vendedor.id)}">Suspender</button>`;
      } else {
        acoes = `<button class="adm-btn" data-acao="reativar" data-id="${escapeHTML(vendedor.id)}">Reativar</button>`;
      }
      const loja = vendedorAtivo(vendedor)
        ? `<a class="adm-btn alt" target="_blank" rel="noopener" href="loja.html?id=${encodeURIComponent(vendedor.id)}">Ver loja</a>`
        : '';
      const motivo = vendedor.motivoRecusa || vendedor.motivo_recusa;
      return `<tr><td><strong>${escapeHTML(vendedor.nome || 'Sem nome')}</strong><small>${escapeHTML(vendedor.nomeLoja || vendedor.nome_loja || 'Sem loja')}</small></td><td>${escapeHTML(vendedor.email || '—')}<small>${escapeHTML(vendedor.telefone || '')}</small></td><td><span class="adm-badge ${estadoClasse(estado)}">${escapeHTML(estadoNome(estado))}</span>${motivo ? `<small>Motivo: ${escapeHTML(motivo)}</small>` : ''}</td><td>${produtosPorVendedor[vendedor.id] || 0}</td><td>${dadosVendas.pedidos}</td><td>${escapeHTML(moeda(dadosVendas.valor))}</td><td><div class="adm-actions">${loja}<button class="adm-btn alt" data-detalhe="produtos" data-id="${escapeHTML(vendedor.id)}">Produtos</button><button class="adm-btn alt" data-detalhe="vendas" data-id="${escapeHTML(vendedor.id)}">Vendas</button>${acoes}</div></td></tr>`;
    }).join('');
  }
  renderizarFilaProdutos();
}

function renderizarFilaProdutos() {
  const alvo = $('listaProdutosRevisao');
  const pendentes = produtos
    .filter((produto) => estadoProduto(produto) === 'aguardando_aprovacao')
    .sort((a, b) => dataProduto(b) - dataProduto(a));

  $('contadorFilaProdutos').textContent = pendentes.length;
  if (!pendentes.length) {
    alvo.innerHTML = '<tr><td class="adm-empty" colspan="7">Não há produtos aguardando revisão.</td></tr>';
    return;
  }

  alvo.innerHTML = pendentes.map((produto) => {
    const vendedor = vendedorDoProduto(produto);
    const vendedorNome = vendedor?.nomeLoja || vendedor?.nome_loja || vendedor?.nome || produto.vendedorNome || produto.vendedor_nome || 'Vendedor não encontrado';
    const avisoVendedor = vendedorAtivo(vendedor) ? '' : '<small style="color:#a83226">A loja ainda não está aprovada/ativa.</small>';
    return `<tr><td><img class="adm-product-preview" src="${escapeHTML(imagemPrincipalProduto(produto))}" alt="Prévia de ${escapeHTML(produto.nome || 'produto')}" loading="lazy"></td><td><strong>${escapeHTML(produto.nome || 'Produto sem nome')}</strong><small>${escapeHTML(produto.categoria || 'Sem categoria')} · ${escapeHTML(produto.sku || 'Sem SKU')}</small></td><td>${escapeHTML(vendedorNome)}<small>${escapeHTML(vendedor?.email || '')}</small>${avisoVendedor}</td><td>${escapeHTML(precoProduto(produto))}</td><td>${Number(produto.estoque || 0)}</td><td><span class="adm-product-status">${escapeHTML(estadoProdutoNome(estadoProduto(produto)))}</span></td><td><button class="adm-btn" data-revisar-produto="${escapeHTML(produto.id)}">Rever e decidir</button></td></tr>`;
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
    alvo.innerHTML = `<strong>Produtos de ${escapeHTML(vendedor.nomeLoja || vendedor.nome_loja || vendedor.nome || 'vendedor')}</strong>${lista.length ? lista.map((produto) => `<div class="adm-detail-product"><span>${escapeHTML(produto.nome || 'Produto')} · ${escapeHTML(estadoProdutoNome(estadoProduto(produto)))}</span>${estadoProduto(produto) === 'aguardando_aprovacao' ? `<button class="adm-btn alt" data-revisar-produto="${escapeHTML(produto.id)}">Rever</button>` : ''}</div>`).join('') : '<p>Nenhum produto registado.</p>'}`;
  } else {
    const lista = vendas.filter(eVenda);
    alvo.innerHTML = `<strong>Vendas de ${escapeHTML(vendedor.nomeLoja || vendedor.nome_loja || vendedor.nome || 'vendedor')}</strong><br>${lista.length ? lista.map((venda) => `${escapeHTML(venda.codigoRastreio || venda.codigo_rastreio || venda.id)} · ${escapeHTML(venda.status || 'sem estado')} · ${escapeHTML(moeda(venda.valorVenda ?? venda.valor_venda ?? venda.valorVendedor ?? venda.valor_vendedor ?? 0))}`).join('<br>') : 'Nenhuma venda registada.'}`;
  }
  alvo.hidden = false;
}

function htmlRevisaoProduto(produto, vendedor) {
  const imagens = imagensProduto(produto);
  const status = estadoProduto(produto);
  const lojaAtiva = vendedorAtivo(vendedor);
  const valor = (item) => escapeHTML(item || '—');
  const galeria = imagens.length
    ? imagens.map((imagem, indice) => `<a href="${escapeHTML(imagem)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem ${indice + 1}"><img src="${escapeHTML(imagem)}" alt="Imagem ${indice + 1} do produto ${escapeHTML(produto.nome || '')}" loading="lazy"></a>`).join('')
    : '<div class="review-alert error">O vendedor não enviou uma imagem válida. Não aprove este anúncio até isso ser corrigido.</div>';
  const revisadoEm = produto.revisadoEm || produto.revisado_em;
  const revisadoPor = produto.revisadoPorEmail || produto.revisado_por_email || produto.revisadoPor || produto.revisado_por;
  const notaAnterior = produto.revisaoNotas || produto.revisao_notas || produto.motivoRecusa || produto.motivo_recusa;
  const alertaVendedor = lojaAtiva
    ? ''
    : '<p class="review-alert error"><strong>Publicação bloqueada:</strong> aprove e ative primeiro a loja deste vendedor. A recusa do produto continua disponível após a revisão.</p>';
  return `
    <p class="review-alert"><strong>Regra de segurança:</strong> confira imagens, nome, descrição, preço e categoria. Se houver produto proibido, falsificação, conteúdo ilegal ou anúncio enganoso, recuse e indique a correção necessária.</p>
    ${alertaVendedor}
    <section class="review-summary"><img class="review-cover" src="${escapeHTML(imagemPrincipalProduto(produto))}" alt="Imagem principal de ${escapeHTML(produto.nome || 'produto')}"><div><h3>${valor(produto.nome || 'Produto sem nome')}</h3><span class="adm-product-status">${escapeHTML(estadoProdutoNome(status))}</span><div class="review-meta"><div><strong>Vendedor / loja</strong>${valor(vendedor?.nomeLoja || vendedor?.nome_loja || vendedor?.nome || produto.vendedorNome || produto.vendedor_nome)}<br><small>${valor(vendedor?.email)}</small></div><div><strong>Preço e estoque</strong>${escapeHTML(precoProduto(produto))} · ${Number(produto.estoque || 0)} unidade(s)</div><div><strong>Categoria / marca</strong>${valor(produto.categoria || produto.tag)} · ${valor(produto.marca)}</div><div><strong>SKU</strong>${valor(produto.sku)}</div></div>${revisadoEm ? `<p class="review-history">Última decisão: ${escapeHTML(dataLegivel(revisadoEm))}${revisadoPor ? ` por ${escapeHTML(revisadoPor)}` : ''}${notaAnterior ? ` · ${escapeHTML(notaAnterior)}` : ''}</p>` : ''}</div></section>
    <section class="review-section"><h3>Descrição enviada pelo vendedor</h3><div class="review-description">${valor(produto.descricao || 'Sem descrição enviada.')}</div></section>
    <section class="review-section"><h3>Imagens para conferência (${imagens.length})</h3><div class="review-gallery">${galeria}</div></section>
    <section class="review-section"><h3>Confirmação obrigatória da revisão</h3><div class="review-checklist"><label><input type="checkbox" data-check-revisao="imagens"> Vi todas as imagens e não encontrei conteúdo proibido, ilegal, sexual, violento ou inadequado.</label><label><input type="checkbox" data-check-revisao="produto"> O produto e a categoria estão claros e podem ser anunciados no marketplace.</label><label><input type="checkbox" data-check-revisao="descricao"> O nome, preço, estoque e descrição não parecem enganosos nem violam as regras da loja.</label><label><input type="checkbox" data-check-revisao="politica"> Confirmo que esta decisão cumpre a política de produtos e que assumo esta revisão.</label></div></section>
    <section class="review-section"><h3>Nota para o registo e para o vendedor</h3><textarea id="notaRevisaoProduto" class="review-note" maxlength="600" placeholder="Obrigatória ao recusar. Explique claramente o que deve ser corrigido."></textarea></section>
    <div class="review-actions"><button type="button" class="adm-btn reject" data-decisao-produto="recusar" disabled>❌ Recusar e pedir correção</button><button type="button" class="adm-btn approve" data-decisao-produto="aprovar" data-vendedor-ativo="${lojaAtiva}" disabled>✅ Aprovar publicação</button></div>`;
}

function atualizarBotoesDecisao() {
  const conteudo = $('conteudoRevisaoProduto');
  if (!conteudo) return;
  const checklist = [...conteudo.querySelectorAll('[data-check-revisao]')];
  const revisaoCompleta = checklist.length === CHECKLIST_REVISAO.length && checklist.every((item) => item.checked);
  conteudo.querySelectorAll('[data-decisao-produto]').forEach((botao) => {
    const bloqueadoPorLoja = botao.dataset.decisaoProduto === 'aprovar' && botao.dataset.vendedorAtivo !== 'true';
    botao.disabled = !revisaoCompleta || bloqueadoPorLoja;
    botao.title = bloqueadoPorLoja
      ? 'A loja do vendedor precisa estar aprovada e ativa antes da publicação.'
      : revisaoCompleta ? '' : 'Marque todas as confirmações depois de analisar o produto.';
  });
}

function abrirRevisaoProduto(produtoId) {
  const produto = produtos.find((item) => String(item.id) === String(produtoId));
  const dialogo = $('dialogRevisaoProduto');
  const conteudo = $('conteudoRevisaoProduto');
  if (!produto || !dialogo || !conteudo) {
    mostrarMensagem('Produto não encontrado. Atualize a fila e tente novamente.', false);
    return;
  }
  if (estadoProduto(produto) !== 'aguardando_aprovacao') {
    mostrarMensagem('Este produto já não está na fila de revisão. Atualize a página.', false);
    return;
  }
  produtoEmRevisao = produto;
  conteudo.innerHTML = htmlRevisaoProduto(produto, vendedorDoProduto(produto));
  conteudo.querySelectorAll('[data-check-revisao]').forEach((item) => item.addEventListener('change', atualizarBotoesDecisao));
  conteudo.querySelectorAll('img').forEach((imagem) => imagem.addEventListener('error', () => { imagem.src = IMAGEM_FALLBACK; }));
  atualizarBotoesDecisao();
  if (!dialogo.open) dialogo.showModal();
}

async function decidirProduto(acao) {
  const conteudo = $('conteudoRevisaoProduto');
  const produto = produtoEmRevisao;
  if (!conteudo || !produto || !['aprovar', 'recusar'].includes(acao)) return;

  const checklist = Object.fromEntries(
    [...conteudo.querySelectorAll('[data-check-revisao]')].map((item) => [item.dataset.checkRevisao, item.checked])
  );
  const revisaoCompleta = CHECKLIST_REVISAO.every((campo) => checklist[campo] === true);
  const nota = String($('notaRevisaoProduto')?.value || '').trim();
  if (!revisaoCompleta) {
    mostrarMensagem('Conclua as quatro confirmações da revisão antes de decidir.', false);
    return;
  }
  if (acao === 'recusar' && nota.length < 5) {
    mostrarMensagem('Explique ao vendedor o motivo da recusa (mínimo de 5 caracteres).', false);
    return;
  }
  if (acao === 'aprovar' && !vendedorAtivo(vendedorDoProduto(produto))) {
    mostrarMensagem('A loja do vendedor precisa estar aprovada e ativa antes da publicação.', false);
    return;
  }

  const texto = acao === 'aprovar'
    ? 'Confirmar que o produto foi revisto e pode ser publicado? Esta decisão ficará registada.'
    : 'Confirmar a recusa? O produto ficará fora do site até ser corrigido e enviado novamente.';
  if (!confirm(texto)) return;

  conteudo.querySelectorAll('button').forEach((botao) => { botao.disabled = true; });
  try {
    await httpsCallable(functions, 'aprovarProdutoVendedor')({
      produtoId: produto.id,
      acao,
      motivoRecusa: nota,
      revisaoConcluida: true,
      checklistRevisao: checklist
    });
    $('dialogRevisaoProduto')?.close();
    produtoEmRevisao = null;
    await carregar();
    mostrarMensagem(acao === 'aprovar' ? 'Produto aprovado e publicado com sucesso.' : 'Produto recusado; o vendedor recebeu a indicação para corrigir o anúncio.');
  } catch (erro) {
    atualizarBotoesDecisao();
    mostrarMensagem(`A decisão não foi gravada. O produto continua sem alteração. Detalhe: ${erro.message || erro}`, false);
  }
}

async function alterarVendedor(id, acao) {
  const verbo = { aprovar: 'aprovar', recusar: 'recusar', suspender: 'suspender', reativar: 'reativar' }[acao] || acao;
  if (!confirm(`Confirmar ${verbo} este vendedor?`)) return;
  const motivo = acao === 'recusar' ? String(prompt('Motivo da recusa (opcional):') || '').trim() : '';
  try {
    await httpsCallable(functions, 'gerirVendedor')({ uid: id, acao, motivoRecusa: motivo });
    await carregar();
    mostrarMensagem('Vendedor atualizado com sucesso.');
  } catch (erroEdge) {
    try {
      const status = acao === 'aprovar' || acao === 'reativar' ? 'aprovado' : acao === 'recusar' ? 'recusado' : 'suspenso';
      const ativo = status === 'aprovado';
      const { error } = await supabase.from('vendedores').update({ status, ativo, motivo_recusa: motivo || null, atualizado_em: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      const { error: produtosErro } = await supabase.from('produtos').update({ vendedor_ativo: ativo, atualizado_em: new Date().toISOString() }).eq('vendedor_id', id);
      if (produtosErro) throw produtosErro;
      await carregar();
      mostrarMensagem('Vendedor atualizado pelo acesso administrativo de contingência.');
    } catch (erro) {
      throw new Error(`Edge Function: ${erroEdge.message || erroEdge}. Atualização administrativa: ${erro.message || erro}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await signOut(auth); } catch (_) {}

  $('btnLoginVendedores').addEventListener('click', async () => {
    $('erroLoginVendedores').textContent = '';
    try {
      const credencial = await signInWithEmailAndPassword(auth, $('emailVendedores').value.trim(), $('senhaVendedores').value);
      if (!await validarAdmin(credencial.user)) throw new Error('Esta conta não possui acesso administrativo.');
      $('loginVendedores').hidden = true;
      $('painelVendedores').hidden = false;
      await carregar();
    } catch (erro) {
      try { await signOut(auth); } catch (_) {}
      $('erroLoginVendedores').textContent = erro.message || 'Não foi possível entrar.';
    }
  });

  $('senhaVendedores').addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') $('btnLoginVendedores').click();
  });
  $('btnAtualizarVendedores').addEventListener('click', () => carregar().then(() => mostrarMensagem('Dados atualizados.')).catch((erro) => mostrarMensagem(erro.message || erro, false)));
  $('btnSairVendedores').addEventListener('click', async () => {
    await signOut(auth);
    location.reload();
  });
  $('filtroVendedores').addEventListener('input', renderizar);
  $('statusVendedores').addEventListener('change', renderizar);

  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    const detalhe = evento.target.closest('[data-detalhe]');
    const revisar = evento.target.closest('[data-revisar-produto]');
    const fechar = evento.target.closest('[data-fechar-revisao]');
    const decisao = evento.target.closest('[data-decisao-produto]');
    if (botao) alterarVendedor(botao.dataset.id, botao.dataset.acao).catch((erro) => mostrarMensagem(erro.message || erro, false));
    else if (detalhe) mostrarDetalheVendedor(detalhe.dataset.id, detalhe.dataset.detalhe);
    else if (revisar) abrirRevisaoProduto(revisar.dataset.revisarProduto);
    else if (fechar) $('dialogRevisaoProduto')?.close();
    else if (decisao) decidirProduto(decisao.dataset.decisaoProduto);
  });
});
