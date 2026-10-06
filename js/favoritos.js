// VORA 313 — Favoritos reais no Supabase.
// Não usa localStorage para a lista de favoritos: o estado pertence à conta autenticada.
import { supabase } from './config.js';
import { mostrarToast } from './utils.js';

const estado = {
    produtoIds: new Set(),
    vendedorIds: new Set(),
    usuarioId: null,
    pronto: false,
    inicializado: false,
    carregamento: null
};

function setBotao(botao, ativo, tipo = 'produto') {
    if (!botao) return;
    botao.classList.toggle('ativo', ativo);
    botao.textContent = ativo ? '♥' : '♡';
    botao.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    botao.setAttribute('aria-label', ativo ? `Remover ${tipo} dos favoritos` : `Adicionar ${tipo} aos favoritos`);
}

function atualizarBotoes() {
    document.querySelectorAll('.btn-favorito[data-produto-id]').forEach((botao) => {
        setBotao(botao, estado.produtoIds.has(String(botao.dataset.produtoId)), 'produto');
    });
    document.querySelectorAll('.btn-favorito-loja[data-vendedor-id]').forEach((botao) => {
        const ativo = estado.vendedorIds.has(String(botao.dataset.vendedorId));
        botao.classList.toggle('ativo', ativo);
        botao.textContent = ativo ? '♥ Favorita' : '♡ Favoritar loja';
        botao.title = ativo ? 'Remover loja dos favoritos' : 'Adicionar loja aos favoritos';
        botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
}

function atualizarBadge() {
    const badge = document.getElementById('badgeFavoritos');
    const count = document.getElementById('badgeFavoritosCount');
    if (!badge || !count) return;
    const total = estado.produtoIds.size + estado.vendedorIds.size;
    count.textContent = String(total);
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
    badge.title = 'Meus favoritos';
    badge.setAttribute('aria-label', `Meus favoritos: ${total}`);
}

async function obterUsuarioAtual() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
}

async function carregarEstadoFavoritos() {
    const usuario = await obterUsuarioAtual();
    estado.usuarioId = usuario?.id || null;
    estado.produtoIds.clear();
    estado.vendedorIds.clear();

    if (!estado.usuarioId) {
        estado.pronto = true;
        atualizarBotoes();
        atualizarBadge();
        return;
    }

    const [produtos, vendedores] = await Promise.all([
        supabase.from('favoritos_produtos').select('produto_id').eq('uid_cliente', estado.usuarioId),
        supabase.from('favoritos_vendedores').select('vendedor_id').eq('uid_cliente', estado.usuarioId)
    ]);

    if (produtos.error) throw produtos.error;
    if (vendedores.error) throw vendedores.error;

    (produtos.data || []).forEach((row) => estado.produtoIds.add(String(row.produto_id)));
    (vendedores.data || []).forEach((row) => estado.vendedorIds.add(String(row.vendedor_id)));
    estado.pronto = true;
    atualizarBotoes();
    atualizarBadge();
}

export async function initFavoritos() {
    if (!estado.inicializado) {
        estado.inicializado = true;

        document.addEventListener('click', async (event) => {
            const produtoBotao = event.target.closest('.btn-favorito[data-produto-id]');
            const lojaBotao = event.target.closest('.btn-favorito-loja[data-vendedor-id]');
            if (!produtoBotao && !lojaBotao) return;
            event.preventDefault();
            event.stopPropagation();

            try {
                if (produtoBotao) await alternarFavoritoProduto(produtoBotao.dataset.produtoId, produtoBotao);
                else await alternarFavoritoVendedor(lojaBotao.dataset.vendedorId, lojaBotao);
            } catch (erro) {
                console.error('Erro nos favoritos:', erro);
                mostrarToast(erro?.message || 'Não foi possível atualizar os favoritos.', 'erro');
                atualizarBotoes();
            }
        });

        const badge = document.getElementById('badgeFavoritos');
        if (badge && !badge.dataset.favoritosLink) {
            badge.dataset.favoritosLink = '1';
            badge.addEventListener('click', () => { window.location.href = 'meus-favoritos.html'; });
        }

        supabase.auth.onAuthStateChange(() => {
            // Não reutilizar favoritos de outra sessão.
            estado.carregamento = null;
            estado.pronto = false;
            void carregarEstadoSeguro();
        });
    }
    await carregarEstadoSeguro();
}

async function carregarEstadoSeguro() {
    if (estado.carregamento) return estado.carregamento;
    estado.carregamento = carregarEstadoFavoritos().catch((erro) => {
        console.error('Não foi possível carregar os favoritos:', erro);
        estado.pronto = true;
        atualizarBotoes();
        atualizarBadge();
        mostrarToast('Não foi possível carregar os favoritos agora.', 'erro');
    }).finally(() => { estado.carregamento = null; });
    return estado.carregamento;
}

async function exigirLogin() {
    const usuario = await obterUsuarioAtual();
    if (!usuario) {
        mostrarToast('Entre na sua conta para guardar favoritos.', 'info');
        window.location.href = 'perfil.html';
        return null;
    }
    if (usuario.id !== estado.usuarioId) await carregarEstadoSeguro();
    return usuario;
}

export async function alternarFavoritoProduto(produtoId, btn = null) {
    const id = String(produtoId || '').trim();
    if (!id) return;
    const usuario = await exigirLogin();
    if (!usuario) return;

    const ativo = estado.produtoIds.has(id);
    if (btn) btn.disabled = true;
    try {
        if (ativo) {
            const { error } = await supabase.from('favoritos_produtos').delete().eq('uid_cliente', usuario.id).eq('produto_id', id);
            if (error) throw error;
            estado.produtoIds.delete(id);
            mostrarToast('Produto removido dos favoritos.', 'info');
        } else {
            const { error } = await supabase.from('favoritos_produtos').insert({ produto_id: id });
            if (error) throw error;
            estado.produtoIds.add(id);
            mostrarToast('Produto adicionado aos favoritos!', 'sucesso');
        }
        atualizarBotoes();
        atualizarBadge();
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function alternarFavoritoVendedor(vendedorId, btn = null) {
    const id = String(vendedorId || '').trim();
    if (!id) return;
    const usuario = await exigirLogin();
    if (!usuario) return;

    const ativo = estado.vendedorIds.has(id);
    if (btn) btn.disabled = true;
    try {
        if (ativo) {
            const { error } = await supabase.from('favoritos_vendedores').delete().eq('uid_cliente', usuario.id).eq('vendedor_id', id);
            if (error) throw error;
            estado.vendedorIds.delete(id);
            mostrarToast('Loja removida dos favoritos.', 'info');
        } else {
            const { error } = await supabase.from('favoritos_vendedores').insert({ vendedor_id: id });
            if (error) throw error;
            estado.vendedorIds.add(id);
            mostrarToast('Loja adicionada aos favoritos!', 'sucesso');
        }
        atualizarBotoes();
        atualizarBadge();
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function verificarFavorito(produtoId) {
    return estado.produtoIds.has(String(produtoId || ''));
}

export function verificarFavoritoVendedor(vendedorId) {
    return estado.vendedorIds.has(String(vendedorId || ''));
}

export function atualizarEstadoFavoritosNaPagina() {
    atualizarBotoes();
    atualizarBadge();
}
