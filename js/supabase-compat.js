// Camada de compatibilidade VORA 313.
// Mantém a API que o frontend antigo utilizava, mas executa tudo em Supabase.
import { supabase, auth, db, storage, functions } from './config.js';

const TABLES = Object.freeze({
  vendasVendedor: 'vendas_vendedor',
  destaquesSolicitados: 'destaques_solicitados',
  movimentosVendedores: 'movimentos_vendedores',
  rastreiosPublicos: 'rastreios_publicos',
  vendaItens: 'venda_itens',
  produtoAvaliacoesResumo: 'produto_avaliacoes_resumo',
  firebaseLegacyDocuments: 'firebase_legacy_documents'
});

const tableName = (name) => TABLES[name] || name;
const camelToSnake = (key) => key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const snakeToCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function encodeWrite(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(encodeWrite);
  if (value && typeof value === 'object' && value.__arrayUnion) return value.__arrayUnion.map(encodeWrite);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k,v] of Object.entries(value)) out[camelToSnake(k)] = encodeWrite(v);
    return out;
  }
  return value;
}

function decodeRead(value) {
  if (Array.isArray(value)) return value.map(decodeRead);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k,v] of Object.entries(value)) out[snakeToCamel(k)] = decodeRead(v);
    return out;
  }
  return value;
}

export function collection(_db, name) { return { __kind: 'collection', table: tableName(name) }; }
export function doc(_db, collectionName, id) { return { __kind: 'doc', table: tableName(collectionName), id: String(id) }; }
export function where(field, op, value) { return { __kind: 'where', field: camelToSnake(field), op, value }; }
export function limit(value) { return { __kind: 'limit', value: Number(value) }; }
export function query(base, ...constraints) {
  return { ...base, __kind: 'query', filters: constraints.filter(x => x?.__kind === 'where'), rowLimit: constraints.find(x => x?.__kind === 'limit')?.value || null };
}
export function arrayUnion(...values) { return { __arrayUnion: values }; }

async function execute(ref) {
  const table = ref.table;
  let q = supabase.from(table).select('*');
  for (const f of (ref.filters || [])) {
    switch (f.op) {
      case '==': q = q.eq(f.field, encodeWrite(f.value)); break;
      case '!=': q = q.neq(f.field, encodeWrite(f.value)); break;
      case '<': q = q.lt(f.field, encodeWrite(f.value)); break;
      case '<=': q = q.lte(f.field, encodeWrite(f.value)); break;
      case '>': q = q.gt(f.field, encodeWrite(f.value)); break;
      case '>=': q = q.gte(f.field, encodeWrite(f.value)); break;
      case 'array-contains': q = q.contains(f.field, [encodeWrite(f.value)]); break;
      default: throw new Error(`Operador não suportado: ${f.op}`);
    }
  }
  if (ref.rowLimit) q = q.limit(ref.rowLimit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).map(row => ({ id: row.id, ...decodeRead(row) }));
  return { rows };
}

export async function getDocs(ref) {
  const result = await execute(ref);
  const docs = result.rows.map(row => ({ id: row.id, data: () => { const { id, ...rest } = row; return rest; }, exists: () => true }));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => docs.forEach(fn) };
}

export async function getDoc(ref) {
  const { data, error } = await supabase.from(ref.table).select('*').eq('id', ref.id).maybeSingle();
  if (error) throw error;
  if (!data) return { id: ref.id, exists: () => false, data: () => undefined };
  const decoded = decodeRead(data);
  return { id: ref.id, exists: () => true, data: () => { const { id, ...rest } = decoded; return rest; } };
}

