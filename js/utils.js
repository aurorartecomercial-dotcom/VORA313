// ==============================
// js/utils.js
// ==============================

// Constante de imagem placeholder (fallback universal)
export const IMAGEM_FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2UwZTBlMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5TZW0gSW1hZ2VtPC90ZXh0Pjwvc3ZnPg==';

// Use somente para texto que inevitavelmente precisa entrar em um template HTML.
// Para elementos novos, prefira sempre `element.textContent`.
export function escapeHTML(valor) {
    return String(valor ?? '').replace(/[&<>'"]/g, (caractere) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[caractere]);
}

export function urlSegura(valor, fallback = '') {
    if (!valor || typeof valor !== 'string') return fallback;
    try {
        const url = new URL(valor, document.baseURI);
        if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
        if (url.protocol === 'data:' && valor.startsWith('data:image/')) return valor;
    } catch (_) {
        // URL inválida: retornar o fallback sem expor uma URL executável.
    }
    return fallback;
}

// Sanitizador pequeno para o conteúdo editorial local. Não use para conteúdo
// livre enviado por utilizadores sem uma política de sanitização no servidor.
export function htmlEditorialSeguro(valor) {
    const permitidas = new Set(['P', 'H2', 'H3', 'H4', 'STRONG', 'EM', 'B', 'I', 'BR', 'UL', 'OL', 'LI', 'A']);
    const template = document.createElement('template');
    template.innerHTML = String(valor ?? '');
    [...template.content.querySelectorAll('*')].forEach((node) => {
        if (!permitidas.has(node.tagName)) {
            node.replaceWith(document.createTextNode(node.textContent || ''));
            return;
        }
        const hrefOriginal = node.tagName === 'A' ? node.getAttribute('href') : null;
        [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
        if (node.tagName === 'A') {
            const href = urlSegura(hrefOriginal);
            if (href) {
                node.href = href;
                node.target = '_blank';
                node.rel = 'noopener noreferrer';
            } else node.replaceWith(document.createTextNode(node.textContent || ''));
        }
    });
    return template.innerHTML;
}

/**
 * Extrai valor numérico de um preço formatado.
 * Suporta formatos:
 * - Angolano/Brasileiro: "Kz 12.500,00" → 12500.00
 * - Americano: "$12,500.00" → 12500.00
 * - Simples: "1500" → 1500
 */
export function extrairValorNumerico(precoString) {
    if (precoString === null || precoString === undefined || precoString === '') return 0;
    if (typeof precoString === 'number') return Number.isFinite(precoString) ? precoString : 0;

    let valor = String(precoString).trim().replace(/[^0-9.,-]/g, '');
    if (!valor) return 0;

    const negativos = valor.startsWith('-');
    valor = valor.replace(/-/g, '');
    const ultimaVirgula = valor.lastIndexOf(',');
    const ultimoPonto = valor.lastIndexOf('.');

    if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
        // O último separador é o decimal: 1.234,56 ou 1,234.56.
        if (ultimaVirgula > ultimoPonto) valor = valor.replace(/\./g, '').replace(',', '.');
        else valor = valor.replace(/,/g, '');
    } else if (ultimaVirgula !== -1) {
        const casas = valor.length - ultimaVirgula - 1;
        // Em pt-AO, 12.500/12,500 é normalmente doze mil e quinhentos;
        // duas casas após o separador representam decimal.
        if (casas === 3 && valor.slice(0, ultimaVirgula).length >= 1) valor = valor.replace(/,/g, '');
        else valor = valor.replace(',', '.');
    } else if (ultimoPonto !== -1) {
        const casas = valor.length - ultimoPonto - 1;
        if (casas === 3 && valor.slice(0, ultimoPonto).length >= 1) valor = valor.replace(/\./g, '');
        // Com 1, 2 ou 4+ casas, tratamos o ponto como decimal.
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero)) return 0;
    return negativos ? -numero : numero;
}

export function formatarMoeda(valor) {
    return valor.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
}

export function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function gerarNumeroFatura() {
    const contador = parseInt(localStorage.getItem('aurora_fatura_contador') || '0') + 1;
    localStorage.setItem('aurora_fatura_contador', String(contador));
    const data = new Date();
    const ano = data.getFullYear().toString().slice(-2);
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `FR-${ano}${mes}${dia}-${String(contador).padStart(4, '0')}`;
}

export function mostrarToast(mensagem, tipo = 'info') {
    const toast = document.getElementById('toast-notificacao');
    const msgEl = document.getElementById('toastMensagem');
    if (!toast) return;
    msgEl.textContent = mensagem;
    toast.style.top = '20px';
    if (tipo === 'sucesso') toast.style.borderColor = '#28a745';
    else toast.style.borderColor = 'var(--cor-ouro)';
    setTimeout(() => { toast.style.top = '-100px'; }, 3000);
}

export function validarCliente(nome, telefone, nif) {
    const erros = {};
    if (!nome.trim()) erros.nome = 'Nome é obrigatório.';
    if (!telefone.trim()) erros.telefone = 'Telefone é obrigatório.';
    else if (!/^[0-9]{9,15}$/.test(telefone)) erros.telefone = 'Telefone deve conter apenas números (9 a 15 dígitos).';
    if (!nif.trim()) erros.nif = 'NIF é obrigatório.';
    else if (!/^[0-9]{10}$/.test(nif)) erros.nif = 'NIF deve conter 10 dígitos.';
    return erros;
}

export function atualizarMetaTags(titulo, descricao, imagem = '') {
    document.title = titulo;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = descricao;
    const ogTitulo = document.querySelector('meta[property="og:title"]');
    if (ogTitulo) ogTitulo.content = titulo;
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = descricao;
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg && imagem) ogImg.content = imagem;
}
