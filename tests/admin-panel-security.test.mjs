import fs from 'node:fs';
import assert from 'node:assert/strict';

const api = fs.readFileSync('supabase/functions/api/index.ts', 'utf8');
const mig = fs.readFileSync('supabase/migrations/035_admin_produtos_operacao_segura.sql', 'utf8');
const oldDelete = fs.readFileSync('supabase/migrations/028_eliminar_produtos_vendedor_admin.sql', 'utf8');
const vendas = fs.readFileSync('js/admin-vendas.js', 'utf8');
const vendedores = fs.readFileSync('js/admin-vendedores.js', 'utf8');

assert.match(api, /requireAdmin\(req\)/);
assert.match(api, /case 'administrarProdutoVendedor'/);
assert.match(mig, /public\.is_admin\(\)/);
assert.match(mig, /grant execute on function public\.administrar_produto_vendedor/);
assert.match(oldDelete, /venda_itens/);
assert.match(oldDelete, /não pode ser apagado/);
assert.doesNotMatch(vendas, /atualizarVendedorComRls/);
assert.doesNotMatch(vendedores, /\.from\(['"](?:vendedores|produtos)['"]\)\.(?:update|delete|insert|upsert)\(/);
assert.match(vendas, /filtroProdutosAdmin/);
assert.match(vendas, /filtroStatusProdutosAdmin/);
assert.match(vendas, /administrarProdutoVendedor/);
console.log('OK — invariantes do painel administrativo.');
