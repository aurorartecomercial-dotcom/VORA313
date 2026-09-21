import { auth, db } from './config.js';
import { signInAnonymously } from './supabase-compat.js';
import { collection, getDocs, query, setDoc, doc, where } from './supabase-compat.js';

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
  const usuario = auth.currentUser || (await signInAnonymously(auth)).user;
  // Um documento estável impede avaliações ilimitadas do mesmo utilizador.
  const id = `${usuario.uid}_${String(prodId)}`;
  await setDoc(doc(db, 'avaliacoes', id), {
    produtoId: String(prodId),
    uidCliente: usuario.uid,
    nota: valor,
    data: new Date().toISOString()
  });
}
