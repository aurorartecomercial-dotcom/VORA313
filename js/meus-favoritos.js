import { supabase } from './config.js';
import { imagemProdutoSegura, IMAGEM_FALLBACK, escapeHTML, mostrarToast, urlSegura } from './utils.js';
import { initFavoritos, alternarFavoritoProduto, alternarFavoritoVendedor } from './favoritos.js';

const $ = (id) => document.getElementById(id);
let dados = { produtos: [], lojas: [] };
let tipoAtual = 'todos';

function mostrarEstado(html) { const el = $('meusFavoritosLista'); if (el) el.innerHTML = html; }

function cardProduto(item) {
  const p = item.produto;
  if (!p) return `<article class="favorito-real-card favorito-indisponivel"><div class="favorito-real-card-conteudo"><h2>Produto indisponível</h2><p>Este produto já não está disponível publicamente.</p><div class="favorito-real-acoes"><button type="button" data-remover-produto="${escapeHTML(item.id)}">Remover</button></div></div></article>`;
  const img = imagemProdutoSegura(p.imagens?.[0], IMAGEM_FALLBACK);
  return `<article class="favorito-real-card">
    <img src="${escapeHTML(img)}" alt="${escapeHTML(p.nome || 'Produto')}" loading="lazy" decoding="async">
    <div class="favorito-real-card-conteudo"><h2>${escapeHTML(p.nome || 'Produto')}</h2><p>${escapeHTML(p.preco || '')} · ${escapeHTML(p.vendedor_nome || 'Loja VORA 313')}</p>
    <div class="favorito-real-acoes"><a href="detalhe.html?id=${encodeURIComponent(p.id)}">Ver produto</a><button type="button" data-remover-produto="${escapeHTML(p.id)}">Remover</button></div></div>
  </article>`;
}

function cardLoja(item) {
  const loja = item.loja;
  if (!loja) return `<article class="favorito-real-card favorito-indisponivel"><div class="favorito-real-card-conteudo"><h2>Loja indisponível</h2><p>Esta loja deixou de estar disponível publicamente.</p><div class="favorito-real-acoes"><button type="button" data-remover-loja="${escapeHTML(item.id)}">Remover</button></div></div></article>`;
  const perfil = loja.perfil_publico && typeof loja.perfil_publico === 'object' ? loja.perfil_publico : {};
  const logo = urlSegura(perfil.logoUrl, '');
  const img = logo || IMAGEM_FALLBACK;
  return `<article class="favorito-real-card">
    <img src="${escapeHTML(img)}" alt="Logótipo de ${escapeHTML(loja.nome_loja || 'Loja')}" loading="lazy" decoding="async">
    <div class="favorito-real-card-conteudo"><h2>🏪 ${escapeHTML(loja.nome_loja || 'Loja VORA 313')}</h2><p>${escapeHTML(loja.categoria || 'Loja parceira')} · ${Number(loja.total_produtos || 0)} produtos</p>
    <div class="favorito-real-acoes"><a href="loja.html?vendedor=${encodeURIComponent(loja.id)}">Visitar loja</a><button type="button" data-remover-loja="${escapeHTML(loja.id)}">Remover</button></div></div>
  </article>`;
}

function renderizar() {
  const items = [];
  if (tipoAtual !== 'lojas') dados.produtos.forEach((item) => items.push(cardProduto(item)));
  if (tipoAtual !== 'produtos') dados.lojas.forEach((item) => items.push(cardLoja(item)));
  mostrarEstado(items.length ? items.join('') : '<div class="favorito-empty"><strong>❤️ Ainda não tens favoritos.</strong><p>Guarda produtos ou lojas para encontrá-los aqui depois.</p><a href="index.html">Explorar marketplace</a></div>');
}

async function carregar() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    mostrarEstado('<div class="favorito-empty"><strong>🔐 Entra na tua conta</strong><p>Os favoritos são privados e ficam ligados à tua conta.</p><a href="perfil.html">Entrar / criar conta</a></div>');
    return;
  }
  mostrarEstado('<div class="favorito-loading">⏳ A carregar os teus favoritos...</div>');
  const uid = userData.user.id;
  const [fp, fl] = await Promise.all([
    supabase.from('favoritos_produtos').select('produto_id,criado_em').eq('uid_cliente', uid).order('criado_em', { ascending: false }),
    supabase.from('favoritos_vendedores').select('vendedor_id,criado_em').eq('uid_cliente', uid).order('criado_em', { ascending: false })
  ]);
  if (fp.error) throw fp.error;
  if (fl.error) throw fl.error;

  const produtoIds = (fp.data || []).map((x) => String(x.produto_id));
  const vendedorIds = (fl.data || []).map((x) => String(x.vendedor_id));
  const [produtos, lojas] = await Promise.all([
    produtoIds.length ? supabase.from('produtos').select('id,nome,preco,imagens,vendedor_nome,ativo,vendedor_ativo,status_aprovacao').in('id', produtoIds) : Promise.resolve({ data: [], error: null }),
    vendedorIds.length ? supabase.from('lojas_publicas').select('id,nome_loja,categoria,perfil_publico,total_produtos').in('id', vendedorIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (produtos.error) throw produtos.error;
  if (lojas.error) throw lojas.error;

  const produtoMap = new Map((produtos.data || []).map((p) => [String(p.id), p]));
  const lojaMap = new Map((lojas.data || []).map((l) => [String(l.id), l]));
  dados.produtos = produtoIds.map((id) => ({ id, produto: produtoMap.get(id) || null }));
  dados.lojas = vendedorIds.map((id) => ({ id, loja: lojaMap.get(id) || null }));
  renderizar();
}

document.addEventListener('DOMContentLoaded', async () => {
  await initFavoritos();
  document.querySelectorAll('.favoritos-tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.favoritos-tab').forEach((t) => t.classList.remove('ativo'));
    tab.classList.add('ativo');
    tipoAtual = tab.dataset.tipo || 'todos';
    renderizar();
  }));
  $('meusFavoritosLista')?.addEventListener('click', async (event) => {
    const produto = event.target.closest('[data-remover-produto]');
    const loja = event.target.closest('[data-remover-loja]');
    try {
      if (produto) {
        await alternarFavoritoProduto(produto.dataset.removerProduto);
        dados.produtos = dados.produtos.filter((item) => item.id !== String(produto.dataset.removerProduto));
      } else if (loja) {
        await alternarFavoritoVendedor(loja.dataset.removerLoja);
        dados.lojas = dados.lojas.filter((item) => item.id !== String(loja.dataset.removerLoja));
      } else return;
      renderizar();
    } catch (erro) {
      mostrarToast(erro?.message || 'Não foi possível remover o favorito.', 'erro');
    }
  });
  try { await carregar(); }
  catch (erro) { console.error(erro); mostrarEstado('<div class="favorito-empty"><strong>Não foi possível carregar os favoritos.</strong><p>Tenta novamente em instantes.</p></div>'); }
});
