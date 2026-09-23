import { auth, db, functions } from './config.js';
import { collection, getDocs, query, where } from './supabase-compat.js';
import { getIdTokenResult, signInWithEmailAndPassword, signOut } from './supabase-compat.js';
import { httpsCallable } from './supabase-compat.js';
import { extrairValorNumerico, escapeHTML } from './utils.js';
import { exportarBackupCompleto } from './fase4.js'; // ✅ Fase 4

if (!document.getElementById('loginVendas') || !document.getElementById('conteudoVendas')) {
    console.warn('admin-vendas.js carregado em página incorreta. Abortando execução.');
    throw new Error('Página incorreta para admin-vendas.js');
}

let todasVendas = [];
let catalogo = [];
let graficos = {};
let vendedoresAdmin = [];
let vendasVendedorAdmin = [];
let produtosVendedorAdmin = [];

function chartDisponivel() {
    return typeof Chart !== 'undefined';
}

function parseDataHora(dataStr) {
    if (!dataStr) return null;
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/;
    const match = dataStr.match(regex);
    if (match) {
        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]) - 1;
        const ano = parseInt(match[3]);
        const hora = match[4] ? parseInt(match[4]) : 0;
        const minuto = match[5] ? parseInt(match[5]) : 0;
        return new Date(ano, mes, dia, hora, minuto);
    }
    const data = new Date(dataStr);
    return isNaN(data.getTime()) ? null : data;
}

function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function destruirGrafico(nome) {
    if (graficos[nome]) {
        graficos[nome].destroy();
        graficos[nome] = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginDiv = document.getElementById('loginVendas');
    const conteudoDiv = document.getElementById('conteudoVendas');
    const btnLogin = document.getElementById('btnLoginVendas');
    const emailInput = document.getElementById('emailVendas');
    const senhaInput = document.getElementById('senhaVendas');
    const erroLogin = document.getElementById('erroLoginVendas');

    if (!loginDiv || !conteudoDiv || !btnLogin || !emailInput || !senhaInput || !erroLogin) return;

    btnLogin.addEventListener('click', async () => {
        try {
            const credencial = await signInWithEmailAndPassword(auth, emailInput.value.trim(), senhaInput.value);
            const token = await getIdTokenResult(credencial.user, true);
            if (token.claims.admin !== true) {
                await signOut(auth);
                throw new Error('Esta conta não possui acesso administrativo.');
            }
            loginDiv.style.display = 'none';
            conteudoDiv.style.display = 'block';
            carregarDados();
        } catch (error) {
            erroLogin.style.display = 'block';
            erroLogin.textContent = 'Credenciais inválidas';
        }
    });

    senhaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnLogin.click(); });

    document.querySelectorAll('.aba-btn').forEach(btn => {
        btn.addEventListener('click', () => trocarAba(btn.dataset.aba).catch(e => console.error('Erro ao trocar aba:', e)));
    });

    configurarExportacoes();

    document.getElementById('btnAtualizarVendedores')?.addEventListener('click', () => carregarPainelVendedoresAdmin(true));
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-admin-vendedor-action]');
        if (btn) {
            await acaoVendedorAdmin(btn.dataset.id, btn.dataset.adminVendedorAction);
            return;
        }
        const prodBtn = event.target.closest('[data-admin-produto-action]');
        if (prodBtn) await acaoProdutoVendedorAdmin(prodBtn.dataset.id, prodBtn.dataset.adminProdutoAction);
    });

    // ✅ Fase 4: Botão de backup
    const btnBackup = document.getElementById('btnBackupCompleto');
    if (btnBackup) {
        btnBackup.addEventListener('click', async () => {
            try {
                await exportarBackupCompleto();
                alert('Backup exportado com sucesso!');
            } catch (e) {
                alert('Erro ao exportar backup: ' + e.message);
            }
        });
    }

    document.getElementById('btnFiltrarDia')?.addEventListener('click', () => renderizarDiario());
    document.getElementById('btnLimparDia')?.addEventListener('click', () => {
        document.getElementById('inputDiaDiario').value = '';
        renderizarDiario();
    });
    document.getElementById('btnFiltrarSemana')?.addEventListener('click', () => renderizarSemanal());
    document.getElementById('btnLimparSemana')?.addEventListener('click', () => {
        document.getElementById('selectSemanaFiltro').value = '';
        renderizarSemanal();
    });
    document.getElementById('btnFiltrarMes')?.addEventListener('click', () => renderizarMensal());
    document.getElementById('btnLimparMes')?.addEventListener('click', () => {
        document.getElementById('selectMesFiltro').value = '';
        renderizarMensal();
    });
    document.getElementById('btnFiltrarAno')?.addEventListener('click', () => renderizarAnual());
    document.getElementById('btnLimparAno')?.addEventListener('click', () => {
        document.getElementById('selectAnoFiltro').value = '';
        renderizarAnual();
    });
    document.getElementById('filtroGlobalPedidos')?.addEventListener('input', () => renderizarPedidos());
    document.getElementById('filtroPedidoCliente')?.addEventListener('input', () => renderizarPedidos());
    document.getElementById('filtroStatus')?.addEventListener('change', () => renderizarPedidos());
    document.getElementById('btnFiltrarPendentes')?.addEventListener('click', () => {
        document.getElementById('filtroStatus').value = 'aguardando_pagamento';
        renderizarPedidos();
    });
    document.getElementById('btnFiltrarEntregues')?.addEventListener('click', () => {
        document.getElementById('filtroStatus').value = 'entregue';
        renderizarPedidos();
    });
});

