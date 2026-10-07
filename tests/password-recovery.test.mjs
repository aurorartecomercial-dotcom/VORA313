import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const compat = read('js/supabase-compat.js');
const vendedor = read('js/vendedor.js');
const deploy = read('DEPLOY.md');

if (!/supabase\.auth\.resetPasswordForEmail\(email, \{ redirectTo \}\)/.test(compat)) {
  throw new Error('A recuperação deixou de usar a API de recuperação do Supabase.');
}

for (const codigo of ['over_email_send_rate_limit', 'email_address_not_authorized', 'error sending recovery email']) {
  if (!compat.includes(codigo)) throw new Error(`A causa ${codigo} não recebe uma mensagem útil.`);
}

if (!/new URL\('vendedor\.html', window\.location\.href\)/.test(vendedor)
    || !/retorno\.search = ''/.test(vendedor)
    || !/retorno\.hash = ''/.test(vendedor)) {
  throw new Error('A URL de retorno da recuperação pode reutilizar parâmetros inválidos.');
}

if (!/Authentication → Emails → SMTP Settings/.test(deploy)
    || !/email_address_not_authorized/.test(deploy)
    || !/over_email_send_rate_limit/.test(deploy)) {
  throw new Error('As instruções de diagnóstico de recuperação estão incompletas.');
}

console.log('OK: recuperação aponta para vendedor.html e identifica falhas de SMTP, autorização e limite.');
