// js/fidelidade.js
import { auth, db } from './config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile
} from './supabase-compat.js';
import { 
    doc, getDoc, setDoc, updateDoc, arrayUnion 
} from './supabase-compat.js';
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
                // Criar registo no Supabase
                await setDoc(doc(db, 'clientes', userCred.user.uid), {
                    nome: nome,
                    email: email,
                    pontos: 0,
                    historico: [],
                    criadoEm: new Date()
                });
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
            // Criar documento se não existir (caso de login antigo)
            await setDoc(docRef, {
                nome: auth.currentUser.displayName || 'Cliente',
                email: auth.currentUser.email,
                pontos: 0,
                historico: [],
                criadoEm: new Date()
            });
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

// Função para adicionar pontos após uma compra
export async function adicionarPontos(valorTotal) {
    if (!usuarioAtual) return; // Não adiciona se não logado

    const pontosGanhos = Math.floor(valorTotal / 1000); // 1 ponto por 1000 Kz
    if (pontosGanhos <= 0) return;

    try {
        const docRef = doc(db, 'clientes', usuarioAtual.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const novosPontos = (dados.pontos || 0) + pontosGanhos;
            await updateDoc(docRef, {
                pontos: novosPontos,
                historico: arrayUnion({
                    data: new Date(),
                    tipo: 'ganho',
                    pontos: pontosGanhos,
                    descricao: 'Compra'
                })
            });
            pontosAtuais = novosPontos;
            localStorage.setItem('aurora_pontos', String(novosPontos));
            atualizarUI();
            mostrarToast(`+${pontosGanhos} pontos ganhos!`, 'sucesso');
        }
    } catch (e) {
        console.error('Erro ao adicionar pontos:', e);
    }
}

// Função para resgatar pontos (desconto)
export async function resgatarPontos(pontosParaResgatar) {
    if (!usuarioAtual) return false;
    if (pontosParaResgatar > pontosAtuais) {
        mostrarToast('Pontos insuficientes.', 'info');
        return false;
    }

    try {
        const docRef = doc(db, 'clientes', usuarioAtual.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const novosPontos = (dados.pontos || 0) - pontosParaResgatar;
            await updateDoc(docRef, {
                pontos: novosPontos,
                historico: arrayUnion({
                    data: new Date(),
                    tipo: 'resgate',
                    pontos: -pontosParaResgatar,
                    descricao: 'Resgate de cupom'
                })
            });
            pontosAtuais = novosPontos;
            localStorage.setItem('aurora_pontos', String(novosPontos));
            atualizarUI();
            mostrarToast('✅ Pontos resgatados!', 'sucesso');
            return true;
        }
    } catch (e) {
        console.error('Erro ao resgatar pontos:', e);
        return false;
    }
}