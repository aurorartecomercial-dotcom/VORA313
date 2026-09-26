import { auth, db, functions, supabase } from './config.js';
import { collection, getDocs } from './supabase-compat.js';
import { getIdTokenResult, signInWithEmailAndPassword, signOut, httpsCallable } from './supabase-compat.js';
import { escapeHTML } from './utils.js';

const $ = id => document.getElementById(id);
let vendedores = [];

async function validarAdmin(user) {
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true;
}

function render() {
  const box = $('listaVendedores');
  const termo = ($('filtroVendedores')?.value || '').trim().toLowerCase();
  const lista = vendedores.filter(v => `${v.nome || ''} ${v.nomeLoja || ''} ${v.email || ''} ${v.status || ''}`.toLowerCase().includes(termo));
  $('contadorVendedores').textContent = String(lista.length);
  box.innerHTML = lista.length ? lista.map(v => {
    const id = escapeHTML(v.id);
    const nome = escapeHTML(v.nome || 'Sem nome');
    const loja = escapeHTML(v.nomeLoja || 'Sem loja');
    const email = escapeHTML(v.email || '');
    const status = escapeHTML(v.status || 'pendente');
    const ativo = v.ativo !== false;
    const botoes = v.status === 'aprovado' && ativo
      ? `<button class="btn danger" data-action="suspender" data-id="${id}">Suspender</button>`
      : `<button class="btn success" data-action="aprovar" data-id="${id}">Aprovar/Ativar</button>`;
    return `<article class="seller-card"><div><strong>${nome}</strong><div class="muted">${loja} · ${email}</div><div class="meta">Status: <b>${status}</b> · ${ativo ? 'Ativo' : 'Inativo'} · Plano: ${escapeHTML(v.plano || 'basico')}</div></div><div class="actions">${botoes}</div></article>`;
  }).join('') : '<div class="empty">Nenhum vendedor encontrado.</div>';
}

async function carregar() {
  const snap = await getDocs(collection(db, 'vendedores'));
  vendedores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}

async function alterar(id, aprovado) {
  const msg = $('mensagemVendedores');
  const acao = aprovado ? 'aprovar' : 'suspender';
  try {
    await httpsCallable(functions, 'gerirVendedor')({
      uid: id,
      acao
    });
    msg.textContent = aprovado ? 'Vendedor aprovado e ativado.' : 'Vendedor suspenso.';
    await carregar();
  } catch (e) {
    try {
      // A policy RLS aceita esta ação somente de uma conta que tenha role admin.
      const ativo = aprovado;
      const atualizadoEm = new Date().toISOString();
      // Atualize somente as colunas existentes. updateDoc reaproveita campos
      // legados do registo e pode enviá-los ao PostgREST por engano.
      const { error: vendedorError } = await supabase.from('vendedores').update({
        status: aprovado ? 'aprovado' : 'suspenso',
        ativo,
        atualizado_em: atualizadoEm
      }).eq('id', id);
      if (vendedorError) throw vendedorError;

      const { error: produtosError } = await supabase.from('produtos').update({
        vendedor_ativo: ativo,
        atualizado_em: atualizadoEm
      }).eq('vendedor_id', id);
      if (produtosError) throw produtosError;
      msg.textContent = aprovado
        ? 'Vendedor aprovado e ativado. A Edge Function falhou, mas a aprovação administrativa foi concluída.'
        : 'Vendedor suspenso. A Edge Function falhou, mas a atualização administrativa foi concluída.';
      await carregar();
    } catch (fallbackError) {
      console.error(e, fallbackError);
      msg.textContent = `Não foi possível atualizar: ${fallbackError.message || fallbackError}`;
    }
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
      await carregar();
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
    if (!b) return;
    alterar(b.dataset.id, b.dataset.action === 'aprovar');
  });
});
