// VORA 313 V26 — Central de Monetização + ordenação pública do catálogo
import { auth, db, functions } from './config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { escapeHTML } from './utils.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

export const MONETIZACAO = Object.freeze({
  modelo: 'comissao_por_venda',
  comissaoPadrao: 7,
  comissaoMaxima: 30,
  planos: Object.freeze([
    { id: 'basico', nome: 'Básico', mensalidade: 0 },
    { id: 'profissional', nome: 'Profissional', mensalidade: 15000 },
    { id: 'premium', nome: 'Premium', mensalidade: 30000 }
  ])
});

// Esta função é usada pelo catálogo público. Mantê-la aqui é seguro porque
// produtos sem configuração de monetização continuam ordenados normalmente.
export function ordenarProdutosMonetizados(produtos = []) {
  const ativo = produto => {
    if (produto?.monetizacao?.destaque !== true) return false;
    const fim = produto?.monetizacao?.destaqueFim;
    if (!fim) return true;
    const data = fim?.toDate ? fim.toDate() : new Date(fim);
    return Number.isNaN(data.getTime()) || data.getTime() > Date.now();
  };
  return [...produtos].sort((a, b) => {
    const destaqueA = ativo(a) ? 1 : 0;
    const destaqueB = ativo(b) ? 1 : 0;
    if (destaqueA !== destaqueB) return destaqueB - destaqueA;
    return Number(a?.ordem || 0) - Number(b?.ordem || 0);
  });
}

const money = value => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' Kz';
const el = id => document.getElementById(id);
let inicializado = false;

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? '').replace(/[^0-9,.-]/g, '').trim();
  if (!texto) return 0;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, '');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

function estadoVenda(venda) {
  return String(venda?.status || venda?.estado || '').toLowerCase();
}

function planoNormalizado(vendedor) {
  const plano = String(vendedor?.plano || 'basico').toLowerCase();
  return ['basico', 'profissional', 'premium'].includes(plano) ? plano : 'basico';
}

async function validarAdmin(user) {
  if (!user) return false;
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
}

function dataTexto(valor) {
  try {
    const data = valor?.toDate ? valor.toDate() : new Date(valor);
    if (Number.isNaN(data.getTime())) return '—';
    return data.toLocaleDateString('pt-AO');
  } catch (_) { return '—'; }
}

async function carregarDashboard() {
  if (inicializado) return;
  inicializado = true;

  const [comissoesSnap, vendasSnap, vendedoresSnap, produtosSnap] = await Promise.all([
    getDocs(collection(db, 'comissoes')),
    getDocs(collection(db, 'vendas')),
    getDocs(collection(db, 'vendedores')),
    getDocs(collection(db, 'produtos'))
  ]);

  const comissoes = [];
  comissoesSnap.forEach(s => comissoes.push({ _id: s.id, ...s.data() }));
  const vendas = [];
  vendasSnap.forEach(s => vendas.push({ _id: s.id, ...s.data() }));
  const vendedores = [];
  vendedoresSnap.forEach(s => vendedores.push({ _id: s.id, ...s.data() }));
  const produtos = [];
  produtosSnap.forEach(s => produtos.push({ _id: s.id, ...s.data() }));

  const pagas = vendas.filter(v => ['pago', 'em_preparacao', 'enviado', 'entregue'].includes(estadoVenda(v)));
  const pendentes = vendas.filter(v => estadoVenda(v) === 'aguardando_pagamento');
  const canceladas = vendas.filter(v => estadoVenda(v) === 'cancelado');
  const receitaComissao = comissoes.reduce((t, d) => t + numero(d.comissaoVora), 0);
  const receitaFrete = comissoes.reduce((t, d) => t + numero(d.receitaFreteVora), 0);
  const receitaVora = comissoes.reduce((t, d) => t + numero(d.receitaTotalVora || (numero(d.comissaoVora) + numero(d.receitaFreteVora))), 0);
  const gmvPago = pagas.reduce((t, v) => t + numero(v.valorTotal), 0);
  const valorVendedores = pagas.reduce((t, v) => t + numero(v.monetizacao?.valorVendedores), 0);
  const patrocinados = produtos.filter(p => p?.monetizacao?.destaque === true).length;
  const planosAtivos = vendedores.reduce((t, v) => t + (planoNormalizado(v) !== 'basico' && v.ativo !== false ? 1 : 0), 0);
  const receitaPlanosProjetada = vendedores.reduce((t, v) => t + (v.ativo === false ? 0 : (MONETIZACAO.planos.find(p => p.id === planoNormalizado(v))?.mensalidade || 0)), 0);

  el('kpiReceita').textContent = money(receitaVora);
  el('kpiVendas').textContent = String(pagas.length);
  el('kpiVendedores').textContent = String(vendedores.length);
  el('kpiDestaques').textContent = String(patrocinados);
  el('kpiGMV').textContent = money(gmvPago);
  el('kpiVendedoresLiquido').textContent = money(valorVendedores);
  el('kpiPendentes').textContent = String(pendentes.length);
  el('kpiCanceladas').textContent = String(canceladas.length);

  el('recComissoes').textContent = money(receitaComissao);
  el('recFretes').textContent = money(receitaFrete);
  el('recPlanos').textContent = money(receitaPlanosProjetada);
  el('recPatrocinados').textContent = '0 Kz';
  el('recTotal').textContent = money(receitaVora);
  el('recGMV').textContent = money(gmvPago);
  el('recVendedores').textContent = money(valorVendedores);
  el('recPlanosAtivos').textContent = String(planosAtivos);

  renderizarVendedores(vendedores);
  renderizarProdutos(produtos);
  renderizarVendas(pagas, comissoes);
  renderizarResumoPlanos(vendedores);
}

