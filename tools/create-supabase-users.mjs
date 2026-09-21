import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const dir = path.resolve(process.env.MIGRATION_OUTPUT || './migration-output');
const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
const users = JSON.parse(await fs.readFile(path.join(dir, 'auth-users.json'), 'utf8'));
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' };
const rows=[];
for (const u of users) {
  if (!u.email) { console.warn(`Ignorado sem email: ${u.uid}`); continue; }
  const r = await fetch(`${url}/auth/v1/admin/users`, { method:'POST', headers, body:JSON.stringify({ email:u.email, email_confirm:u.emailVerified || true, password:crypto.randomBytes(32).toString('base64url'), user_metadata:{ display_name:u.displayName || null, firebase_uid:u.uid }, app_metadata:{ firebase_uid:u.uid, migrated_from:'firebase' }, ban_duration:u.disabled?'876000h':'none' }) });
  const body = await r.json().catch(()=>({}));
  if (!r.ok && r.status !== 422) throw new Error(`${u.email}: ${r.status} ${JSON.stringify(body)}`);
  const supa = body.id || null;
  if (supa) rows.push({firebase_uid:u.uid,supabase_uid:supa,email:u.email,role:u.customClaims?.admin===true?'admin':(u.customClaims?.seller===true?'vendedor':'cliente')});
  console.log(`${u.email}: ${supa || 'já existe / verificar manualmente'}`);
}
await fs.writeFile(path.join(dir,'firebase_uid_map.json'), JSON.stringify(rows,null,2));
console.log('Mapa escrito. Os utilizadores devem redefinir a password antes do corte final.');
