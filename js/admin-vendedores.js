import { auth, db, functions } from './config.js';
import { collection, getDocs } from './supabase-compat.js';
import { getIdTokenResult, signInWithEmailAndPassword, signOut, httpsCallable } from './supabase-compat.js';
import { escapeHTML } from './utils.js';

const $ = id => document.getElementById(id);
const call = name => httpsCallable(functions, name);
let vendedores = [];
let vendedorSelecionado = null;

function normalizarTexto(value) {
  return String(value ?? '').trim().toLowerCase();
}

function formatarKz(value) {
  const n = Number(value || 0);
  return `${new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n)} Kz`;
}

function statusLabel(status) {
  return ({
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
    suspenso: 'Suspenso'
  })[status] || status || 'Pendente';
}

function statusClass(status) {
  return `status-${String(status || 'pendente').replace(/[^a-z]/gi, '')}`;
}

function mostrarMensagem(texto, tipo = 'success') {
  const el = $('mensagemVendedores');
  if (!el) return;
  el.className = `msg ${tipo === 'error' ? 'msg-error' : ''}`;
  el.textContent = texto || '';
}

async function validarAdmin(user) {
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
}

function atualizarResumo(lista = vendedores) {
  const total = lista.length;
  const pendentes = lista.filter(v => v.status === 'pendente').length;
  const aprovados = lista.filter(v => v.status === 'aprovado' && v.ativo !== false).length;
  const suspensos = lista.filter(v => v.status === 'suspenso').length;
  const recusados = lista.filter(v => v.status === 'recusado').length;
  $('totalVendedores').textContent = total;
  $('totalPendentes').textContent = pendentes;
  $('totalAprovados').textContent = aprovados;
  $('totalSuspensos').textContent = suspensos;
  $('totalRecusados').textContent = recusados;
}

function render() {
  const box = $('listaVendedores');
  const termo = normalizarTexto($('filtroVendedores')?.value);
  const filtroStatus = $('filtroStatusVendedores')?.value || 'todos';
  const lista = vendedores.filter(v => {
    const texto = normalizarTexto(`${v.nome || ''} ${v.nomeLoja || ''} ${v.email || ''} ${v.telefone || ''} ${v.categoria || ''}`);
    return texto.includes(termo) && (filtroStatus === 'todos' || (v.status || 'pendente') === filtroStatus);
  });

  $('contadorVendedores').textContent = String(lista.length);
  atualizarResumo(vendedores);

  if (!lista.length) {
    box.innerHTML = '<div class="empty">Nenhum vendedor encontrado para os filtros atuais.</div>';
    return;
  }

  box.innerHTML = lista.map(v => {
    const id = escapeHTML(v.id);
    const nome = escapeHTML(v.nome || 'Sem nome');
    const loja = escapeHTML(v.nomeLoja || 'Sem loja');
    const email = escapeHTML(v.email || 'Sem e-mail');
    const telefone = escapeHTML(v.telefone || 'Sem telefone');
    const categoria = escapeHTML(v.categoria || 'Sem categoria');
    const status = v.status || 'pendente';
    const ativo = v.ativo !== false;

    let botoes = `<button class="btn secondary" data-action="detalhes" data-id="${id}">Ver detalhes</button>`;
    if (status === 'pendente' || status === 'recusado') {
      botoes += `<button class="btn success" data-action="aprovar" data-id="${id}">Aprovar</button>`;
    }
    if (status === 'aprovado' && ativo) {
      botoes += `<button class="btn danger" data-action="suspender" data-id="${id}">Suspender</button>`;
    }
    if (status === 'suspenso') {
      botoes += `<button class="btn success" data-action="reativar" data-id="${id}">Reativar</button>`;
    }
    if (status !== 'recusado' && status !== 'suspenso') {
      botoes += `<button class="btn warning" data-action="recusar" data-id="${id}">Recusar</button>`;
    }

    return `<article class="seller-card">
      <div class="seller-main">
        <div class="seller-title"><strong>${nome}</strong><span class="status ${statusClass(status)}">${escapeHTML(statusLabel(status))}</span></div>
        <div class="seller-store">🏪 ${loja}</div>
        <div class="muted">📧 ${email} · 📞 ${telefone}</div>
        <div class="meta">Categoria: ${categoria} · Plano: <b>${escapeHTML(v.plano || 'basico')}</b> · Saldo: <b>${formatarKz(v.saldoDisponivel)}</b> · Vendas: ${Number(v.totalVendas || 0)}</div>
      </div>
      <div class="actions">${botoes}</div>
    </article>`;
  }).join('');
}

async function carregar() {
  mostrarMensagem('A carregar vendedores...');
  try {
    const snap = await getDocs(collection(db, 'vendedores'));
    vendedores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    vendedores.sort((a, b) => {
      const ordem = { pendente: 0, aprovado: 1, suspenso: 2, recusado: 3 };
      return (ordem[a.status || 'pendente'] ?? 9) - (ordem[b.status || 'pendente'] ?? 9);
    });
    mostrarMensagem('');
    render();
  } catch (e) {
    console.error('[VORA 313] Erro ao carregar vendedores:', e);
    mostrarMensagem(`Não foi possível carregar os vendedores: ${e.message || e}`, 'error');
    $('listaVendedores').innerHTML = '<div class="empty">Verifique a sessão do administrador e as políticas RLS do Supabase.</div>';
  }
}

