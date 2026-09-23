import { auth, db, functions } from './config.js';
import { collection, getDocs, query, where } from './supabase-compat.js';
import { httpsCallable } from './supabase-compat.js';

export async function obterAvaliacao(prodId) {
  const q = query(collection(db, 'avaliacoes'), where('produtoId', '==', String(prodId)));
  const snapshot = await getDocs(q);
  let soma = 0;
  let total = 0;
  snapshot.forEach((avaliacao) => {
    const nota = Number(avaliacao.data().nota);
    if (Number.isFinite(nota) && nota >= 1 && nota <= 5) {
      soma += nota;
      total += 1;
    }
  });
  return { media: total ? soma / total : 0, total };
}

export async function adicionarAvaliacao(prodId, nota) {
  const valor = Number(nota);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) throw new Error('Nota inválida.');
  const usuario = auth.currentUser;
  if (!usuario || usuario.is_anonymous) {
    throw new Error('Entre na sua conta para avaliar um produto.');
  }
  const enviar = httpsCallable(functions, 'adicionarAvaliacao');
  await enviar({ produtoId: String(prodId), nota: valor });
}
