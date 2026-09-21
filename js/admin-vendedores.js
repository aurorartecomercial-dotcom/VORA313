import { auth, db } from './config.js';
import { collection, getDocs, updateDoc, doc } from './supabase-compat.js';
import { getIdTokenResult, signInWithEmailAndPassword, signOut } from './supabase-compat.js';
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
  try {
    await updateDoc(doc(db, 'vendedores', id), {
      status: aprovado ? 'aprovado' : 'suspenso',
      ativo: aprovado
    });
    msg.textContent = aprovado ? 'Vendedor aprovado e ativado.' : 'Vendedor suspenso.';
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
