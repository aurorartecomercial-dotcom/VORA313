import { db, CONFIG } from './config.js';
import { doc, getDoc } from './supabase-compat.js';

let map;
let marcador;
let linhaRota;

const ESTADOS = {
  aguardando_pagamento: { progresso: 10, texto: '⏳ Aguardando confirmação do pagamento' },
  pago: { progresso: 30, texto: '✅ Pagamento confirmado' },
  em_preparacao: { progresso: 50, texto: '📦 Pedido em preparação' },
  enviado: { progresso: 75, texto: '🚚 Pedido saiu para entrega' },
  entregue: { progresso: 100, texto: '📦 Pedido entregue com sucesso!' },
  cancelado: { progresso: 0, texto: '❌ Pedido cancelado' }
};

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('btnRastrear');
  const input = document.getElementById('inputRastreio');
  button?.addEventListener('click', () => buscarPedido(input.value.trim().toUpperCase()));
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') buscarPedido(input.value.trim().toUpperCase());
  });
});

async function buscarPedido(codigo) {
  const erro = document.getElementById('erroRastreio');
  const resultado = document.getElementById('resultadoRastreio');
  const mapa = document.getElementById('mapaRastreio');
  const button = document.getElementById('btnRastrear');
  erro.style.display = 'none';
  resultado.style.display = 'none';
  mapa.style.display = 'none';
  const prefixo = String(CONFIG.RASTREIO_PREFIXO || 'VORA').replace(/[^A-Z0-9]/g, '');
  const regexRastreio = new RegExp(`^${prefixo}-[A-F0-9]{20}$`);
  if (!regexRastreio.test(codigo)) {
    erro.textContent = '❌ Código de rastreio inválido.';
    erro.style.display = 'block';
    return;
  }

  button.disabled = true;
  button.textContent = '⏳ Buscando…';
  try {
    // Consulta um documento público mínimo, não a venda que contém dados pessoais.
    const snapshot = await getDoc(doc(db, 'rastreiosPublicos', codigo));
    if (!snapshot.exists()) {
      erro.textContent = '❌ Pedido não encontrado. Verifique o código.';
      erro.style.display = 'block';
      return;
    }
    const rastreio = snapshot.data();
    const estado = ESTADOS[rastreio.status] || ESTADOS.aguardando_pagamento;
    resultado.style.display = 'block';
    mapa.style.display = 'block';
    document.getElementById('rastreioNome').textContent = `Pedido ${codigo}`;
    document.getElementById('rastreioData').textContent = 'Atualização disponível após confirmação do pagamento.';
    document.getElementById('rastreioProdutos').textContent = 'Os detalhes do pedido são privados e estão disponíveis na sua conta.';
    document.getElementById('barraProgresso').style.width = `${estado.progresso}%`;
    document.getElementById('statusAtualTexto').textContent = estado.texto;
    atualizarPontos(rastreio.status);
    atualizarMapa(rastreio.status, mapa);
  } catch (error) {
    console.error('Erro ao rastrear pedido:', error);
    erro.textContent = 'Erro de conexão. Tente novamente.';
    erro.style.display = 'block';
  } finally {
    button.disabled = false;
    button.textContent = '🔍 Rastrear';
  }
}

function atualizarPontos(status) {
  document.querySelectorAll('.status-points .point').forEach((ponto) => ponto.classList.remove('active'));
  const etapas = ['pago', 'em_preparacao', 'enviado', 'entregue'];
  if (etapas.includes(status)) document.getElementById('ponto-confirmado')?.classList.add('active');
  if (['enviado', 'entregue'].includes(status)) document.getElementById('ponto-enviado')?.classList.add('active');
  if (status === 'entregue') document.getElementById('ponto-entregue')?.classList.add('active');
}

function atualizarMapa(status, mapaDiv) {
  if (typeof L === 'undefined') {
    mapaDiv.style.display = 'none';
    return;
  }
  if (!map) {
    map = L.map('mapaRastreio').setView([-8.8383, 13.2344], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
  }
  if (marcador) map.removeLayer(marcador);
  if (linhaRota) map.removeLayer(linhaRota);
  const origem = [-8.8383, 13.2344];
  const destino = status === 'entregue' ? [-8.8964, 13.2902] : [-8.9142, 13.1832];
  marcador = L.marker(destino).addTo(map).bindPopup(ESTADOS[status]?.texto || 'Atualização do pedido');
  linhaRota = L.polyline([origem, destino], { color: '#D4AF37', weight: 4, dashArray: '8 8' }).addTo(map);
  map.setView(destino, 10);
  setTimeout(() => map.invalidateSize(), 200);
}
