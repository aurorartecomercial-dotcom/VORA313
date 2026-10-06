import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const api = read('supabase/functions/api/index.ts');
const compat = read('js/supabase-compat.js');
const config = read('js/supabase-config.js');
const migration = read('supabase/migrations/036_hardening_auditoria_performance.sql');
const vendedor = read('js/vendedor.js');

if (!/eventos_seguranca_categoria_check/.test(migration) || !/'avaliacao'/.test(migration)) {
  throw new Error('Migration 036 não fecha a categoria de auditoria de avaliações.');
}
if (!/grant execute on function public\.registrar_evento_seguranca/.test(migration)
    || !/to service_role/.test(migration)) {
  throw new Error('A função de auditoria não ficou restrita ao service_role.');
}
if (!/from\('videos_vendedores'\)\.select\('id,titulo,descricao,video_url/.test(vendedor)
    || !/\.limit\(20\)/.test(vendedor)) {
  throw new Error('Consulta de vídeos do vendedor continua ampla.');
}
if (!/auth\.getUser\(token\)/.test(api) || !/function requireAdmin/.test(api) || !/function requireSeller/.test(api)) {
  throw new Error('A Edge Function perdeu as verificações centrais de autenticação/autorização.');
}
if (!/preco_valor/.test(api) || !/criar_pedido_atomico/.test(api)) {
  throw new Error('A validação server-side do checkout não foi encontrada.');
}
if (/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"`][^'"`]+['"`]/.test(config)) {
  throw new Error('Chave service_role encontrada no frontend.');
}
if (!/supabase\.auth\.signInWithPassword/.test(compat) || !/getSession\(\)/.test(compat)) {
  throw new Error('Camada de compatibilidade perdeu integração de autenticação.');
}
console.log('OK: hardening 036, autorização central, checkout server-side e redução de query verificados.');
