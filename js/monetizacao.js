// VORA 313 V18 — Central de Monetização do administrador
import { auth, db } from './config.js';
import { collection, getDocs, query, orderBy, updateDoc, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { escapeHTML } from './utils.js';

const money = value => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' Kz';
const el = id => document.getElementById(id);
let inicializado = false;

async function validarAdmin(user) {
  if (!user) return false;
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
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

  let comissoes = 0, fretes = 0, vendasPagas = 0;
  comissoesSnap.forEach(s => { const d = s.data(); comissoes += Number(d.comissaoVora || 0); fretes += Number(d.receitaFreteVora || 0); });
  vendasSnap.forEach(s => { if (['pago','em_preparacao','enviado','entregue'].includes(s.data().estado)) vendasPagas++; });
  const produtos = [];
  produtosSnap.forEach(s => produtos.push({ _id: s.id, ...s.data() }));
  const patrocinados = produtos.filter(p => p?.monetizacao?.destaque === true).length;

  el('kpiReceita').textContent = money(comissoes + fretes);
  el('kpiVendas').textContent = String(vendasPagas);
  el('kpiVendedores').textContent = String(vendedoresSnap.size);
  el('kpiDestaques').textContent = String(patrocinados);
  const vendedores = [];
  vendedoresSnap.forEach(s => vendedores.push({ _id: s.id, ...s.data() }));
  vendedores.sort((a,b) => String(a.nome || a.razaoSocial || '').localeCompare(String(b.nome || b.razaoSocial || ''), 'pt'));
  const boxVend = el('monVendedores');
  if (boxVend) boxVend.innerHTML = vendedores.length ? vendedores.map(v => {
    const plano = String(v.plano || 'basico').toLowerCase();
    const nome = escapeHTML(v.nome || v.razaoSocial || v.nomeEmpresa || 'Vendedor sem nome');
    const id = escapeHTML(v._id);
    const ativo = v.ativo !== false;
    return `<div class="mon-product"><div class="mon-product-info"><div class="mon-product-name">${nome}</div><div class="mon-product-meta">ID: ${id} · Plano: <strong>${escapeHTML(plano)}</strong> · ${ativo ? 'Ativo' : 'Inativo'}</div></div><span class="mon-badge">${ativo ? 'Ativo' : 'Inativo'}</span></div>`;
  }).join('') : '<div class="mon-empty">Nenhum vendedor registado.</div>';

  el('recComissoes').textContent = money(comissoes);
  el('recFretes').textContent = money(fretes);
  el('recPlanos').textContent = '0 Kz';
  el('recPatrocinados').textContent = '0 Kz';
  renderizarProdutos(produtos);
}

function renderizarProdutos(produtos) {
  const area = el('monProdutos');
  if (!produtos.length) { area.innerHTML = '<div class="mon-empty">Nenhum produto encontrado.</div>'; return; }
  produtos.sort((a,b) => Number(b?.monetizacao?.destaque === true) - Number(a?.monetizacao?.destaque === true));
  area.innerHTML = produtos.slice(0, 100).map(p => {
    const destaque = p?.monetizacao?.destaque === true;
    const nome = escapeHTML(p.nome || 'Produto sem nome');
    const categoria = escapeHTML(p.categoria || 'Sem categoria');
    return `<div class="mon-product"><div class="mon-product-info"><div class="mon-product-name">${nome}</div><div class="mon-product-meta">${categoria} · ${money(p.preco)}</div></div><button class="mon-btn small ${destaque ? 'dark' : ''}" data-destaque="${p._id}">${destaque ? '★ Patrocinado' : '☆ Destacar'}</button></div>`;
  }).join('');
  area.querySelectorAll('[data-destaque]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const id = btn.dataset.destaque;
      const atual = btn.textContent.includes('Patrocinado');
      await updateDoc(doc(db, 'produtos', id), { 'monetizacao.destaque': !atual, 'monetizacao.atualizadoEm': new Date() });
      inicializado = false;
      await carregarDashboard();
    } catch (e) { alert('Não foi possível atualizar o destaque: ' + (e.message || e)); btn.disabled = false; }
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  el('monLoginBtn').addEventListener('click', async () => {
    const error = el('monLoginError'); error.style.display = 'none';
    try {
      const cred = await signInWithEmailAndPassword(auth, el('monEmail').value.trim(), el('monSenha').value);
      if (!await validarAdmin(cred.user)) { await signOut(auth); throw new Error('Esta conta não possui acesso administrativo.'); }
      el('monLogin').style.display = 'none'; el('monDashboard').style.display = 'block'; await carregarDashboard();
    } catch (e) { error.textContent = e.message || 'Credenciais inválidas.'; error.style.display = 'block'; }
  });
  el('monSenha').addEventListener('keydown', e => { if (e.key === 'Enter') el('monLoginBtn').click(); });
  el('monSair').addEventListener('click', async () => { await signOut(auth); location.reload(); });
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    try { if (await validarAdmin(user)) { el('monLogin').style.display = 'none'; el('monDashboard').style.display = 'block'; await carregarDashboard(); } } catch (_) {}
  });
});

export const MONETIZACAO = Object.freeze({
  modelo: 'comissao_por_venda', comissaoPadrao: 7, comissaoMaxima: 30,
  planos: Object.freeze([
    { id: 'basico', nome: 'Básico', mensalidade: 0 },
    { id: 'profissional', nome: 'Profissional', mensalidade: 15000 },
    { id: 'premium', nome: 'Premium', mensalidade: 30000 }
  ])
});
