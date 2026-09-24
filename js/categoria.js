import { carregarCatalogo, criarCardProduto } from './catalogo.js';
import { initMobileMenu } from './menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    initMobileMenu();

    const params = new URLSearchParams(window.location.search);
    const categoria = params.get('cat');

    if (!categoria) {
        document.getElementById('nenhumProduto').style.display = 'block';
        document.getElementById('nenhumProduto').textContent = 'Nenhuma categoria foi selecionada.';
        document.getElementById('carregandoCategoria').style.display = 'none';
        return;
    }

    const nomeCategoria = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    document.getElementById('breadcrumbCat').textContent = nomeCategoria;
    document.getElementById('tituloCategoria').textContent = `📦 ${nomeCategoria}`;
    document.getElementById('paginaTitulo').textContent = `${nomeCategoria} - VORA 313`;

    // A categoria usa a mesma fonte e os mesmos IDs da página inicial e do
    // detalhe. Antes, ela lia uma chave de cache antiga e criava um catálogo
    // diferente do catálogo da página inicial.
    const catalogo = await carregarCatalogo();

    document.getElementById('carregandoCategoria').style.display = 'none';

    if (!catalogo || catalogo.length === 0) {
        document.getElementById('nenhumProduto').style.display = 'block';
        document.getElementById('nenhumProduto').textContent = 'Erro ao carregar o catálogo.';
        return;
    }

    const produtosFiltrados = catalogo.filter(prod => prod.categoria === categoria);
    const grid = document.getElementById('gradeCategoria');
    grid.innerHTML = '';

    if (produtosFiltrados.length === 0) {
        document.getElementById('nenhumProduto').style.display = 'block';
        document.getElementById('nenhumProduto').textContent = 'Nenhum produto encontrado nesta categoria.';
        return;
    }

    // ✅ Cria todos os cards de uma vez (síncrono)
    const fragment = document.createDocumentFragment();
    for (const prod of produtosFiltrados) {
        const card = criarCardProduto(prod);
        if (card) fragment.appendChild(card);
    }
    grid.appendChild(fragment);
});
