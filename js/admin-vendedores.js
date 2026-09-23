import { auth, db, functions } from './config.js';
import { collection, getDocs } from './supabase-compat.js';
import { getIdTokenResult, signInWithEmailAndPassword, signOut, httpsCallable } from './supabase-compat.js';
import { escapeHTML } from './utils.js';

const $ = id => document.getElementById(id);
let vendedores = [];
let vendasVendedor = [];

async function validarAdmin(user) {
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
}

const money = value => `${Number(value || 0).toLocaleString('pt-AO', { maximumFractionDigits: 2 })} Kz`;

function render() {
  const box = $('listaVendedores');
  const termo = ($('filtroVendedores')?.value || '').trim().toLowerCase();
  const stats = {};
  vendasVendedor.forEach(v => {
    const id = v.uidVendedor || v.uid_vendedor;
    if (!id) return;
    if (!stats[id]) stats[id] = { pedidos: 0, faturamento: 0, liquido: 0 };
    stats[id].pedidos += 1;
    stats[id].faturamento += Number(v.valorVenda ?? v.valor_venda ?? 0);
    stats[id].liquido += Number(v.valorVendedor ?? v.valor_vendedor ?? 0);
  });
  const lista = vendedores.filter(v => `${v.nome || ''} ${v.nomeLoja || v.nome_loja || ''} ${v.email || ''} ${v.status || ''}`.toLowerCase().includes(termo));
  $('contadorVendedores').textContent = String(lista.length);
  const total = vendedores.length;
  const aprovados = vendedores.filter(v => v.status === 'aprovado' && v.ativo !== false).length;
  const pendentes = vendedores.filter(v => v.status === 'pendente').length;
  const faturamento = Object.values(stats).reduce((s, x) => s + x.faturamento, 0);
  $('resumoVendedores').innerHTML = `
    <div class="kpi"><strong>${total}</strong><span>Total</span></div>
    <div class="kpi"><strong>${aprovados}</strong><span>Aprovados</span></div>
    <div class="kpi"><strong>${pendentes}</strong><span>Pendentes</span></div>
    <div class="kpi"><strong>${money(faturamento)}</strong><span>Faturamento vendedor</span></div>`;
  box.innerHTML = lista.length ? lista.map(v => {
    const id = escapeHTML(v.id);
    const nome = escapeHTML(v.nome || 'Sem nome');
    const loja = escapeHTML(v.nomeLoja || v.nome_loja || 'Sem loja');
    const email = escapeHTML(v.email || '');
    const status = escapeHTML(v.status || 'pendente');
    const ativo = v.ativo !== false;
    const st = stats[v.id] || { pedidos: 0, faturamento: 0, liquido: 0 };
    const botoes = v.status === 'aprovado' && ativo
      ? `<button class="btn danger" data-action="suspender" data-id="${id}">Suspender</button>`
      : `<button class="btn success" data-action="aprovar" data-id="${id}">Aprovar/Ativar</button>`;
    return `<article class="seller-card"><div><strong>${nome}</strong><div class="muted">${loja} · ${email}</div><div class="meta">Status: <b>${status}</b> · ${ativo ? 'Ativo' : 'Inativo'} · Plano: ${escapeHTML(v.plano || 'basico')}</div><div class="meta">Pedidos: <b>${st.pedidos}</b> · Faturamento: <b>${money(st.faturamento)}</b> · Líquido: <b>${money(st.liquido)}</b></div></div><div class="actions">${botoes}</div></article>`;
  }).join('') : '<div class="empty">Nenhum vendedor encontrado.</div>';
}

async function carregar() {
  // A leitura administrativa passa pelo Edge Function (service_role).
  // Isto evita que uma policy RLS incompleta transforme um painel de admin
  // válido num falso "0 vendedores".
  const result = await httpsCallable(functions, 'listarVendedoresAdmin')({});
  const payload = result?.data || {};
  vendedores = Array.isArray(payload.vendedores) ? payload.vendedores : [];
  vendasVendedor = Array.isArray(payload.vendas) ? payload.vendas : [];
  render();
}

async function alterar(id, acao) {
  const msg = $('mensagemVendedores');
  if (!id || !acao) return;
  if (!confirm(`Confirmar ${acao === 'aprovar' ? 'aprovação' : 'suspensão'} deste vendedor?`)) return;
  try {
    await httpsCallable(functions, 'gerirVendedor')({ uid: id, acao });
    msg.textContent = acao === 'aprovar' ? 'Vendedor aprovado e ativado.' : 'Vendedor suspenso.';
    await carregar();
  } catch (e) {
    console.error(e);
    msg.textContent = `Não foi possível atualizar: ${e.message || e}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const login = $('loginVendedores');
  const painel = $('painelVendedores');
  try { await signOut(auth); } catch (_) {}

  $('btnLoginVendedores').addEventListener('click', async () => {
    const erro = $('erroLoginVendedores');
    erro.textContent = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, $('emailVendedores').value.trim(), $('senhaVendedores').value);
      if (!await validarAdmin(cred.user)) throw new Error('Esta conta não possui acesso administrativo.');
      login.style.display = 'none'; painel.style.display = 'block';
      $('mensagemVendedores').textContent = 'A carregar vendedores...';
      try {
        await carregar();
        $('mensagemVendedores').textContent = '';
      } catch (loadError) {
        console.error('Erro ao carregar vendedores:', loadError);
        vendedores = [];
        vendasVendedor = [];
        $('contadorVendedores').textContent = '0';
        $('listaVendedores').innerHTML = '<div class="empty erro">Não foi possível carregar os vendedores. Verifique se a função API publicada contém listarVendedoresAdmin.</div>';
        $('mensagemVendedores').textContent = loadError?.message || 'Erro ao carregar vendedores.';
      }
    } catch (e) {
      try { await signOut(auth); } catch (_) {}
      erro.textContent = e.message || 'Credenciais inválidas.';
    }
  });
  $('senhaVendedores').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnLoginVendedores').click(); });
  $('filtroVendedores').addEventListener('input', render);
  $('btnSairVendedores').addEventListener('click', async () => { await signOut(auth); location.reload(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (b) alterar(b.dataset.id, b.dataset.action === 'aprovar' ? 'aprovar' : 'suspender');
  });
});
