// js/fidelidade.js
import { auth, db } from './config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile
} from './supabase-compat.js';
import { doc, getDoc } from './supabase-compat.js';
import { mostrarToast } from './utils.js';

// Estado do usuário atual
let usuarioAtual = null;
let pontosAtuais = 0;

// Inicializar fidelidade: verificar se há sessão
export function initFidelidade() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            usuarioAtual = user;
            await carregarDadosUsuario(user.uid);
            atualizarUI();
        } else {
            usuarioAtual = null;
            pontosAtuais = 0;
            atualizarUI();
        }
    });

    // Configurar modal de login (se existir)
    const btnEntrar = document.getElementById('btnEntrar');
    const modalLogin = document.getElementById('modalLogin');
    const btnFecharLogin = document.getElementById('btnFecharLogin');
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');
    const btnRegistrarSubmit = document.getElementById('btnRegistrarSubmit');
    const btnMostrarRegistro = document.getElementById('btnMostrarRegistro');
    const btnMostrarLogin = document.getElementById('btnMostrarLogin');
    const emailInput = document.getElementById('loginEmail');
    const senhaInput = document.getElementById('loginSenha');
    const nomeRegInput = document.getElementById('registroNome');
    const emailRegInput = document.getElementById('registroEmail');
    const senhaRegInput = document.getElementById('registroSenha');
    const erroLogin = document.getElementById('erroLoginMsg');
    const erroRegistro = document.getElementById('erroRegistroMsg');
    const btnLogout = document.getElementById('btnLogout');
    const painelConta = document.getElementById('painelConta');
    const formLogin = document.getElementById('formLogin');
    const formRegistro = document.getElementById('formRegistro');

    if (btnEntrar) {
        btnEntrar.addEventListener('click', () => {
            if (usuarioAtual) {
                abrirPainelConta();
            } else {
                mostrarForm('login');
                modalLogin.style.display = 'flex';
            }
        });
    }

    if (btnFecharLogin) {
        btnFecharLogin.addEventListener('click', () => {
            modalLogin.style.display = 'none';
        });
    }

    if (btnLoginSubmit) {
        btnLoginSubmit.addEventListener('click', async () => {
            try {
                const email = emailInput.value;
                const senha = senhaInput.value;
                await signInWithEmailAndPassword(auth, email, senha);
                modalLogin.style.display = 'none';
                mostrarToast('✅ Login efetuado com sucesso!', 'sucesso');
            } catch (e) {
                erroLogin.textContent = e.message;
                erroLogin.style.display = 'block';
            }
        });
    }

    if (btnRegistrarSubmit) {
        btnRegistrarSubmit.addEventListener('click', async () => {
            try {
                const nome = nomeRegInput.value;
                const email = emailRegInput.value;
                const senha = senhaRegInput.value;
                const userCred = await createUserWithEmailAndPassword(auth, email, senha);
                await updateProfile(userCred.user, { displayName: nome });
                // O trigger on_auth_user_created cria o registo em public.clientes.
                modalLogin.style.display = 'none';
                mostrarToast('✅ Conta criada com sucesso!', 'sucesso');
            } catch (e) {
                erroRegistro.textContent = e.message;
                erroRegistro.style.display = 'block';
            }
        });
    }

    if (btnMostrarRegistro) {
        btnMostrarRegistro.addEventListener('click', () => {
            mostrarForm('registro');
        });
    }

    if (btnMostrarLogin) {
        btnMostrarLogin.addEventListener('click', () => {
            mostrarForm('login');
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await signOut(auth);
            modalLogin.style.display = 'none';
            mostrarToast('Sessão encerrada.', 'info');
        });
    }

    // Fechar modal clicando fora
    if (modalLogin) {
        modalLogin.addEventListener('click', (e) => {
            if (e.target === modalLogin) {
                modalLogin.style.display = 'none';
            }
        });
    }

    function mostrarForm(tipo) {
        if (formLogin) formLogin.style.display = tipo === 'login' ? 'block' : 'none';
        if (formRegistro) formRegistro.style.display = tipo === 'registro' ? 'block' : 'none';
        if (painelConta) painelConta.style.display = 'none';
    }

    function abrirPainelConta() {
        // Preencher dados do painel
        document.getElementById('contaNome').textContent = usuarioAtual.displayName || 'Cliente';
        document.getElementById('contaEmail').textContent = usuarioAtual.email || '';
        document.getElementById('contaPontos').textContent = pontosAtuais;
        // Mostrar painel
        if (formLogin) formLogin.style.display = 'none';
        if (formRegistro) formRegistro.style.display = 'none';
        if (painelConta) painelConta.style.display = 'block';
        modalLogin.style.display = 'flex';
    }
}

async function carregarDadosUsuario(uid) {
    try {
        const docRef = doc(db, 'clientes', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            pontosAtuais = dados.pontos || 0;
            // Salvar no localStorage para acesso rápido
            localStorage.setItem('aurora_pontos', String(pontosAtuais));
        } else {
            // O trigger do Supabase normalmente cria este registo no momento
            // do cadastro. Não fazemos INSERT direto no browser como fallback,
            // porque pontos/histórico são campos protegidos pelo backend.
            pontosAtuais = 0;
        }
    } catch (e) {
        console.error('Erro ao carregar dados do usuário:', e);
        pontosAtuais = parseInt(localStorage.getItem('aurora_pontos') || '0');
    }
}

function atualizarUI() {
    const badge = document.getElementById('badgePontos');
    const btnEntrar = document.getElementById('btnEntrar');
    
    if (badge) {
        badge.textContent = `⭐ ${pontosAtuais} pts`;
        badge.style.display = 'inline-block';
    }
    if (btnEntrar) {
        if (usuarioAtual) {
            btnEntrar.innerHTML = `<small>Olá, ${usuarioAtual.displayName || 'Cliente'}</small> Conta`;
        } else {
            btnEntrar.innerHTML = `<small>Olá, faça seu login</small> Conta`;
        }
    }
}

// Pontos de fidelidade são atribuídos pelo backend quando o pedido passa para "pago".
// Estas funções ficam apenas por compatibilidade com código antigo e não escrevem
// pontos diretamente no navegador.
export async function adicionarPontos() {
    console.warn('[VORA 313] Os pontos são atribuídos pelo backend após confirmação do pagamento.');
    return false;
}

export async function resgatarPontos() {
    console.warn('[VORA 313] O resgate de pontos ainda não possui uma regra de cupom configurada.');
    return false;
}
