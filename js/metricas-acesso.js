// Métricas públicas VORA 313: nenhum e-mail, telefone ou IP é enviado.
// O identificador do navegador é aleatório e a API guarda somente o seu hash.
import { functions, supabase } from './config.js';

const CHAVE_VISITANTE = 'vora313_visitante_anonimo_v1';
const PAGINAS_VALIDAS = new Set(['inicio', 'categoria', 'loja', 'produto']);

function criarIdentificadorAleatorio() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const texto = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${texto.slice(0, 8)}-${texto.slice(8, 12)}-${texto.slice(12, 16)}-${texto.slice(16, 20)}-${texto.slice(20)}`;
}

export function obterIdentificadorVisitante() {
  try {
    const atual = String(localStorage.getItem(CHAVE_VISITANTE) || '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(atual)) return atual;
    const novo = criarIdentificadorAleatorio();
    localStorage.setItem(CHAVE_VISITANTE, novo);
    return novo;
  } catch (_) {
    return criarIdentificadorAleatorio();
  }
}

export async function registarAcessoPublico(pagina, produtoId = '') {
  if (!PAGINAS_VALIDAS.has(pagina)) return null;
  try {
    const { data, error } = await supabase.functions.invoke(functions.name || 'api', {
      body: {
        name: 'registarAcessoPublico',
        data: { pagina, produtoId: String(produtoId || ''), visitanteId: obterIdentificadorVisitante() }
      }
    });
    if (error || data?.error) throw error || new Error(data.error.message || 'Métrica indisponível.');
    return data?.data || data || null;
  } catch (erro) {
    // A medição jamais bloqueia compras, catálogo ou a navegação do cliente.
    console.debug('[VORA 313] Métrica de acesso indisponível:', erro?.message || erro);
    return null;
  }
}

export function registarPaginaPublica(pagina) {
  void registarAcessoPublico(pagina);
}
