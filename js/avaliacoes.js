import { auth, db, functions } from './config.js';
import { collection, getDocs, query, where, httpsCallable } from './supabase-compat.js';

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
  if (!auth.currentUser || auth.currentUser.is_anonymous) {
    throw new Error('Inicie sessão com a sua conta para avaliar uma compra entregue.');
  }
  // A avaliação passa pelo backend: ele confirma se o cliente recebeu este
  // produto antes de aceitar a nota. A tabela não fica gravável pelo browser.
  const adicionar = httpsCallable(functions, 'adicionarAvaliacao');
  await adicionar({ produtoId: String(prodId), nota: valor });
}
