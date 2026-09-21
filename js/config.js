// VORA 313 — configuração central Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIG } from './supabase-config.js';

if (!SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('SEU-PROJETO')) {
  console.warn('[VORA 313] Configure js/supabase-config.js com a URL do projeto Supabase.');
}

export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const auth = { currentUser: null, _listeners: new Set(), _ready: false };
export const db = { __supabase: supabase };
export const storage = { __supabase: supabase, bucket: SUPABASE_CONFIG.storageBucket || 'vora-public' };
export const functions = { __supabase: supabase, name: SUPABASE_CONFIG.functionsName || 'api' };

export const CONFIG = {
  CACHE_KEY: 'vora313_catalogo_cache_v2',
  CACHE_TTL: 30 * 60 * 1000,
  NUMERO_WHATSAPP: '244933677628',
  MARCA: 'VORA 313',
  RASTREIO_PREFIXO: 'VORA',
  FUNCTIONS_REGION: 'supabase'
};

supabase.auth.getSession().then(({ data }) => {
  auth.currentUser = data.session?.user || null;
  auth._ready = true;
  for (const fn of auth._listeners) fn(auth.currentUser);
}).catch((e) => console.error('[VORA 313] Falha ao recuperar sessão:', e));

supabase.auth.onAuthStateChange((_event, session) => {
  auth.currentUser = session?.user || null;
  auth._ready = true;
  for (const fn of auth._listeners) fn(auth.currentUser);
});
