import { auth, db, storage, CONFIG } from './config.js';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc } from './supabase-compat.js';
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword } from './supabase-compat.js';
import { getDownloadURL, ref, uploadBytes } from './supabase-compat.js';
import { escapeHTML, extrairValorNumerico, valorMonetarioKz, mostrarToast, IMAGEM_FALLBACK, urlSegura } from './utils.js';

let produtos = [];
let editandoId = null;
let adminInicializado = false;
let filtroProdutosAdmin = '';
let filtroEstoqueAdmin = 'todos';

function invalidarCatalogoPublico() {
    localStorage.setItem(`${CONFIG.CACHE_KEY}:revision`, String(Date.now()));
}

// ✅ FALLBACK PARA NAVEGADORES ANTIGOS
function gerarId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginDiv = document.getElementById('loginAdmin');
    const conteudoAdmin = document.getElementById('conteudoAdmin');
    const btnLogin = document.getElementById('btnLoginAdmin');
    const emailInput = document.getElementById('emailAdmin');
    const senhaInput = document.getElementById('senhaAdmin');
    const erroLogin = document.getElementById('erroLogin');
    const btnRecuperar = document.getElementById('btnRecuperarSenhaAdmin');
    const recuperacaoDiv = document.getElementById('recuperacaoAdmin');
    const mensagemRecuperacao = document.getElementById('mensagemRecuperacaoAdmin');
    const erroRecuperacao = document.getElementById('erroRecuperacaoAdmin');
    const btnSalvarNovaSenha = document.getElementById('btnSalvarNovaSenhaAdmin');
    const btnVoltarLogin = document.getElementById('btnVoltarLoginAdmin');
    const novaSenha = document.getElementById('novaSenhaAdmin');
    const confirmarSenha = document.getElementById('confirmarSenhaAdmin');

    const modoRecuperacao = /(?:^|[&#])type=recovery(?:&|#|$)/.test(location.hash) || /(?:^|[?&#])type=recovery(?:&|#|$)/.test(location.href);

    // Compatibilidade: evita que uma versão antiga do admin.html interrompa o login.
    if (!loginDiv || !conteudoAdmin || !btnLogin || !emailInput || !senhaInput || !erroLogin) {
        console.error('[ADMIN] Estrutura de login incompleta. Atualize admin.html e admin.js para a mesma versão.');
        return;
    }

    function mostrarLogin() {
        if (loginDiv) loginDiv.style.display = 'block';
        if (recuperacaoDiv) recuperacaoDiv.style.display = 'none';
        if (conteudoAdmin) conteudoAdmin.style.display = 'none';
        if (erroLogin) erroLogin.style.display = 'none';
    }

    function mostrarRecuperacao() {
        if (loginDiv) loginDiv.style.display = 'none';
        if (conteudoAdmin) conteudoAdmin.style.display = 'none';
        if (recuperacaoDiv) recuperacaoDiv.style.display = 'block';
        if (erroRecuperacao) erroRecuperacao.style.display = 'none';
    }

    if (modoRecuperacao) {
        // Não fazer signOut aqui: o link de recuperação entrega uma sessão
        // temporária ao navegador para permitir a troca da palavra-passe.
        mostrarRecuperacao();
        const verificarSessao = () => {
            if (!auth.currentUser) {
                mensagemRecuperacao.textContent = 'O link de recuperação expirou ou não é válido. Solicite um novo email de recuperação.';
            } else {
                mensagemRecuperacao.textContent = 'Defina uma nova palavra-passe para o acesso administrativo.';
            }
        };
        onAuthStateChanged(auth, verificarSessao);
    } else {
        // O Admin exige autenticação explícita sempre que a página é aberta.
        try { await signOut(auth); } catch (e) {
            console.warn('[ADMIN] Não foi possível limpar a sessão anterior:', e);
        }
        mostrarLogin();
    }

    btnLogin.addEventListener('click', async () => {
        erroLogin.style.display = 'none';
        erroLogin.style.color = '#ff5555';
        btnLogin.disabled = true;
        btnLogin.textContent = '⏳ A entrar...';
        try {
            const email = emailInput.value.trim();
            const senha = senhaInput.value;
            if (!email || !senha) throw new Error('Informe o email e a senha.');
            const credencial = await signInWithEmailAndPassword(auth, email, senha);
            await abrirComoAdmin(credencial.user, loginDiv, conteudoAdmin, erroLogin);
        } catch (error) {
            console.error('[ADMIN] Falha no login:', error);
            erroLogin.style.display = 'block';
            erroLogin.style.color = '#ff5555';
            erroLogin.textContent = error.message || 'Credenciais inválidas';
        } finally {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    });

    senhaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnLogin.click();
    });

    btnRecuperar?.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            erroLogin.style.display = 'block';
            erroLogin.textContent = 'Digite o email do administrador primeiro.';
            return;
        }
        btnRecuperar.disabled = true;
        try {
            const redirectTo = `${location.origin}${location.pathname}`;
            await sendPasswordResetEmail(auth, email, redirectTo);
            erroLogin.style.display = 'block';
            erroLogin.style.color = '#79d279';
            erroLogin.textContent = 'Enviámos um link para redefinir a palavra-passe. Verifique o email.';
        } catch (error) {
            erroLogin.style.display = 'block';
            erroLogin.style.color = '#ff5555';
            erroLogin.textContent = error.message || 'Não foi possível enviar o email de recuperação.';
        } finally {
            btnRecuperar.disabled = false;
        }
    });

    btnSalvarNovaSenha?.addEventListener('click', async () => {
        erroRecuperacao.style.display = 'none';
        const nova = novaSenha.value;
        const confirmacao = confirmarSenha.value;
        if (nova.length < 6) {
            erroRecuperacao.textContent = 'A palavra-passe deve ter pelo menos 6 caracteres.';
            erroRecuperacao.style.display = 'block';
            return;
        }
        if (nova !== confirmacao) {
            erroRecuperacao.textContent = 'As palavras-passe não coincidem.';
            erroRecuperacao.style.display = 'block';
            return;
        }
        btnSalvarNovaSenha.disabled = true;
        try {
            await updatePassword(auth, nova);
            await signOut(auth);
            location.hash = '';
            mostrarLogin();
            erroLogin.style.color = '#79d279';
            erroLogin.textContent = 'Palavra-passe alterada. Entre novamente com a nova palavra-passe.';
            erroLogin.style.display = 'block';
        } catch (error) {
            erroRecuperacao.textContent = error.message || 'Não foi possível alterar a palavra-passe.';
            erroRecuperacao.style.display = 'block';
        } finally {
            btnSalvarNovaSenha.disabled = false;
        }
    });

    btnVoltarLogin?.addEventListener('click', async () => {
        try { await signOut(auth); } catch (_) {}
        location.hash = '';
        mostrarLogin();
    });
});