export async function setDoc(ref, value, options = {}) {
  const payload = encodeWrite(value);
  if (options.merge) {
    const { error } = await supabase.from(ref.table).upsert({ id: ref.id, ...payload }, { onConflict: 'id' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from(ref.table).upsert({ id: ref.id, ...payload }, { onConflict: 'id' });
    if (error) throw error;
  }
}

export async function updateDoc(ref, value) {
  const payload = encodeWrite(value);
  // Compatibilidade com FieldValue.increment e arrayUnion dentro de objetos.
  const { data: current, error: readError } = await supabase.from(ref.table).select('*').eq('id', ref.id).maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error('Documento não encontrado.');
  const decoded = decodeRead(current);
  const merged = { ...decoded };
  for (const [k,v] of Object.entries(value)) {
    if (v && typeof v === 'object' && v.__increment !== undefined) merged[k] = Number(merged[k] || 0) + Number(v.__increment);
    else if (v && typeof v === 'object' && v.__arrayUnion) merged[k] = [...(Array.isArray(merged[k]) ? merged[k] : []), ...v.__arrayUnion];
    else merged[k] = v;
  }
  delete merged.id;
  const { error } = await supabase.from(ref.table).update(encodeWrite(merged)).eq('id', ref.id);
  if (error) throw error;
}

export async function deleteDoc(ref) {
  const { error } = await supabase.from(ref.table).delete().eq('id', ref.id);
  if (error) throw error;
}

export const increment = (value) => ({ __increment: Number(value) });

export function onSnapshot(ref, callback) {
  let stopped = false;
  const run = async () => { if (stopped) return; try { callback(await getDocs(ref)); } catch (e) { console.error(e); } };
  run();
  const channel = supabase.channel(`vora-${ref.table}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: ref.table }, run).subscribe();
  return () => { stopped = true; supabase.removeChannel(channel); };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw normalizeAuthError(error);
  auth.currentUser = data.user;
  return { user: data.user, session: data.session };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw normalizeAuthError(error);
  if (!data.user) throw new Error('Não foi possível criar a conta.');
  // Com confirmação de email ativa o Supabase não devolve sessão ainda; isso é
  // sucesso, não erro. A interface mostra a orientação de confirmação.
  if (data.session) auth.currentUser = data.user;
  return { user: data.user, session: data.session };
}

export async function signInAnonymously(_auth) {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw normalizeAuthError(error);
  auth.currentUser = data.user;
  return { user: data.user, session: data.session };
}

export async function signOut(_auth) {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  auth.currentUser = null;
}

export function onAuthStateChanged(_auth, callback) {
  auth._listeners.add(callback);
  if (auth._ready) queueMicrotask(() => callback(auth.currentUser));
  return () => auth._listeners.delete(callback);
}

export async function updateProfile(_user, updates) {
  const { data, error } = await supabase.auth.updateUser({ data: { full_name: updates.displayName || updates.fullName || updates.nome || undefined } });
  if (error) throw error;
  auth.currentUser = data.user;
  if (data.user) await supabase.from('profiles').update({ nome: updates.displayName || updates.fullName || updates.nome || null }).eq('id', data.user.id);
}

export async function getIdToken(user, _forceRefresh = false) {
  const { data } = await supabase.auth.getSession();
  if (!data.session || !user) return null;
  return data.session.access_token;
}

export async function getIdTokenResult(user, _forceRefresh = false) {
  if (!user) return { claims: {} };
  const { data, error } = await supabase.from('profiles').select('role,ativo').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const seller = (await supabase.from('vendedores').select('status,ativo').eq('id', user.id).maybeSingle()).data;
  return { claims: { admin: data?.role === 'admin' && data?.ativo !== false, seller: seller?.status === 'aprovado' && seller?.ativo !== false } };
}

export async function sendPasswordResetEmail(_auth, email, redirectTo = `${location.origin}/perfil.html`) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw normalizeAuthError(error);
}

export async function updatePassword(_auth, password) {
  if (!password || String(password).length < 6) {
    throw new Error('A palavra-passe deve ter pelo menos 6 caracteres.');
  }
  const { data, error } = await supabase.auth.updateUser({ password: String(password) });
  if (error) throw normalizeAuthError(error);
  auth.currentUser = data.user || auth.currentUser;
  return { user: auth.currentUser };
}

export function ref(_storage, path) { return { path: String(path) }; }
export async function uploadBytes(storageRef, file, options = {}) {
  const { error } = await supabase.storage.from(storage.bucket).upload(storageRef.path, file, { contentType: options.contentType || file.type, upsert: true });
  if (error) throw error;
  return { ref: storageRef };
}
export function getDownloadURL(storageRef) {
  const { data } = supabase.storage.from(storage.bucket).getPublicUrl(storageRef.path);
  return Promise.resolve(data.publicUrl);
}

export function httpsCallable(_functions, name) {
  return async (data = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      const e = new Error('É necessário iniciar sessão antes de executar esta operação.');
      e.code = 'unauthenticated';
      throw e;
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const { data: result, error } = await supabase.functions.invoke(functions.name || 'api', { body: { name, data }, headers });
    if (result?.error) {
      const e = new Error(result.error.message || 'Operação recusada.');
      e.code = result.error.code || 'function_error';
      throw e;
    }
    if (error) {
      const e = new Error(error.message || `Falha ao executar ${name}`);
      e.code = error.code || 'function_error';
      throw e;
    }
    return { data: result?.data ?? result };
  };
}

function normalizeAuthError(error) {
  const e = new Error(error?.message || 'Erro de autenticação.');
  const map = { 'Invalid login credentials': 'Credenciais inválidas.', 'User already registered': 'auth/email-already-in-use' };
  e.code = map[error?.message] || error?.code || 'auth/error';
  return e;
}
