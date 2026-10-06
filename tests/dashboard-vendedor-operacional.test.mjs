import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/034_dashboard_operacional_vendedor.sql', 'utf8');
const js = fs.readFileSync('js/vendedor.js', 'utf8');
const api = fs.readFileSync('supabase/functions/api/index.ts', 'utf8');
const html = fs.readFileSync('vendedor.html', 'utf8');

const checks = [
  ['RPC exige sessão', sql.includes('auth.uid()')],
  ['RPC não aceita vendedor arbitrário', !/p_vendedor|p_uid/.test(sql)],
  ['RPC filtra produtos pelo auth.uid', sql.includes('where vendedor_id = v_uid')],
  ['RPC filtra pedidos pelo vendedor', sql.includes('where vv.uid_vendedor = v_uid')],
  ['Tracking continua protegido', sql.includes('produto_visualizacoes_unicas')],
  ['Edge Function expõe obterDashboardVendedor', api.includes("case 'obterDashboardVendedor'")],
  ['Frontend usa uma chamada de dashboard', js.includes("call('obterDashboardVendedor')()")],
  ['Há estado de loading', js.includes("estado: 'loading'")],
  ['Há estado de erro', js.includes("estado: 'error'")],
  ['Há estado vazio para rankings', js.includes('Ainda não há vendas pagas suficientes') && js.includes('Não há visualizações registadas')],
  ['Atalho adicionar produto', html.includes('data-go-novo-produto')],
  ['Atalho ver avaliações', html.includes('btnAtalhoAvaliacoes')],
];

for (const [nome, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${nome}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