async function abrirComoAdmin(user, loginDiv, conteudoAdmin, erroLogin) {
    const token = await getIdTokenResult(user, true);
    if (token.claims.admin !== true) {
        await signOut(auth);
        erroLogin.style.display = 'block';
        erroLogin.textContent = 'Esta conta não possui acesso administrativo.';
        return;
    }
    loginDiv.style.display = 'none';
    conteudoAdmin.style.display = 'block';
    if (!adminInicializado) {
        adminInicializado = true;
        iniciarAdmin();
    }
}

function iniciarAdmin() {
    const form = document.getElementById('formProduto');
    const formTitulo = document.getElementById('formTitulo');
    const btnSalvar = document.getElementById('btnSalvar');
    const btnCancelar = document.getElementById('btnCancelarEdicao');
    const listaDiv = document.getElementById('listaProdutos');
    const contadorSpan = document.getElementById('contadorProdutos');
    const statusMsg = document.getElementById('statusMsg');
    const filtroProdutosInput = document.getElementById('filtroProdutosAdmin');
    const filtroEstoqueInput = document.getElementById('filtroEstoqueAdmin');
    const kpiProdutos = document.getElementById('kpiProdutosAdmin');
    const kpiEstoqueOk = document.getElementById('kpiEstoqueOkAdmin');
    const kpiEstoqueBaixo = document.getElementById('kpiEstoqueBaixoAdmin');
    const kpiEsgotados = document.getElementById('kpiEsgotadosAdmin');

    const prodId = document.getElementById('prodId');
    const nome = document.getElementById('nome');
    const categoria = document.getElementById('categoria');
    const tag = document.getElementById('tag');
    const preco = document.getElementById('preco');
    const precoAntigo = document.getElementById('precoAntigo');
    const custo = document.getElementById('custo');
    const desconto = document.getElementById('desconto');
    const parcelas = document.getElementById('parcelas');
    const freteGratis = document.getElementById('freteGratis');
    const descricao = document.getElementById('descricao');
    const imagens = document.getElementById('imagens');
    const previewImagens = document.getElementById('previewImagens');
    const ordem = document.getElementById('ordem');
    const estoque = document.getElementById('estoque');
    const video = document.getElementById('video');
    const marca = document.getElementById('marca');
    const sku = document.getElementById('sku');
    const destaques = document.getElementById('destaques');
    const especificacoes = document.getElementById('especificacoes');
    const selo = document.getElementById('selo');
    const produtoAtivo = document.getElementById('produtoAtivo');

    const btnUploadImg = document.getElementById('btnUploadImg');
    const imgUploadInput = document.getElementById('imgUpload');
    const uploadProgress = document.getElementById('uploadProgress');

    // Upload autenticado: a regra do Storage aceita apenas administradores.
    async function uploadParaStorage(file) {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!tiposPermitidos.includes(file.type)) {
            throw new Error(`Formato não suportado: ${file.type}. Use JPG, PNG, GIF ou WEBP.`);
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(2)}MB). Máximo 5MB.`);
        }
        const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const arquivo = ref(storage, `produtos/${Date.now()}_${gerarId()}_${nomeSeguro}`);
        await uploadBytes(arquivo, file, { contentType: file.type });
        return getDownloadURL(arquivo);
    }

    btnUploadImg.addEventListener('click', async () => {
        const files = imgUploadInput.files;
        if (!files.length) {
            alert('Selecione pelo menos uma imagem.');
            return;
        }

        const imagensAtuais = imagens.value.split(',').map(s => s.trim()).filter(s => s);
        btnUploadImg.disabled = true;
        btnUploadImg.textContent = '⏳ Enviando...';
        uploadProgress.textContent = '0/' + files.length;

        let sucesso = 0;
        let erros = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const url = await uploadParaStorage(file);
                imagensAtuais.push(url);
                sucesso++;
                uploadProgress.textContent = `${sucesso}/${files.length} enviadas`;
            } catch (e) {
                console.error(`Erro no arquivo ${file.name}:`, e);
                erros.push(`${file.name}: ${e.message}`);
            }
        }

        imagens.value = imagensAtuais.join(', ');
        atualizarPreview(imagens.value);
        btnUploadImg.disabled = false;
        btnUploadImg.textContent = '⬆ Enviar para Supabase Storage';
        uploadProgress.textContent = `✅ ${sucesso} imagens adicionadas!`;

        if (erros.length > 0) {
            alert(`Alguns uploads falharam:\n\n${erros.join('\n')}\n\n💡 Dica: Você pode colar manualmente as URLs das imagens no campo "Imagens".`);
        }

        setTimeout(() => uploadProgress.textContent = '', 4000);
        imgUploadInput.value = '';
    });

    async function carregarProdutos() {
        try {
            const snapshot = await getDocs(collection(db, 'produtos'));
            produtos = snapshot.docs.map(snapshotDoc => ({ ...snapshotDoc.data(), _firestoreId: snapshotDoc.id }));
            renderizarLista();
        } catch (e) {
            console.error('Erro ao carregar produtos do Supabase:', e);
            produtos = [];
            renderizarLista();
        }
    }

    async function importarCatalogoBase() {
        const botao = document.getElementById('btnImportarCatalogoBase');
        if (!confirm('Importar apenas os produtos de produtos.json que ainda não existem no Supabase? Produtos já existentes não serão alterados.')) return;
        if (botao) { botao.disabled = true; botao.textContent = '⏳ A importar...'; }
        try {
            const resposta = await fetch('produtos.json', { cache: 'no-store' });
            if (!resposta.ok) throw new Error(`Não foi possível ler produtos.json (HTTP ${resposta.status}).`);
            const catalogoBase = await resposta.json();
            if (!Array.isArray(catalogoBase)) throw new Error('produtos.json não contém uma lista de produtos.');

            const idsExistentes = new Set(produtos.map(p => String(p.id || p._firestoreId)));
            let importados = 0;
            let ignorados = 0;
            for (const origem of catalogoBase) {
                const id = String(origem?.id || '').trim();
                const preco = String(origem?.preco || '').trim();
                if (!id || !origem?.nome || !origem?.categoria || valorMonetarioKz(preco) === null) {
                    ignorados++;
                    continue;
                }
                if (idsExistentes.has(id)) {
                    ignorados++;
                    continue;
                }
                const estoqueOrigem = Number(origem?.estoque);
                const produtoBase = {
                    id,
                    ordem: Number.isInteger(Number(origem?.ordem)) ? Number(origem.ordem) : 999999,
                    nome: String(origem.nome).trim(),
                    categoria: String(origem.categoria).trim(),
                    preco,
                    precoValor: valorMonetarioKz(preco),
                    precoAntigo: String(origem.precoAntigo || '').trim(),
                    custo: String(origem.custo || '').trim(),
                    desconto: String(origem.desconto || '').trim(),
                    parcelas: String(origem.parcelas || '').trim(),
                    freteGratis: origem.freteGratis === true,
                    descricao: String(origem.descricao || '').trim(),
                    imagens: Array.isArray(origem.imagens) ? origem.imagens.slice(0, 8) : [],
                    tag: String(origem.tag || origem.categoria).trim(),
                    estoque: Number.isInteger(estoqueOrigem) && estoqueOrigem >= 0 ? estoqueOrigem : 0,
                    marca: String(origem.marca || '').trim(),
                    sku: String(origem.sku || '').trim(),
                    ativo: true,
                    vendedorAtivo: true,
                    statusAprovacao: 'aprovado'
                };
                await setDoc(doc(db, 'produtos', id), produtoBase);
                idsExistentes.add(id);
                importados++;
            }
            if (importados) invalidarCatalogoPublico();
            await carregarProdutos();
            mostrarMensagem(`${importados} produto(s) importado(s). ${ignorados} ignorado(s). Os produtos sem stock no ficheiro foram importados com estoque 0; informe o stock real antes de vender.`, 'sucesso');
        } catch (e) {
            console.error('Erro ao importar catálogo-base:', e);
            mostrarMensagem(`Não foi possível importar o catálogo: ${e.message || e}`, 'info');
        } finally {
            if (botao) { botao.disabled = false; botao.textContent = '⬇️ Importar catálogo do site'; }
        }
    }

    function mostrarMensagem(texto, tipo = 'info') {
        statusMsg.style.display = 'block';
        statusMsg.textContent = texto;
        statusMsg.className = 'aviso';
        if (tipo === 'sucesso') statusMsg.classList.add('sucesso');
        setTimeout(() => { statusMsg.style.display = 'none'; }, 4000);
    }

    function renderizarLista() {
        contadorSpan.textContent = produtos.length;
        const total = produtos.length;
        const esgotados = produtos.filter(p => Number(p.estoque || 0) <= 0).length;
        const baixos = produtos.filter(p => Number(p.estoque || 0) > 0 && Number(p.estoque || 0) <= 5).length;
        const normais = Math.max(0, total - esgotados - baixos);
        if (kpiProdutos) kpiProdutos.textContent = total;
        if (kpiEstoqueOk) kpiEstoqueOk.textContent = normais;
        if (kpiEstoqueBaixo) kpiEstoqueBaixo.textContent = baixos;
        if (kpiEsgotados) kpiEsgotados.textContent = esgotados;

        const termo = filtroProdutosAdmin.trim().toLowerCase();
        const ordenados = [...produtos].sort((a,b) => (a.ordem || 0) - (b.ordem || 0));
        const filtrados = ordenados.filter(prod => {
            const texto = `${prod.nome || ''} ${prod.categoria || ''} ${prod.tag || ''}`.toLowerCase();
            const estoque = Number(prod.estoque || 0);
            const passaTexto = !termo || texto.includes(termo);
            const passaEstoque = filtroEstoqueAdmin === 'todos' ||
                (filtroEstoqueAdmin === 'ok' && estoque > 5) ||
                (filtroEstoqueAdmin === 'baixo' && estoque > 0 && estoque <= 5) ||
                (filtroEstoqueAdmin === 'esgotado' && estoque <= 0);
            return passaTexto && passaEstoque;
        });

        if (filtrados.length === 0) {
            listaDiv.innerHTML = `<p style="color:#999;padding:18px;text-align:center;">Nenhum produto corresponde ao filtro.</p>`;
            return;
        }
        listaDiv.innerHTML = filtrados.map(prod => {
            const estoqueAtual = Number(prod.estoque || 0);
            const classeEstoque = estoqueAtual <= 0 ? 'out' : estoqueAtual <= 5 ? 'low' : 'ok';
            const textoEstoque = estoqueAtual <= 0 ? 'Esgotado' : `${estoqueAtual} em estoque`;
            return `
                <div class="produto-item" data-id="${escapeHTML(prod.id || prod._firestoreId)}">
                    <div style="min-width:0;flex:1;">
                        <strong>${escapeHTML(prod.nome || 'Produto')}</strong>
                        <small style="color:#888;display:block;margin-top:3px;">${escapeHTML(prod.categoria || 'Sem categoria')} | ${escapeHTML(prod.preco || '')} | ${escapeHTML(prod.marca || '')}${prod.sku ? ` | SKU: ${escapeHTML(prod.sku)}` : ''}</small>
                        <small class="admin-pro-stock ${classeEstoque}" style="display:block;margin-top:5px;">${textoEstoque}</small>
                    </div>
                    <div class="acoes">
                        <button class="btn-admin" data-editar="${escapeHTML(prod._firestoreId)}">✏️ Editar</button>
                        <button class="btn-admin btn-admin-excluir" data-excluir="${escapeHTML(prod._firestoreId)}">🗑️ Excluir</button>
                    </div>
                </div>`;
        }).join('');
    }

    listaDiv.addEventListener('click', (event) => {
        const editar = event.target.closest('[data-editar]');
        const excluir = event.target.closest('[data-excluir]');
        if (editar) window.editarProduto(editar.dataset.editar);
        if (excluir) window.excluirProduto(excluir.dataset.excluir);
    });

    function textoParaLista(texto) {
        return String(texto || '').split('\n').map(v => v.trim()).filter(Boolean);
    }

    function textoParaEspecificacoes(texto) {
        const obj = {};
        textoParaLista(texto).forEach(linha => {
            const pos = linha.indexOf(':');
            if (pos > 0) obj[linha.slice(0, pos).trim()] = linha.slice(pos + 1).trim();
        });
        return obj;
    }

    function especificacoesParaTexto(valor) {
        if (!valor || typeof valor !== 'object') return '';
        return Object.entries(valor).map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const precoValor = preco.value.trim();
        if (!nome.value.trim() || !categoria.value || !precoValor) {
            alert('Preencha Nome, Categoria e Preço obrigatoriamente.');
            return;
        }
        const precoNumerico = valorMonetarioKz(precoValor);
        if (precoNumerico === null) {
            alert('Preço inválido. Use o formato 1.500,00 Kz.');
            return;
        }

        const imagensArray = imagens.value.split(',').map(s => s.trim()).filter(s => s && !s.includes('placeholder'));
        const imagensFinal = imagensArray.length > 0 ? imagensArray : [IMAGEM_FALLBACK];

        const novoProduto = {
            id: editandoId || gerarId(),  // ✅ CORREÇÃO: usar gerarId() em vez de crypto.randomUUID()
            ordem: parseInt(ordem.value) || 0,
            nome: nome.value.trim(),
            categoria: categoria.value,
            preco: precoValor,
            precoValor: precoNumerico,
            precoAntigo: precoAntigo.value.trim() || '',
            custo: custo.value.trim(),
            desconto: desconto.value.trim() || '',
            parcelas: parcelas.value.trim() || '',
            freteGratis: freteGratis.checked,
            descricao: descricao.value.trim(),
            imagens: imagensFinal,
            tag: tag.value.trim() || categoria.value,
            estoque: parseInt(estoque.value) || 0,
            video: video.value.trim(),
            marca: marca.value.trim(),
            sku: sku.value.trim(),
            destaques: textoParaLista(destaques.value),
            especificacoes: textoParaEspecificacoes(especificacoes.value),
            selo: selo.value.trim(),
            ativo: produtoAtivo.checked,
            atualizadoEm: new Date().toISOString()
        };

        try {
            if (editandoId) {
                await updateDoc(doc(db, 'produtos', editandoId), novoProduto);
                mostrarMensagem('Produto atualizado!', 'sucesso');
            } else {
                // O ID do documento e o ID público do produto são iguais, para que
                // a Cloud Function possa validar o carrinho em uma transação.
                await setDoc(doc(db, 'produtos', novoProduto.id), novoProduto);
                mostrarMensagem('Produto adicionado!', 'sucesso');
            }
            invalidarCatalogoPublico();
            resetForm();
            await carregarProdutos();
        } catch (e) {
            console.error('Erro ao salvar produto:', e);
            mostrarMensagem('Erro ao salvar produto: ' + e.message, 'info');
        }
    });

    window.editarProduto = function(id) {
        const prod = produtos.find(p => p._firestoreId === id);
        if (!prod) return;
        editandoId = prod._firestoreId;
        prodId.value = prod.id;
        nome.value = prod.nome;
        categoria.value = prod.categoria;
        tag.value = prod.tag || '';
        preco.value = prod.preco;
        precoAntigo.value = prod.precoAntigo || '';
        custo.value = prod.custo || '';
        desconto.value = prod.desconto || '';
        parcelas.value = prod.parcelas || '';
        freteGratis.checked = prod.freteGratis || false;
        descricao.value = prod.descricao || '';
        imagens.value = Array.isArray(prod.imagens) ? prod.imagens.filter(i => !i.includes('placeholder')).join(', ') : '';
        ordem.value = prod.ordem || 0;
        estoque.value = prod.estoque || 0;
        video.value = prod.video || '';
        marca.value = prod.marca || '';
        sku.value = prod.sku || '';
        destaques.value = Array.isArray(prod.destaques) ? prod.destaques.join('\n') : '';
        especificacoes.value = especificacoesParaTexto(prod.especificacoes);
        selo.value = prod.selo || '';
        produtoAtivo.checked = prod.ativo !== false;
        atualizarPreview(imagens.value);

        formTitulo.textContent = '✏️ Editar Produto';
        btnSalvar.textContent = '💾 Atualizar Produto';
        btnCancelar.style.display = 'inline-block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.excluirProduto = async function(id) {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return;
        try {
            await deleteDoc(doc(db, 'produtos', id));
            invalidarCatalogoPublico();
            produtos = produtos.filter(p => p._firestoreId !== id);
            if (editandoId === id) resetForm();
            renderizarLista();
            mostrarMensagem('Produto excluído.', 'sucesso');
        } catch (e) {
            mostrarMensagem('Erro ao excluir.', 'info');
        }
    };

    btnCancelar.addEventListener('click', resetForm);

    function resetForm() {
        editandoId = null;
        form.reset();
        prodId.value = '';
        ordem.value = '0';
        estoque.value = '10';
        video.value = '';
        custo.value = '';
        marca.value = '';
        sku.value = '';
        destaques.value = '';
        especificacoes.value = '';
        selo.value = '';
        produtoAtivo.checked = true;
        formTitulo.textContent = '➕ Novo Produto';
        btnSalvar.textContent = '💾 Salvar Produto';
        btnCancelar.style.display = 'none';
        previewImagens.innerHTML = '';
        imagens.value = '';
    }

    imagens.addEventListener('input', () => { atualizarPreview(imagens.value); });

    function atualizarPreview(texto) {
        const urls = texto.split(',').map(s => s.trim()).filter(s => s && !s.includes('placeholder'));
        previewImagens.innerHTML = '';
        urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.onerror = () => { img.style.display = 'none'; };
            previewImagens.appendChild(img);
        });
    }

    document.getElementById('btnRecarregar').addEventListener('click', () => { carregarProdutos(); mostrarMensagem('Lista recarregada.', 'info'); });

    document.getElementById('btnImportarCatalogoBase')?.addEventListener('click', importarCatalogoBase);

    filtroProdutosInput?.addEventListener('input', () => { filtroProdutosAdmin = filtroProdutosInput.value; renderizarLista(); });
    filtroEstoqueInput?.addEventListener('change', () => { filtroEstoqueAdmin = filtroEstoqueInput.value; renderizarLista(); });
    document.getElementById('btnNovoProdutoRapido')?.addEventListener('click', () => { resetForm(); nome?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.getElementById('btnSairAdmin')?.addEventListener('click', async () => { await signOut(auth); location.reload(); });

    carregarProdutos();
}