async function carregarDados() {
    try {
        const vendasSnap = await getDocs(collection(db, 'vendas'));
        todasVendas = vendasSnap.docs.map(doc => doc.data());

        const produtosSnap = await getDocs(collection(db, 'produtos'));
        catalogo = produtosSnap.docs.map(doc => doc.data());

        preencherSelects();
        renderizarDashboard();
        
        const dataAtualEl = document.getElementById('dataAtual');
        if (dataAtualEl) {
            const hoje = new Date();
            dataAtualEl.textContent = hoje.toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
        alert('Erro ao carregar dados: ' + e.message);
    }
}

function preencherSelects() {
    const anos = [...new Set(todasVendas.map(v => {
        const data = parseDataHora(v.dataHora);
        return data ? data.getFullYear() : null;
    }).filter(Boolean))].sort();
    
    const selectAno = document.getElementById('selectAnoFiltro');
    if (selectAno) {
        selectAno.innerHTML = '<option value="">Todos os anos</option>';
        anos.forEach(ano => selectAno.innerHTML += `<option value="${ano}">${ano}</option>`);
    }

    const selectSemana = document.getElementById('selectSemanaFiltro');
    if (selectSemana) {
        selectSemana.innerHTML = '<option value="">Todas as semanas</option>';
        for (let i = 1; i <= 5; i++) selectSemana.innerHTML += `<option value="${i}">Semana ${i}</option>`;
    }
}

async function trocarAba(abaId) {
    document.querySelectorAll('.aba-btn').forEach(btn => btn.classList.toggle('ativa', btn.dataset.aba === abaId));
    document.querySelectorAll('.aba-conteudo').forEach(div => div.classList.toggle('ativa', div.id === `aba-${abaId}`));
    
    switch (abaId) {
        case 'dashboard': renderizarDashboard(); break;
        case 'diario': renderizarDiario(); break;
        case 'semanal': renderizarSemanal(); break;
        case 'mensal': renderizarMensal(); break;
        case 'anual': renderizarAnual(); break;
        case 'vendedores': await carregarPainelVendedoresAdmin(); break;
        case 'produtos': renderizarProdutos(); break;
        case 'contabilidade': renderizarContabilidade(); break;
        case 'pedidos': renderizarPedidos(); break;
    }
}

function calcularCustoDaVenda(venda) {
    if (venda.itens && venda.itens.length) {
        let custo = 0;
        venda.itens.forEach(item => {
            const prod = catalogo.find(p => p.nome === item.nome);
            if (prod) {
                const precoItem = item.preco || extrairValorNumerico(prod.preco);
                const custoProduto = extrairValorNumerico(prod.custo);
                if (custoProduto > 0 && custoProduto < precoItem * 0.1) {
                    custo += precoItem * 0.6 * item.quantidade;
                } else {
                    custo += custoProduto * item.quantidade;
                }
            } else {
                custo += (item.preco || 0) * item.quantidade * 0.6;
            }
        });
        return custo;
    } else {
        return (venda.valorTotal || 0) * 0.6;
    }
}

function calcularLucroVenda(venda) {
    const receita = venda.valorTotal || 0;
    const custo = calcularCustoDaVenda(venda);
    return receita - custo;
}

function calcularMargemVenda(venda) {
    const receita = venda.valorTotal || 0;
    const lucro = calcularLucroVenda(venda);
    return receita > 0 ? (lucro / receita) * 100 : 0;
}

function renderizarDashboard() {
    const vendas = todasVendas;
    const faturamentoBruto = vendas.reduce((acc, v) => acc + (v.valorTotal || 0), 0);
    const custoTotal = vendas.reduce((acc, v) => acc + calcularCustoDaVenda(v), 0);
    const lucroBruto = faturamentoBruto - custoTotal;
    const margemLucro = faturamentoBruto > 0 ? (lucroBruto / faturamentoBruto) * 100 : 0;
    const pedidos = vendas.length;
    const pendentes = vendas.filter(v => v.status !== 'entregue').length;
    const totalFrete = vendas.reduce((acc, v) => acc + (v.frete || 0), 0);

    setText('kpiFaturamentoBruto', faturamentoBruto.toLocaleString('pt-AO') + ' Kz');
    setText('kpiCustoTotal', custoTotal.toLocaleString('pt-AO') + ' Kz');
    setText('kpiLucroBruto', lucroBruto.toLocaleString('pt-AO') + ' Kz');
    setText('kpiMargemLucro', margemLucro.toFixed(1) + '%');
    setText('kpiPedidos', pedidos);
    setText('kpiPendentes', pendentes);
    setText('kpiTotalFrete', totalFrete.toLocaleString('pt-AO') + ' Kz');

    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
    
    const vendasHoje = vendas.filter(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return false;
        const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
        return dataStr === hojeStr;
    });
    const faturamentoHoje = vendasHoje.reduce((acc, v) => acc + (v.valorTotal || 0), 0);
    setText('kpiFaturamentoHoje', faturamentoHoje.toLocaleString('pt-AO') + ' Kz');
    setText('kpiPedidosHoje', vendasHoje.length);

    const inicioSemana = new Date(hoje);
    const diaSemana = hoje.getDay();
    inicioSemana.setDate(hoje.getDate() - diaSemana);
    inicioSemana.setHours(0, 0, 0, 0);
    
    const vendasSemana = vendas.filter(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return false;
        return data >= inicioSemana;
    });
    const faturamentoSemana = vendasSemana.reduce((acc, v) => acc + (v.valorTotal || 0), 0);
    setText('kpiFaturamentoSemana', faturamentoSemana.toLocaleString('pt-AO') + ' Kz');
    setText('kpiPedidosSemana', vendasSemana.length);

    renderizarCentroOperacoes(vendas);
    renderizarResumoDiario(vendas);
    renderizarGraficoRoscaCategorias(vendas);
    renderizarGraficoTopClientes(vendas);
    renderizarGraficoVendasMes(vendas);
    renderizarGraficoLucratividade(vendas);
    renderizarGraficoSaldo(vendas);
    renderizarGraficoVendas(vendas);
    renderizarGraficoProdutos(vendas);
}

function renderizarCentroOperacoes(vendas) {
    const contar = status => vendas.filter(v => String(v.status || '').toLowerCase() === status).length;
    setText('opsAguardandoPagamento', contar('aguardando_pagamento'));
    setText('opsPagos', contar('pago'));
    setText('opsPreparacao', contar('em_preparacao'));
    setText('opsEnviados', contar('enviado'));

    const hoje = new Date();
    const entreguesHoje = vendas.filter(v => {
        if (String(v.status || '').toLowerCase() !== 'entregue') return false;
        const d = parseDataHora(v.dataHora);
        return d && d.toDateString() === hoje.toDateString();
    }).length;
    setText('opsEntreguesHoje', entreguesHoje);

    const lista = document.getElementById('opsListaAcoes');
    if (lista) {
        const prioridades = [
            ['aguardando_pagamento','🟠','Pagamentos aguardando confirmação'],
            ['pago','🟡','Pedidos pagos para processar'],
            ['em_preparacao','🔵','Pedidos em preparação'],
            ['enviado','🚚','Pedidos em entrega']
        ];
        lista.innerHTML = prioridades.map(([status,icon,label]) => {
            const qtd = contar(status);
            return `<div class="ops-item"><div><strong>${icon} ${label}</strong><small>${qtd} pedido(s)</small></div><span class="ops-badge">${qtd ? 'Atenção' : 'OK'}</span></div>`;
        }).join('');
    }

    const estoque = document.getElementById('opsResumoEstoque');
    if (estoque) {
        const esgotados = catalogo.filter(p => Number(p.estoque || 0) <= 0).length;
        const baixos = catalogo.filter(p => Number(p.estoque || 0) > 0 && Number(p.estoque || 0) <= 5).length;
        const normais = Math.max(0, catalogo.length - esgotados - baixos);
        estoque.innerHTML = `
          <div class="ops-item"><div><strong>🟢 Normal</strong><small>Mais de 5 unidades</small></div><span class="ops-badge">${normais}</span></div>
          <div class="ops-item"><div><strong>🟡 Baixo</strong><small>1 a 5 unidades</small></div><span class="ops-badge">${baixos}</span></div>
          <div class="ops-item"><div><strong>🔴 Esgotado</strong><small>Precisa de reposição</small></div><span class="ops-badge">${esgotados}</span></div>`;
    }
}

document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-ops-status]');
    if (!btn) return;
    trocarAba('pedidos').catch(e => console.error('Erro ao abrir pedidos:', e));
    const select = document.getElementById('filtroStatus');
    if (select) { select.value = btn.dataset.opsStatus; renderizarPedidos(); }
});