function renderizarVendedores(vendedores) {
  const box = el('monVendedores');
  if (!box) return;
  const lista = [...vendedores].sort((a, b) => String(a.nome || a.razaoSocial || a.nomeEmpresa || '').localeCompare(String(b.nome || b.razaoSocial || b.nomeEmpresa || ''), 'pt'));
  box.innerHTML = lista.length ? lista.map(v => {
    const plano = planoNormalizado(v);
    const nome = escapeHTML(v.nome || v.razaoSocial || v.nomeEmpresa || 'Vendedor sem nome');
    const id = escapeHTML(v._id);
    const ativo = v.ativo !== false;
    const mensalidade = MONETIZACAO.planos.find(p => p.id === plano)?.mensalidade || 0;
    return `<div class="mon-product"><div class="mon-product-info"><div class="mon-product-name">${nome}</div><div class="mon-product-meta">ID: ${id} · Plano: <strong>${escapeHTML(plano)}</strong> · Mensalidade: ${money(mensalidade)}</div></div><span class="mon-badge ${ativo ? '' : 'off'}">${ativo ? 'Ativo' : 'Inativo'}</span></div>`;
  }).join('') : '<div class="mon-empty">Nenhum vendedor registado.</div>';
}

function renderizarProdutos(produtos) {
  const area = el('monProdutos');
  if (!area) return;
  const lista = ordenarProdutosMonetizados(produtos).slice(0, 100);
  area.innerHTML = lista.length ? lista.map(p => {
    const destaque = p?.monetizacao?.destaque === true;
    const nome = escapeHTML(p.nome || 'Produto sem nome');
    const categoria = escapeHTML(p.categoria || 'Sem categoria');
    const id = escapeHTML(p._id);
    return `<div class="mon-product"><div class="mon-product-info"><div class="mon-product-name">${nome}</div><div class="mon-product-meta">${categoria} · ${money(p.preco)} · ID ${id}</div></div><button class="mon-btn small ${destaque ? 'dark' : ''}" data-destaque="${id}">${destaque ? '★ Patrocinado' : '☆ Destacar'}</button></div>`;
  }).join('') : '<div class="mon-empty">Nenhum produto encontrado.</div>';

  area.querySelectorAll('[data-destaque]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const id = btn.dataset.destaque;
      const atual = btn.textContent.includes('Patrocinado');
      await httpsCallable(functions, 'definirDestaqueManual')({ produtoId: id, ativo: !atual });
      inicializado = false;
      await carregarDashboard();
    } catch (e) {
      alert('Não foi possível atualizar o destaque: ' + (e.message || e));
      btn.disabled = false;
    }
  }));
}

function renderizarVendas(vendas, comissoes) {
  const area = el('monVendas');
  if (!area) return;
  const comissaoPorPedido = new Map(comissoes.map(c => [String(c.pedidoId || c._id), c]));
  const lista = [...vendas].sort((a, b) => numero(b.valorTotal) - numero(a.valorTotal)).slice(0, 50);
  area.innerHTML = lista.length ? lista.map(v => {
    const c = comissaoPorPedido.get(String(v._id));
    const codigo = escapeHTML(v.codigoRastreio || v.numeroFatura || v._id);
    const estado = escapeHTML(estadoVenda(v));
    const total = money(v.valorTotal);
    const receita = money(c?.receitaTotalVora || v.monetizacao?.receitaVora || 0);
    return `<div class="mon-product"><div class="mon-product-info"><div class="mon-product-name">${codigo}</div><div class="mon-product-meta">${dataTexto(v.criadoEm)} · ${estado} · Total ${total} · VORA ${receita}</div></div><span class="mon-badge">Pago</span></div>`;
  }).join('') : '<div class="mon-empty">Ainda não existem vendas pagas.</div>';
}

function renderizarResumoPlanos(vendedores) {
  const area = el('monPlanoResumo');
  if (!area) return;
  const counts = { basico: 0, profissional: 0, premium: 0 };
  vendedores.forEach(v => { if (v.ativo !== false) counts[planoNormalizado(v)] += 1; });
  area.innerHTML = MONETIZACAO.planos.map(p => `<div class="mon-mini-stat"><span>${escapeHTML(p.nome)}</span><strong>${counts[p.id] || 0}</strong><small>${money((counts[p.id] || 0) * p.mensalidade)}/mês projetados</small></div>`).join('');
}

function iniciarPagina() {
  const login = el('monLogin');
  const dashboard = el('monDashboard');
  const loginBtn = el('monLoginBtn');
  // Importante: este módulo também é importado pela página inicial para
  // ordenar os produtos. A página inicial não possui o formulário de admin.
  if (!login || !dashboard || !loginBtn) return;

  loginBtn.addEventListener('click', async () => {
    const error = el('monLoginError');
    error.style.display = 'none';
    try {
      const cred = await signInWithEmailAndPassword(auth, el('monEmail').value.trim(), el('monSenha').value);
      if (!await validarAdmin(cred.user)) {
        await signOut(auth);
        throw new Error('Esta conta não possui acesso administrativo.');
      }
      login.style.display = 'none';
      dashboard.style.display = 'block';
      await carregarDashboard();
    } catch (e) {
      error.textContent = e.message || 'Credenciais inválidas.';
      error.style.display = 'block';
      inicializado = false;
    }
  });

  el('monSenha')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
  el('monSair')?.addEventListener('click', async () => { await signOut(auth); location.reload(); });

  onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
      if (await validarAdmin(user)) {
        login.style.display = 'none';
        dashboard.style.display = 'block';
        await carregarDashboard();
      }
    } catch (e) {
      console.warn('Não foi possível abrir a central de monetização:', e);
      inicializado = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', iniciarPagina);
