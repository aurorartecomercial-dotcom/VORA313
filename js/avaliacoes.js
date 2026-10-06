import { auth, supabase, functions } from './config.js';
import { httpsCallable } from './supabase-compat.js';

export async function obterAvaliacao(prodId) {
  const { data, error } = await supabase.from('produto_avaliacoes_resumo')
    .select('produto_id,media,total,estrelas_1,estrelas_2,estrelas_3,estrelas_4,estrelas_5')
    .eq('produto_id', String(prodId)).maybeSingle();
  if (error) throw error;
  return data || { media: 0, total: 0, estrelas_1: 0, estrelas_2: 0, estrelas_3: 0, estrelas_4: 0, estrelas_5: 0 };
}

export async function obterAvaliacoesRecentes(prodId, limite = 6) {
  const { data, error } = await supabase.from('produto_avaliacoes_recentes')
    .select('produto_id,nota,comentario,data,verificada')
    .eq('produto_id', String(prodId)).order('data', { ascending: false }).limit(limite);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function adicionarAvaliacao(prodId, nota, comentario = '', opcoes = {}) {
  const valor = Number(nota);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) throw new Error('Nota inválida.');
  if (!auth.currentUser || auth.currentUser.is_anonymous) {
    throw new Error('Inicie sessão com a sua conta para avaliar uma compra entregue.');
  }
  const adicionar = httpsCallable(functions, 'adicionarAvaliacao');
  const tipo = opcoes.tipo || 'produto';
  const resposta = await adicionar({
    tipo,
    produtoId: tipo === 'produto' ? String(prodId) : undefined,
    itemId: tipo === 'produto' ? String(opcoes.itemId || '') : undefined,
    pedidoId: tipo === 'vendedor' ? String(opcoes.pedidoId || '') : undefined,
    vendedorId: tipo === 'vendedor' ? String(opcoes.vendedorId || '') : undefined,
    nota: valor,
    comentario: String(comentario || '').trim().slice(0, 1000)
  });
  return resposta?.data || resposta;
}

export async function consultarElegibilidadeAvaliacao(prodId, opcoes = {}) {
  if (!auth.currentUser || auth.currentUser.is_anonymous) {
    return { elegivel: false, podeAvaliarProduto: false, podeAvaliarVendedor: false, motivo: 'Inicie sessão com a sua conta para avaliar uma compra entregue.' };
  }
  const consultar = httpsCallable(functions, 'consultarElegibilidadeAvaliacao');
  const resposta = await consultar({ produtoId: String(prodId), itemId: opcoes.itemId ? String(opcoes.itemId) : undefined });
  return resposta?.data || { elegivel: false, motivo: 'A avaliação fica disponível após a entrega.' };
}

export async function obterResumoVendedor(vendedorId) {
  const { data, error } = await supabase.from('vendedor_avaliacoes_resumo')
    .select('vendedor_id,media,total,estrelas_1,estrelas_2,estrelas_3,estrelas_4,estrelas_5')
    .eq('vendedor_id', String(vendedorId)).maybeSingle();
  if (error) throw error;
  return data || { media: 0, total: 0, estrelas_1: 0, estrelas_2: 0, estrelas_3: 0, estrelas_4: 0, estrelas_5: 0 };
}

export async function obterAvaliacoesVendedor(vendedorId, limite = 6) {
  const { data, error } = await supabase.from('vendedor_avaliacoes_recentes')
    .select('vendedor_id,nota,comentario,data,verificada')
    .eq('vendedor_id', String(vendedorId)).order('data', { ascending: false }).limit(limite);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