function renderizarResumoDiario(vendas) {
    const tbody = document.getElementById('corpoResumoDiario');
    if (!tbody) return;
    tbody.innerHTML = '';
    const resumo = {};
    
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
        if (!resumo[dataStr]) resumo[dataStr] = { total: 0, faturamento: 0, custo: 0, lucro: 0 };
        resumo[dataStr].total++;
        resumo[dataStr].faturamento += v.valorTotal || 0;
        resumo[dataStr].custo += calcularCustoDaVenda(v);
        resumo[dataStr].lucro += calcularLucroVenda(v);
    });
    
    const datas = Object.keys(resumo).sort((a,b)=>b.localeCompare(a));
    datas.forEach(dataStr => {
        const info = resumo[dataStr];
        const [ano, mes, dia] = dataStr.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;
        const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">${dataFormatada}</td>
            <td style="padding:8px; text-align:center;">${info.total}</td>
            <td style="padding:8px; text-align:right;">${info.faturamento.toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; text-align:right;">${info.custo.toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${info.lucro.toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; text-align:center;">${margem.toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarGraficoRoscaCategorias(vendas) {
    const porCategoria = {};
    vendas.forEach(v => {
        let cat = 'Outros';
        if (v.itens && v.itens.length) {
            const primeiroItem = v.itens[0];
            const prod = catalogo.find(p => p.nome === primeiroItem.nome);
            if (prod) cat = prod.categoria || prod.tag || 'Outros';
        } else if (v.produtosResumo) {
            const nomeProd = v.produtosResumo.split(' (x')[0];
            const prod = catalogo.find(p => p.nome === nomeProd);
            if (prod) cat = prod.categoria || prod.tag || 'Outros';
        }
        porCategoria[cat] = (porCategoria[cat] || 0) + (v.valorTotal || 0);
    });

    const ctx = document.getElementById('graficoRoscaCategorias');
    if (!ctx) return;
    const labels = Object.keys(porCategoria);
    const valores = Object.values(porCategoria);
    if (labels.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('roscaCategorias');
        graficos.roscaCategorias = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: valores,
                    backgroundColor: ['#D4AF37', '#005A4C', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#E67E22']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    }
}

function renderizarGraficoTopClientes(vendas) {
    const porCliente = {};
    vendas.forEach(v => {
        const nome = v.nomeCliente || 'Cliente não identificado';
        porCliente[nome] = (porCliente[nome] || 0) + (v.valorTotal || 0);
    });
    const top = Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const ctx = document.getElementById('graficoTopClientes');
    if (!ctx) return;
    if (top.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('topClientes');
        graficos.topClientes = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(p => p[0]),
                datasets: [{ label: 'Total Gasto (Kz)', data: top.map(p => p[1]), backgroundColor: '#3498db' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderizarGraficoVendasMes(vendas) {
    const porMes = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}`;
        if (!porMes[key]) porMes[key] = 0;
        porMes[key] += 1;
    });
    const keys = Object.keys(porMes).sort();
    const labels = keys.map(k => {
        const [ano, mes] = k.split('-');
        return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes] + ' ' + ano;
    });
    const valores = keys.map(k => porMes[k]);

    const ctx = document.getElementById('graficoVendasMes');
    if (!ctx) return;
    if (labels.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('vendasMes');
        graficos.vendasMes = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Pedidos', data: valores, backgroundColor: '#2ecc71' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderizarGraficoLucratividade(vendas) {
    const porMes = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}`;
        if (!porMes[key]) porMes[key] = { faturamento: 0, lucro: 0 };
        porMes[key].faturamento += v.valorTotal || 0;
        porMes[key].lucro += calcularLucroVenda(v);
    });
    const keys = Object.keys(porMes).sort();
    const labels = keys.map(k => {
        const [ano, mes] = k.split('-');
        return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes] + ' ' + ano;
    });
    const valores = keys.map(k => {
        const info = porMes[k];
        return info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
    });

    const ctx = document.getElementById('graficoLucratividade');
    if (!ctx) return;
    if (labels.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('lucratividade');
        graficos.lucratividade = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{ label: 'Margem (%)', data: valores, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.2)', fill: true, tension: 0.4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function renderizarGraficoSaldo(vendas) {
    const porDia = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
        if (!porDia[dataStr]) porDia[dataStr] = { faturamento: 0, custo: 0 };
        porDia[dataStr].faturamento += v.valorTotal || 0;
        porDia[dataStr].custo += calcularCustoDaVenda(v);
    });
    const dias = Object.keys(porDia).sort();
    let saldoAcumulado = 0;
    const saldos = dias.map(d => {
        saldoAcumulado += porDia[d].faturamento - porDia[d].custo;
        return saldoAcumulado;
    });

    const ctx = document.getElementById('graficoSaldo');
    if (!ctx) return;
    if (dias.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('saldo');
        graficos.saldo = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dias.map(d => {
                    const [ano, mes, dia] = d.split('-');
                    return `${dia}/${mes}/${ano}`;
                }),
                datasets: [{ label: 'Saldo Acumulado (Kz)', data: saldos, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.2)', fill: true, tension: 0.4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false
            }
        });
    }
}

function renderizarGraficoVendas(vendas) {
    const vendasPorDia = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const dia = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
        vendasPorDia[dia] = (vendasPorDia[dia] || 0) + (v.valorTotal || 0);
    });
    const ctx = document.getElementById('graficoVendas');
    if (!ctx) return;
    const dias = Object.keys(vendasPorDia).sort();
    const valores = dias.map(d => vendasPorDia[d]);
    if (dias.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('vendas');
        graficos.vendas = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dias.map(d => {
                    const [ano, mes, dia] = d.split('-');
                    return `${dia}/${mes}`;
                }),
                datasets: [{ label: 'Faturamento (Kz)', data: valores, backgroundColor: 'rgba(0, 90, 76, 0.7)', borderColor: '#005A4C', borderWidth: 1 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function renderizarGraficoProdutos(vendas) {
    const vendasPorProduto = {};
    vendas.forEach(venda => {
        if (venda.itens && Array.isArray(venda.itens)) {
            venda.itens.forEach(item => {
                const nome = item.nome;
                const qtd = item.quantidade || 1;
                vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + qtd;
            });
        } else if (venda.produtosResumo) {
            venda.produtosResumo.split(', ').forEach(item => {
                const nome = item.split(' (x')[0];
                const qtd = parseInt(item.split('(x')[1]) || 1;
                vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + qtd;
            });
        }
    });
    const topProdutos = Object.entries(vendasPorProduto).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const ctx = document.getElementById('graficoProdutos');
    if (!ctx) return;
    if (topProdutos.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('produtos');
        graficos.produtos = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: topProdutos.map(p => p[0]),
                datasets: [{ data: topProdutos.map(p => p[1]), backgroundColor: ['#D4AF37', '#005A4C', '#E74C3C', '#3498DB', '#2ECC71'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false
            }
        });
    }
}

function renderizarGraficoMensal(vendas) {
    const resumo = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}`;
        if (!resumo[key]) resumo[key] = { mes, ano, faturamento: 0, lucro: 0 };
        resumo[key].faturamento += v.valorTotal || 0;
        resumo[key].lucro += calcularLucroVenda(v);
    });
    const keys = Object.keys(resumo).sort();
    const ctx = document.getElementById('graficoMensal');
    if (!ctx) return;
    const labels = keys.map(k => {
        const [ano, mes] = k.split('-');
        return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes] + ' ' + ano;
    });
    const faturamentos = keys.map(k => resumo[k].faturamento);
    const lucros = keys.map(k => resumo[k].lucro);
    if (labels.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('mensal');
        graficos.mensal = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Faturamento', data: faturamentos, borderColor: '#005A4C', backgroundColor: 'rgba(0,90,76,0.2)', fill: true, tension: 0.4 },
                    { label: 'Lucro', data: lucros, borderColor: '#27ae60', backgroundColor: 'rgba(39,174,96,0.2)', fill: true, tension: 0.4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false
            }
        });
    }
}

function renderizarGraficoAnual(vendas) {
    const resumo = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const ano = data.getFullYear();
        if (!resumo[ano]) resumo[ano] = { faturamento: 0, lucro: 0 };
        resumo[ano].faturamento += v.valorTotal || 0;
        resumo[ano].lucro += calcularLucroVenda(v);
    });
    const anos = Object.keys(resumo).sort();
    const ctx = document.getElementById('graficoAnual');
    if (!ctx) return;
    const faturamentos = anos.map(a => resumo[a].faturamento);
    const lucros = anos.map(a => resumo[a].lucro);
    if (anos.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('anual');
        graficos.anual = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: anos,
                datasets: [
                    { label: 'Faturamento', data: faturamentos, backgroundColor: 'rgba(0,90,76,0.7)' },
                    { label: 'Lucro', data: lucros, backgroundColor: 'rgba(39,174,96,0.7)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false
            }
        });
    }
}

function renderizarGraficoMargemMensal() {
    const resumo = {};
    todasVendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}`;
        if (!resumo[key]) resumo[key] = { mes, ano, faturamento: 0, lucro: 0 };
        resumo[key].faturamento += v.valorTotal || 0;
        resumo[key].lucro += calcularLucroVenda(v);
    });
    const keys = Object.keys(resumo).sort();
    const ctx = document.getElementById('graficoMargemMensal');
    if (!ctx) return;
    const labels = keys.map(k => {
        const [ano, mes] = k.split('-');
        return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes] + ' ' + ano;
    });
    const margens = keys.map(k => {
        const info = resumo[k];
        return info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
    });
    if (labels.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('margem');
        graficos.margem = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{ label: 'Margem (%)', data: margens, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.2)', fill: true, tension: 0.4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function renderizarGraficoTopLucro() {
    const lucroPorProduto = {};
    todasVendas.forEach(venda => {
        if (venda.itens && Array.isArray(venda.itens)) {
            venda.itens.forEach(item => {
                const nome = item.nome;
                const qtd = item.quantidade || 1;
                const prod = catalogo.find(p => p.nome === nome);
                const custo = prod ? extrairValorNumerico(prod.custo) : (item.preco || 0) * 0.6;
                const receita = (item.preco || 0) * qtd;
                if (!lucroPorProduto[nome]) lucroPorProduto[nome] = 0;
                lucroPorProduto[nome] += receita - custo * qtd;
            });
        }
    });
    const top = Object.entries(lucroPorProduto).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const ctx = document.getElementById('graficoTopLucro');
    if (!ctx) return;
    if (top.length === 0) return;

    if (chartDisponivel()) {
        destruirGrafico('topLucro');
        graficos.topLucro = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(p => p[0]),
                datasets: [{ label: 'Lucro (Kz)', data: top.map(p => p[1]), backgroundColor: '#27ae60' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderizarDiario() {
    const diaSelecionado = document.getElementById('inputDiaDiario').value;
    let vendas = todasVendas;
    if (diaSelecionado) {
        vendas = todasVendas.filter(v => {
            const data = parseDataHora(v.dataHora);
            if (!data) return false;
            const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
            return dataStr === diaSelecionado;
        });
    }

    const faturamento = vendas.reduce((acc, v) => acc + (v.valorTotal || 0), 0);
    const custo = vendas.reduce((acc, v) => acc + calcularCustoDaVenda(v), 0);
    const lucro = faturamento - custo;
    const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;

    const resumoDiv = document.getElementById('resumoDiaContabil');
    if (resumoDiv) {
        resumoDiv.innerHTML = `
            <div class="kpi-contabil">
                <div class="card-kpi verde"><p>💰 Receita</p><h3>${faturamento.toLocaleString('pt-AO')} Kz</h3></div>
                <div class="card-kpi"><p>📦 Custo</p><h3>${custo.toLocaleString('pt-AO')} Kz</h3></div>
                <div class="card-kpi verde"><p>📈 Lucro</p><h3>${lucro.toLocaleString('pt-AO')} Kz</h3></div>
                <div class="card-kpi azul"><p>🎯 Margem</p><h3>${margem.toFixed(1)}%</h3></div>
            </div>
        `;
    }

    const container = document.getElementById('listaPedidosDia');
    if (!container) return;
    container.innerHTML = '';
    if (vendas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Nenhum pedido neste dia.</p>';
    } else {
        vendas.sort((a,b) => {
            const da = parseDataHora(a.dataHora);
            const db = parseDataHora(b.dataHora);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        vendas.forEach(v => {
            const lucroVenda = calcularLucroVenda(v);
            const margemVenda = calcularMargemVenda(v);
            const div = document.createElement('div');
            div.style.cssText = 'border:1px solid #ddd; padding:10px; margin-bottom:8px; border-radius:8px; background:#f9f9f9;';
            div.innerHTML = `
                <strong>${escapeHTML(v.dataHora || '')}</strong> - ${escapeHTML(v.nomeCliente || '')}<br>
                ${escapeHTML(v.produtosResumo || '')}<br>
                <span style="color:#25D366; font-weight:bold;">${(v.valorTotal||0).toLocaleString('pt-AO')} Kz</span> |
                <span style="color:#005A4C;">Lucro: ${lucroVenda.toLocaleString('pt-AO')} Kz (${margemVenda.toFixed(1)}%)</span> |
                <span style="color:${v.status==='entregue'?'#27ae60':'#E74C3C'};">${v.status==='entregue'?'✅ Entregue':'⚠️ Pendente'}</span>
            `;
            container.appendChild(div);
        });
    }
}

function renderizarSemanal() {
    const semanaFiltro = document.getElementById('selectSemanaFiltro').value;
    const vendas = todasVendas.filter(v => {
        if (!semanaFiltro) return true;
        const data = parseDataHora(v.dataHora);
        if (!data) return false;
        const semana = Math.floor((data.getDate() - 1) / 7) + 1;
        return semana === parseInt(semanaFiltro);
    });

    const resumo = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const semana = Math.floor((data.getDate() - 1) / 7) + 1;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}-${semana}`;
        if (!resumo[key]) resumo[key] = { semana, mes, ano, total: 0, faturamento: 0, custo: 0, lucro: 0 };
        resumo[key].total++;
        resumo[key].faturamento += v.valorTotal || 0;
        resumo[key].custo += calcularCustoDaVenda(v);
        resumo[key].lucro += calcularLucroVenda(v);
    });

    const tbody = document.getElementById('corpoTabelaSemanal');
    if (!tbody) return;
    tbody.innerHTML = '';
    const keys = Object.keys(resumo).sort();
    keys.forEach(key => {
        const info = resumo[key];
        const mesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][info.mes];
        const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">Semana ${info.semana} - ${mesNome}/${info.ano}</td>
            <td style="padding:8px; text-align:center;">${info.total}</td>
            <td style="padding:8px; text-align:right;">${info.faturamento.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right;">${info.custo.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${info.lucro.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:center;">${margem.toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarMensal() {
    const mesFiltro = document.getElementById('selectMesFiltro').value;
    const vendas = todasVendas.filter(v => {
        if (!mesFiltro) return true;
        const data = parseDataHora(v.dataHora);
        if (!data) return false;
        return data.getMonth() === parseInt(mesFiltro);
    });

    const resumo = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const key = `${ano}-${mes}`;
        if (!resumo[key]) resumo[key] = { mes, ano, total: 0, faturamento: 0, custo: 0, lucro: 0 };
        resumo[key].total++;
        resumo[key].faturamento += v.valorTotal || 0;
        resumo[key].custo += calcularCustoDaVenda(v);
        resumo[key].lucro += calcularLucroVenda(v);
    });

    const tbody = document.getElementById('corpoTabelaMensal');
    if (!tbody) return;
    tbody.innerHTML = '';
    const keys = Object.keys(resumo).sort();
    keys.forEach(key => {
        const info = resumo[key];
        const mesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][info.mes];
        const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">${mesNome} ${info.ano}</td>
            <td style="padding:8px; text-align:center;">${info.total}</td>
            <td style="padding:8px; text-align:right;">${info.faturamento.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right;">${info.custo.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${info.lucro.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:center;">${margem.toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });

    renderizarGraficoMensal(vendas);
}

function renderizarAnual() {
    const anoFiltro = document.getElementById('selectAnoFiltro').value;
    const vendas = todasVendas.filter(v => {
        if (!anoFiltro) return true;
        const data = parseDataHora(v.dataHora);
        if (!data) return false;
        return data.getFullYear() === parseInt(anoFiltro);
    });

    const resumo = {};
    vendas.forEach(v => {
        const data = parseDataHora(v.dataHora);
        if (!data) return;
        const ano = data.getFullYear();
        if (!resumo[ano]) resumo[ano] = { total: 0, faturamento: 0, custo: 0, lucro: 0 };
        resumo[ano].total++;
        resumo[ano].faturamento += v.valorTotal || 0;
        resumo[ano].custo += calcularCustoDaVenda(v);
        resumo[ano].lucro += calcularLucroVenda(v);
    });

    const tbody = document.getElementById('corpoTabelaAnual');
    if (!tbody) return;
    tbody.innerHTML = '';
    const anos = Object.keys(resumo).sort();
    anos.forEach(ano => {
        const info = resumo[ano];
        const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">${info.ano}</td>
            <td style="padding:8px; text-align:center;">${info.total}</td>
            <td style="padding:8px; text-align:right;">${info.faturamento.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right;">${info.custo.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${info.lucro.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:center;">${margem.toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });

    renderizarGraficoAnual(vendas);
}

function renderizarProdutos() {
    const vendasPorProduto = {};
    todasVendas.forEach(venda => {
        if (venda.itens && Array.isArray(venda.itens)) {
            venda.itens.forEach(item => {
                const nome = item.nome;
                const qtd = item.quantidade || 1;
                if (!vendasPorProduto[nome]) vendasPorProduto[nome] = { qtd: 0, receita: 0, custo: 0 };
                vendasPorProduto[nome].qtd += qtd;
                vendasPorProduto[nome].receita += (item.preco || 0) * qtd;
                const prod = catalogo.find(p => p.nome === nome);
                if (prod) vendasPorProduto[nome].custo += extrairValorNumerico(prod.custo) * qtd;
                else vendasPorProduto[nome].custo += (item.preco || 0) * qtd * 0.6;
            });
        } else if (venda.produtosResumo) {
            venda.produtosResumo.split(', ').forEach(item => {
                const nome = item.split(' (x')[0];
                const qtd = parseInt(item.split('(x')[1]) || 1;
                if (!vendasPorProduto[nome]) vendasPorProduto[nome] = { qtd: 0, receita: 0, custo: 0 };
                vendasPorProduto[nome].qtd += qtd;
                vendasPorProduto[nome].receita += (extrairValorNumerico(venda.valorTotal) / Math.max(1, vendasPorProduto[nome].qtd)) * qtd;
                const prod = catalogo.find(p => p.nome === nome);
                if (prod) vendasPorProduto[nome].custo += extrairValorNumerico(prod.custo) * qtd;
                else vendasPorProduto[nome].custo += (extrairValorNumerico(venda.valorTotal) / Math.max(1, vendasPorProduto[nome].qtd)) * qtd * 0.6;
            });
        }
    });

    const tbody = document.getElementById('corpoTabelaProdutos');
    if (!tbody) return;
    tbody.innerHTML = '';
    catalogo.forEach(prod => {
        const info = vendasPorProduto[prod.nome] || { qtd: 0, receita: 0, custo: 0 };
        const receita = info.receita;
        const custo = info.custo;
        const lucro = receita - custo;
        const margem = receita > 0 ? (lucro / receita) * 100 : 0;
        const estoque = prod.estoque || 0;
        const estoqueBaixo = estoque <= 5 ? 'background:#ffe0e0;' : '';
        const idCurto = prod.id ? prod.id.substring(0, 8) : 'N/A';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px; font-weight:600;">${idCurto}</td>
            <td style="padding:8px;">${escapeHTML(prod.nome || '')}</td>
            <td style="padding:8px; text-align:center;">${info.qtd}</td>
            <td style="padding:8px; text-align:right;">${receita.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right;">${custo.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${lucro.toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:center;">${margem.toFixed(1)}%</td>
            <td style="padding:8px; text-align:center; ${estoqueBaixo}">${estoque}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarContabilidade() {
    const receita = todasVendas.reduce((acc, v) => acc + (v.valorTotal || 0), 0);
    const custo = todasVendas.reduce((acc, v) => acc + calcularCustoDaVenda(v), 0);
    const lucro = receita - custo;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;

    setText('contReceita', receita.toLocaleString('pt-AO') + ' Kz');
    setText('contCusto', custo.toLocaleString('pt-AO') + ' Kz');
    setText('contLucro', lucro.toLocaleString('pt-AO') + ' Kz');
    setText('contMargem', margem.toFixed(1) + '%');

    const tbody = document.getElementById('corpoLancamentos');
    if (!tbody) return;
    tbody.innerHTML = '';
    const vendasOrdenadas = [...todasVendas].sort((a,b) => {
        const da = parseDataHora(a.dataHora);
        const db = parseDataHora(b.dataHora);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    }).slice(0,20);
    vendasOrdenadas.forEach(v => {
        const lucroVenda = calcularLucroVenda(v);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">${escapeHTML(v.dataHora || '')}</td>
            <td style="padding:8px;">${escapeHTML(v.nomeCliente || '')}</td>
            <td style="padding:8px; font-size:11px;">${v.produtosResumo || ''}</td>
            <td style="padding:8px; text-align:right;">${(v.valorTotal||0).toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right;">${calcularCustoDaVenda(v).toLocaleString('pt-AO')}</td>
            <td style="padding:8px; text-align:right; color:#27ae60;">${lucroVenda.toLocaleString('pt-AO')}</td>
        `;
        tbody.appendChild(tr);
    });

    renderizarGraficoMargemMensal();
    renderizarGraficoTopLucro();
}

function renderizarPedidos() {
    const clienteFiltro = document.getElementById('filtroPedidoCliente').value.trim().toLowerCase();
    const globalFiltro = document.getElementById('filtroGlobalPedidos')?.value.trim().toLowerCase() || '';
    const statusFiltro = document.getElementById('filtroStatus').value;

    let vendas = todasVendas;
    if (clienteFiltro) vendas = vendas.filter(v => (v.nomeCliente || '').toLowerCase().includes(clienteFiltro));
    if (globalFiltro) {
        vendas = vendas.filter(v => `${v.nomeCliente || ''} ${v.telefoneCliente || ''} ${v.codigoRastreio || ''} ${v.numeroFatura || ''}`.toLowerCase().includes(globalFiltro));
    }
    if (statusFiltro !== 'todos') vendas = vendas.filter(v => v.status === statusFiltro);

    const tbody = document.getElementById('corpoTabelaPedidos');
    if (!tbody) return;
    tbody.innerHTML = '';
    vendas.sort((a,b) => {
        const da = parseDataHora(a.dataHora);
        const db = parseDataHora(b.dataHora);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    vendas.forEach(v => {
        const status = v.status || 'aguardando_pagamento';
        const estados = {
            aguardando_pagamento: { texto: '⏳ Aguardando pagamento', cor: '#E67E22', proximo: 'pago', acao: '✅ Confirmar pagamento' },
            pago: { texto: '✅ Pago', cor: '#27ae60', proximo: 'em_preparacao', acao: '📦 Preparar' },
            em_preparacao: { texto: '📦 Em preparação', cor: '#8E44AD', proximo: 'enviado', acao: '🚚 Enviar' },
            enviado: { texto: '🔵 Enviado', cor: '#3498db', proximo: 'entregue', acao: '📦 Entregar' },
            entregue: { texto: '🟢 Entregue', cor: '#27ae60' },
            cancelado: { texto: '❌ Cancelado', cor: '#E74C3C' }
        };
        const estado = estados[status] || estados.aguardando_pagamento;
        const bg = status === 'aguardando_pagamento' ? 'background:#fff3e0;' : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:8px;">${escapeHTML(v.dataHora || 'N/A')}</td>
            <td style="padding:8px; font-weight:600;">${escapeHTML(v.nomeCliente || 'N/A')}</td>
            <td style="padding:8px;">${escapeHTML(v.telefoneCliente || 'N/A')}</td>
            <td style="padding:8px;">${escapeHTML(v.nifCliente || 'N/A')}</td>
            <td style="padding:8px; font-size:11px;">${escapeHTML(v.moradaCliente || 'N/A')}</td>
            <td style="padding:8px;">${escapeHTML(v.bairro || 'N/A')}</td>
            <td style="padding:8px; font-size:11px;">${escapeHTML(v.produtosResumo || 'N/A')}</td>
            <td style="padding:8px; text-align:right;">${(v.subtotal || (v.valorTotal - (v.frete||0))).toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; text-align:right; color:#007185;">${(v.frete || 0).toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; color:#25D366; font-weight:bold;">${(v.valorTotal || 0).toLocaleString('pt-AO')} Kz</td>
            <td style="padding:8px; ${bg}">
                <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:12px; background:${estado.cor}; color:#FFF;">
                    ${estado.texto}
                </span>
            </td>
            <td style="padding:8px; display:flex; gap:4px; flex-wrap:wrap;">
                ${estado.proximo ? `<button onclick="window.atualizarStatus(decodeURIComponent('${encodeURIComponent(v.codigoRastreio || '')}'), '${estado.proximo}')" style="background:${estado.cor}; color:#fff; border:none; padding:4px 8px; border-radius:12px; font-size:11px; cursor:pointer;">${estado.acao}</button>` : ''}
                <button onclick="window.imprimirFatura(decodeURIComponent('${encodeURIComponent(v.codigoRastreio || '')}'))" style="background:#D4AF37; color:#000; border:none; padding:4px 8px; border-radius:12px; font-size:11px; cursor:pointer;">🖨️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function configurarExportacoes() {
    const botoes = ['Dashboard', 'Diario', 'Semanal', 'Mensal', 'Anual', 'Produtos', 'Contabilidade', 'Pedidos'];
    botoes.forEach(tipo => {
        const btnPdf = document.getElementById(`btnExportarPDF${tipo}`);
        const btnExcel = document.getElementById(`btnExportarExcel${tipo}`);
        if (btnPdf) btnPdf.addEventListener('click', () => exportarPDF(tipo.toLowerCase()));
        if (btnExcel) btnExcel.addEventListener('click', () => exportarExcel(tipo.toLowerCase()));
    });
}

function exportarPDF(tipo) {
    if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
        alert('Biblioteca jsPDF não carregada.');
        return;
    }
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(0, 90, 76);
    doc.text('Relatório de Vendas - VORA 313', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26);

    let dados = [];
    let head = [];
    let startY = 35;

    if (tipo === 'dashboard') {
        head = [['Data', 'Pedidos', 'Faturamento', 'Custo', 'Lucro', 'Margem']];
        const resumo = {};
        todasVendas.forEach(v => {
            const data = parseDataHora(v.dataHora);
            if (!data) return;
            const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
            if (!resumo[dataStr]) resumo[dataStr] = { total: 0, faturamento: 0, custo: 0, lucro: 0 };
            resumo[dataStr].total++;
            resumo[dataStr].faturamento += v.valorTotal || 0;
            resumo[dataStr].custo += calcularCustoDaVenda(v);
            resumo[dataStr].lucro += calcularLucroVenda(v);
        });
        Object.keys(resumo).sort().forEach(d => {
            const info = resumo[d];
            const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
            const [ano, mes, dia] = d.split('-');
            dados.push([`${dia}/${mes}/${ano}`, info.total, info.faturamento.toLocaleString('pt-AO')+' Kz', info.custo.toLocaleString('pt-AO')+' Kz', info.lucro.toLocaleString('pt-AO')+' Kz', margem.toFixed(1)+'%']);
        });
    } else if (tipo === 'produtos') {
        head = [['ID', 'Produto', 'Qtd', 'Receita', 'Custo', 'Lucro', 'Margem']];
        const vendasPorProduto = {};
        todasVendas.forEach(venda => {
            if (venda.itens) {
                venda.itens.forEach(item => {
                    const nome = item.nome;
                    if (!vendasPorProduto[nome]) vendasPorProduto[nome] = { qtd: 0, receita: 0, custo: 0 };
                    vendasPorProduto[nome].qtd += item.quantidade || 1;
                    vendasPorProduto[nome].receita += (item.preco || 0) * (item.quantidade || 1);
                    const prod = catalogo.find(p => p.nome === nome);
                    if (prod) vendasPorProduto[nome].custo += extrairValorNumerico(prod.custo) * (item.quantidade || 1);
                });
            }
        });
        catalogo.forEach(prod => {
            const info = vendasPorProduto[prod.nome] || { qtd: 0, receita: 0, custo: 0 };
            const lucro = info.receita - info.custo;
            const margem = info.receita > 0 ? (lucro / info.receita) * 100 : 0;
            const idCurto = prod.id ? prod.id.substring(0, 8) : 'N/A';
            dados.push([idCurto, prod.nome, info.qtd, info.receita.toLocaleString('pt-AO')+' Kz', info.custo.toLocaleString('pt-AO')+' Kz', lucro.toLocaleString('pt-AO')+' Kz', margem.toFixed(1)+'%']);
        });
    } else if (tipo === 'pedidos') {
        head = [['Data', 'Cliente', 'Bairro', 'Subtotal', 'Frete', 'Total', 'Status']];
        const vendasOrdenadas = [...todasVendas].sort((a,b) => {
            const da = parseDataHora(a.dataHora);
            const db = parseDataHora(b.dataHora);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        vendasOrdenadas.forEach(v => {
            dados.push([
                v.dataHora,
                v.nomeCliente,
                v.bairro || 'N/A',
                (v.subtotal || (v.valorTotal - (v.frete||0))).toLocaleString('pt-AO') + ' Kz',
                (v.frete || 0).toLocaleString('pt-AO') + ' Kz',
                (v.valorTotal || 0).toLocaleString('pt-AO') + ' Kz',
                v.status || 'confirmado'
            ]);
        });
    } else if (tipo === 'contabilidade') {
        doc.text(`Receita Total: ${document.getElementById('contReceita')?.textContent || '0'}`, 14, 32);
        doc.text(`Custo Total: ${document.getElementById('contCusto')?.textContent || '0'}`, 14, 38);
        doc.text(`Lucro Líquido: ${document.getElementById('contLucro')?.textContent || '0'}`, 14, 44);
        doc.text(`Margem Líquida: ${document.getElementById('contMargem')?.textContent || '0'}`, 14, 50);
        startY = 55;
        head = [['Data', 'Cliente', 'Produtos', 'Receita', 'Custo', 'Lucro']];
        const lancamentos = [...todasVendas].sort((a,b) => {
            const da = parseDataHora(a.dataHora);
            const db = parseDataHora(b.dataHora);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        }).slice(0,30);
        lancamentos.forEach(v => {
            dados.push([v.dataHora, v.nomeCliente, v.produtosResumo || '', (v.valorTotal||0).toLocaleString('pt-AO')+' Kz', calcularCustoDaVenda(v).toLocaleString('pt-AO')+' Kz', calcularLucroVenda(v).toLocaleString('pt-AO')+' Kz']);
        });
    }

    doc.autoTable({
        startY: startY,
        head: head,
        body: dados,
        headStyles: { fillColor: [0, 90, 76], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 }
    });
    doc.save(`Relatorio_${tipo}.pdf`);
}

function exportarExcel(tipo) {
    if (typeof XLSX === 'undefined') {
        alert('Biblioteca XLSX não carregada.');
        return;
    }
    let dados = [];
    let headers = [];

    if (tipo === 'dashboard') {
        headers = ['Data', 'Pedidos', 'Faturamento', 'Custo', 'Lucro', 'Margem'];
        const resumo = {};
        todasVendas.forEach(v => {
            const data = parseDataHora(v.dataHora);
            if (!data) return;
            const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
            if (!resumo[dataStr]) resumo[dataStr] = { total: 0, faturamento: 0, custo: 0, lucro: 0 };
            resumo[dataStr].total++;
            resumo[dataStr].faturamento += v.valorTotal || 0;
            resumo[dataStr].custo += calcularCustoDaVenda(v);
            resumo[dataStr].lucro += calcularLucroVenda(v);
        });
        Object.keys(resumo).sort().forEach(d => {
            const info = resumo[d];
            const margem = info.faturamento > 0 ? (info.lucro / info.faturamento) * 100 : 0;
            const [ano, mes, dia] = d.split('-');
            dados.push([`${dia}/${mes}/${ano}`, info.total, info.faturamento, info.custo, info.lucro, margem.toFixed(1)+'%']);
        });
    } else if (tipo === 'pedidos') {
        headers = ['Data', 'Cliente', 'Bairro', 'Subtotal', 'Frete', 'Total', 'Status'];
        const vendasOrdenadas = [...todasVendas].sort((a,b) => {
            const da = parseDataHora(a.dataHora);
            const db = parseDataHora(b.dataHora);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        vendasOrdenadas.forEach(v => {
            dados.push([
                v.dataHora,
                v.nomeCliente,
                v.bairro || 'N/A',
                v.subtotal || (v.valorTotal - (v.frete||0)),
                v.frete || 0,
                v.valorTotal || 0,
                v.status || 'confirmado'
            ]);
        });
    } else if (tipo === 'produtos') {
        headers = ['ID', 'Produto', 'Qtd', 'Receita', 'Custo', 'Lucro', 'Margem'];
        const vendasPorProduto = {};
        todasVendas.forEach(venda => {
            if (venda.itens) {
                venda.itens.forEach(item => {
                    const nome = item.nome;
                    if (!vendasPorProduto[nome]) vendasPorProduto[nome] = { qtd: 0, receita: 0, custo: 0 };
                    vendasPorProduto[nome].qtd += item.quantidade || 1;
                    vendasPorProduto[nome].receita += (item.preco || 0) * (item.quantidade || 1);
                    const prod = catalogo.find(p => p.nome === nome);
                    if (prod) vendasPorProduto[nome].custo += extrairValorNumerico(prod.custo) * (item.quantidade || 1);
                });
            }
        });
        catalogo.forEach(prod => {
            const info = vendasPorProduto[prod.nome] || { qtd: 0, receita: 0, custo: 0 };
            const lucro = info.receita - info.custo;
            const margem = info.receita > 0 ? (lucro / info.receita) * 100 : 0;
            const idCurto = prod.id ? prod.id.substring(0, 8) : 'N/A';
            dados.push([idCurto, prod.nome, info.qtd, info.receita, info.custo, lucro, margem.toFixed(1)+'%']);
        });
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dados]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
    XLSX.writeFile(wb, `Relatorio_${tipo}.xlsx`);
}

window.atualizarStatus = async function(codigoRastreio, novoStatus) {
    if(!codigoRastreio) return alert('Este pedido não tem código de rastreio.');
    if(!confirm(`Marcar ${codigoRastreio} como "${novoStatus === 'enviado' ? 'Enviado' : 'Entregue'}"?`)) return;
    try {
        const atualizar = httpsCallable(functions, 'atualizarEstadoPedido');
        await atualizar({ codigoRastreio, status: novoStatus });
        alert('Status atualizado!');
        location.reload();
    } catch(e) { alert('Erro: ' + e.message); }
};

window.imprimirFatura = async function(codigoRastreio) {
    if (!codigoRastreio) return alert('Este pedido não tem código de rastreio.');
    try {
        const q = query(collection(db, 'vendas'), where('codigoRastreio', '==', codigoRastreio));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return alert('Pedido não encontrado.');
        const venda = snapshot.docs[0].data();
        
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Fatura ${codigoRastreio} - VORA 313</title>
<style>
  body { font-family: Arial, sans-serif; margin: 30px; }
  h1 { color: #005A4C; text-align: center; }
  h2 { color: #D4AF37; text-align: center; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #005A4C; color: white; }
  .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; }
  .dados { margin-top: 20px; }
  .dados p { margin: 5px 0; }
</style>
</head>
<body>
<h1>VORA 313</h1>
<h2>Contribuinte: 5000048151 | Tel: +244 933 677 628</h2>
<hr>
<p><strong>Fatura Nº:</strong> ${codigoRastreio}</p>
<p><strong>Data:</strong> ${venda.dataHora || ''}</p>
<div class="dados">
<p><strong>Cliente:</strong> ${venda.nomeCliente || ''}</p>
<p><strong>Telefone:</strong> ${venda.telefoneCliente || ''}</p>
<p><strong>NIF:</strong> ${venda.nifCliente || ''}</p>
<p><strong>Morada:</strong> ${venda.moradaCliente || ''} - ${venda.bairro || ''}</p>
</div>
<table>
<thead><tr><th>Descrição</th><th>Qtd</th><th>Preço Unit.</th><th>Subtotal</th></tr></thead>
<tbody>${(venda.itens||[]).map(item=>`<tr><td>${item.nome}</td><td>${item.quantidade}</td><td>${item.preco||0}</td><td>${(item.preco||0)*(item.quantidade||1)}</td></tr>`).join('') || venda.produtosResumo || ''}</tbody>
</table>
<div class="resumo" style="text-align:right; margin-top:15px;">
${venda.subtotal ? `<p><strong>Subtotal:</strong> ${venda.subtotal.toFixed(2)} Kz</p>` : ''}
${venda.valorDesconto ? `<p><strong>Desconto:</strong> -${venda.valorDesconto.toFixed(2)} Kz</p>` : ''}
${venda.frete ? `<p><strong>Frete (${venda.bairro}):</strong> ${venda.frete.toFixed(2)} Kz</p>` : ''}
<p class="total">Total a Pagar: ${(venda.valorTotal || 0).toFixed(2)} Kz</p>
</div>
<script>window.print();</script>
</body>
</html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    } catch(e) { alert('Erro: ' + e.message); }
};


function moedaAdmin(v) {
    return Number(v || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
}

function statusLabelVendedor(status) {
    const map = { aprovado: '✅ Aprovado', pendente: '⏳ Pendente', recusado: '❌ Recusado', suspenso: '⏸️ Suspenso' };
    return map[status] || status || '—';
}

function statusLabelProduto(status) {
    const map = { aprovado: '✅ Aprovado', aguardando_aprovacao: '⏳ Aguardando', recusado: '❌ Recusado' };
    return map[status] || status || '—';
}

async function carregarPainelVendedoresAdmin() {
    const tbodyV = document.getElementById('corpoTabelaVendedoresAdmin');
    const tbodyP = document.getElementById('corpoTabelaProdutosVendedores');
    const msg = document.getElementById('msgVendedoresAdmin');
    try {
        if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
        const [vs, ps, vvs] = await Promise.all([
            getDocs(collection(db, 'vendedores')),
            getDocs(collection(db, 'produtos')),
            getDocs(collection(db, 'vendas_vendedor'))
        ]);
        vendedoresAdmin = vs.docs.map(d => ({ id: d.id, ...d.data() }));
        produtosVendedorAdmin = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.vendedorId || p.vendedor_id);
        vendasVendedorAdmin = vvs.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarPainelVendedoresAdmin();
    } catch (e) {
        console.error('Erro ao carregar painel de vendedores:', e);
        if (msg) {
            msg.style.display = 'block';
            msg.style.background = '#fff3cd';
            msg.style.color = '#856404';
            msg.textContent = 'Não foi possível carregar vendedores/produtos: ' + (e.message || e);
        }
        if (tbodyV) tbodyV.innerHTML = '<tr><td colspan="8" style="padding:18px;text-align:center;">Sem dados. Verifique as políticas RLS do Supabase.</td></tr>';
        if (tbodyP) tbodyP.innerHTML = '<tr><td colspan="6" style="padding:18px;text-align:center;">Sem produtos de vendedores.</td></tr>';
    }
}

function renderizarPainelVendedoresAdmin() {
    const tbodyV = document.getElementById('corpoTabelaVendedoresAdmin');
    const tbodyP = document.getElementById('corpoTabelaProdutosVendedores');
    const faturamentoTotal = vendasVendedorAdmin.reduce((sum, v) => sum + Number(v.valorVenda ?? v.valorVendedor ?? v.valor_venda ?? v.valor_vendedor ?? 0), 0);
    setText('admTotalVendedores', vendedoresAdmin.length);
    setText('admVendedoresAprovados', vendedoresAdmin.filter(v => v.status === 'aprovado' && v.ativo !== false).length);
    setText('admVendedoresPendentes', vendedoresAdmin.filter(v => v.status === 'pendente').length);
    setText('admFaturamentoVendedores', moedaAdmin(faturamentoTotal));

    const stats = {};
    vendasVendedorAdmin.forEach(v => {
        const id = v.uidVendedor || v.uid_vendedor || v.vendedorId || v.vendedor_id;
        if (!id) return;
        if (!stats[id]) stats[id] = { pedidos: 0, faturamento: 0 };
        stats[id].pedidos++;
        stats[id].faturamento += Number(v.valorVenda ?? v.valorVendedor ?? v.valor_venda ?? v.valor_vendedor ?? 0);
    });
    const produtoCount = {};
    produtosVendedorAdmin.forEach(p => {
        const id = p.vendedorId || p.vendedor_id;
        if (id) produtoCount[id] = (produtoCount[id] || 0) + 1;
    });

    if (tbodyV) tbodyV.innerHTML = vendedoresAdmin.length ? vendedoresAdmin.map(v => {
        const st = stats[v.id] || { pedidos: 0, faturamento: 0 };
        const ativo = v.ativo !== false;
        let action = '';
        if (v.status === 'pendente') action = `<button class="btn-admin" data-admin-vendedor-action="aprovar" data-id="${escapeHTML(v.id)}">✅ Aprovar</button> <button class="btn-admin" style="background:#b42318" data-admin-vendedor-action="recusar" data-id="${escapeHTML(v.id)}">❌ Recusar</button>`;
        else if (v.status === 'aprovado' && ativo) action = `<button class="btn-admin" style="background:#b42318" data-admin-vendedor-action="suspender" data-id="${escapeHTML(v.id)}">⏸️ Suspender</button>`;
        else action = `<button class="btn-admin" style="background:#087f5b" data-admin-vendedor-action="reativar" data-id="${escapeHTML(v.id)}">▶️ Reativar</button>`;
        return `<tr><td style="padding:9px;"><strong>${escapeHTML(v.nome || 'Sem nome')}</strong><br><small>${escapeHTML(v.email || '')}</small></td><td style="padding:9px;">${escapeHTML(v.nomeLoja || v.nome_loja || '—')}</td><td style="padding:9px;">${statusLabelVendedor(v.status)}</td><td style="padding:9px;">${escapeHTML(v.plano || 'basico')}</td><td style="padding:9px;text-align:center;">${produtoCount[v.id] || 0}</td><td style="padding:9px;text-align:center;">${st.pedidos}</td><td style="padding:9px;">${moedaAdmin(st.faturamento)}</td><td style="padding:9px;white-space:nowrap;">${action}</td></tr>`;
    }).join('') : '<tr><td colspan="8" style="padding:18px;text-align:center;">Nenhum vendedor cadastrado.</td></tr>';

    if (tbodyP) tbodyP.innerHTML = produtosVendedorAdmin.length ? produtosVendedorAdmin.map(p => {
        const vid = p.vendedorId || p.vendedor_id;
        const v = vendedoresAdmin.find(x => x.id === vid);
        const status = p.statusAprovacao || p.status_aprovacao || 'aguardando_aprovacao';
        let action = status === 'aguardando_aprovacao' ? `<button class="btn-admin" style="background:#087f5b" data-admin-produto-action="aprovar" data-id="${escapeHTML(p.id)}">✅ Aprovar</button> <button class="btn-admin" style="background:#b42318" data-admin-produto-action="recusar" data-id="${escapeHTML(p.id)}">❌ Recusar</button>` : status === 'aprovado' ? `<button class="btn-admin" style="background:#b42318" data-admin-produto-action="recusar" data-id="${escapeHTML(p.id)}">❌ Recusar</button>` : `<button class="btn-admin" style="background:#087f5b" data-admin-produto-action="aprovar" data-id="${escapeHTML(p.id)}">✅ Aprovar</button>`;
        return `<tr><td style="padding:9px;"><strong>${escapeHTML(p.nome || 'Sem nome')}</strong><br><small>${escapeHTML(p.id)}</small></td><td style="padding:9px;">${escapeHTML(v?.nomeLoja || v?.nome_loja || p.vendedorNome || p.vendedor_nome || '—')}</td><td style="padding:9px;">${escapeHTML(p.preco || '0')} Kz</td><td style="padding:9px;text-align:center;">${Number(p.estoque || 0)}</td><td style="padding:9px;">${statusLabelProduto(status)}</td><td style="padding:9px;white-space:nowrap;">${action}</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:18px;text-align:center;">Nenhum produto de vendedor.</td></tr>';
}

async function chamarAcaoAdmin(nome, data) {
    const fn = httpsCallable(functions, nome);
    return fn(data);
}

async function acaoVendedorAdmin(uid, acao) {
    if (!uid || !acao) return;
    const labels = { aprovar: 'aprovar', recusar: 'recusar', suspender: 'suspender', reativar: 'reativar' };
    if (!confirm(`Confirmar ${labels[acao] || acao} este vendedor?`)) return;
    try {
        await chamarAcaoAdmin('gerirVendedor', { uid, acao });
        await carregarPainelVendedoresAdmin();
    } catch (e) {
        alert('Não foi possível atualizar o vendedor: ' + (e.message || e));
    }
}

async function acaoProdutoVendedorAdmin(produtoId, acao) {
    if (!produtoId || !acao) return;
    if (!confirm(`Confirmar ${acao} este produto?`)) return;
    try {
        await chamarAcaoAdmin('aprovarProdutoVendedor', { produtoId, acao });
        await carregarPainelVendedoresAdmin();
    } catch (e) {
        alert('Não foi possível atualizar o produto: ' + (e.message || e));
    }
}