function abrirDetalhes(v) {
  vendedorSelecionado = v;
  $('detalhesVendedor').innerHTML = `
    <div class="detail-grid">
      <div><span>Responsável</span><strong>${escapeHTML(v.nome || '—')}</strong></div>
      <div><span>Loja</span><strong>${escapeHTML(v.nomeLoja || '—')}</strong></div>
      <div><span>E-mail</span><strong>${escapeHTML(v.email || '—')}</strong></div>
      <div><span>Telefone</span><strong>${escapeHTML(v.telefone || '—')}</strong></div>
      <div><span>Morada</span><strong>${escapeHTML(v.morada || '—')}</strong></div>
      <div><span>Categoria</span><strong>${escapeHTML(v.categoria || '—')}</strong></div>
      <div><span>Estado</span><strong>${escapeHTML(statusLabel(v.status))}</strong></div>
      <div><span>Plano</span><strong>${escapeHTML(v.plano || 'basico')}</strong></div>
      <div><span>Saldo disponível</span><strong>${formatarKz(v.saldoDisponivel)}</strong></div>
      <div><span>Saldo retido</span><strong>${formatarKz(v.saldoRetido)}</strong></div>
      <div><span>Total de vendas</span><strong>${Number(v.totalVendas || 0)}</strong></div>
      <div><span>Total de produtos</span><strong>${Number(v.totalProdutos || 0)}</strong></div>
    </div>
    <div class="detail-description"><span>Descrição</span><p>${escapeHTML(v.descricao || 'Sem descrição.')}</p></div>`;
  $('selectPlanoVendedor').value = v.plano || 'basico';
  $('modalVendedor').style.display = 'flex';
}

async function alterar(id, acao) {
  const v = vendedores.find(x => String(x.id) === String(id));
  if (!v) return;
  const nomes = { aprovar: 'aprovar', suspender: 'suspender', recusar: 'recusar', reativar: 'reativar' };
  const label = nomes[acao] || acao;
  if (!window.confirm(`Tem a certeza que deseja ${label} o vendedor "${v.nomeLoja || v.nome || id}"?`)) return;

  try {
    mostrarMensagem(`A executar: ${label}...`);
    const result = await call('gerirVendedor')({ uid: v.id, acao });
    mostrarMensagem(`Operação concluída. Estado: ${statusLabel(result.data?.status)}.`);
    await carregar();
    if (vendedorSelecionado?.id === v.id) vendedorSelecionado = vendedores.find(x => x.id === v.id) || null;
  } catch (e) {
    console.error('[VORA 313] Erro ao gerir vendedor:', e);
    mostrarMensagem(e.message || 'Não foi possível concluir a operação.', 'error');
  }
}

async function guardarPlano() {
  if (!vendedorSelecionado) return;
  try {
    const plano = $('selectPlanoVendedor').value;
    await call('definirPlanoVendedor')({ uid: vendedorSelecionado.id, plano });
    mostrarMensagem('Plano do vendedor atualizado.');
    $('modalVendedor').style.display = 'none';
    await carregar();
  } catch (e) {
    console.error(e);
    mostrarMensagem(e.message || 'Não foi possível atualizar o plano.', 'error');
  }
}

function fecharModal() {
  $('modalVendedor').style.display = 'none';
  vendedorSelecionado = null;
}

document.addEventListener('DOMContentLoaded', async () => {
  const login = $('loginVendedores');
  const painel = $('painelVendedores');
  try { await signOut(auth); } catch (_) {}

  $('btnLoginVendedores').addEventListener('click', async () => {
    const erro = $('erroLoginVendedores');
    erro.textContent = '';
    try {
      const email = $('emailVendedores').value.trim().toLowerCase();
      const senha = $('senhaVendedores').value;
      if (!email || !email.includes('@')) throw new Error('Digite um e-mail válido.');
      if (!senha) throw new Error('Digite a palavra-passe.');
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      if (!await validarAdmin(cred.user)) throw new Error('Esta conta não possui acesso administrativo.');
      login.style.display = 'none';
      painel.style.display = 'block';
      await carregar();
    } catch (e) {
      try { await signOut(auth); } catch (_) {}
      erro.textContent = e.message || 'Não foi possível iniciar sessão.';
    }
  });

  $('senhaVendedores').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnLoginVendedores').click(); });
  $('filtroVendedores').addEventListener('input', render);
  $('filtroStatusVendedores').addEventListener('change', render);
  $('btnAtualizarVendedores').addEventListener('click', carregar);
  $('btnFecharDetalhes').addEventListener('click', fecharModal);
  $('btnGuardarPlano').addEventListener('click', guardarPlano);
  $('modalVendedor').addEventListener('click', e => { if (e.target === $('modalVendedor')) fecharModal(); });
  $('btnSairVendedores').addEventListener('click', async () => { await signOut(auth); location.reload(); });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const v = vendedores.find(x => String(x.id) === String(b.dataset.id));
    if (b.dataset.action === 'detalhes') return v && abrirDetalhes(v);
    alterar(b.dataset.id, b.dataset.action);
  });
});
