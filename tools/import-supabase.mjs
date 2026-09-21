import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const input = path.resolve(process.env.MIGRATION_OUTPUT || './migration-output');
const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key.includes('COLOQUE_')) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env local.');

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
const map = JSON.parse(await fs.readFile(path.join(input, 'firebase_uid_map.json'), 'utf8'));

async function post(pathname, body, method = 'POST') {
  const r = await fetch(`${url}${pathname}`, { method, headers, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} -> ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const tables = [
  'profiles', 'clientes', 'vendedores', 'produtos', 'cupons', 'vendas', 'venda_itens',
  'comissoes', 'movimentos_vendedores', 'vendas_vendedor', 'destaques_solicitados',
  'levantamentos', 'avaliacoes', 'rastreios_publicos', 'fidelidade_movimentos'
];

for (const table of tables) {
  const file = path.join(input, `${table}.supabase.json`);
  try { await fs.access(file); } catch { continue; }
  const rows = JSON.parse(await fs.readFile(file, 'utf8'));
  for (let i = 0; i < rows.length; i += 500) {
    await post(`/rest/v1/${table}`, rows.slice(i, i + 500));
    console.log(`${table}: ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
}

for (const item of map) {
  await post('/rest/v1/firebase_uid_map', item);
}
console.log('Importação concluída.');
