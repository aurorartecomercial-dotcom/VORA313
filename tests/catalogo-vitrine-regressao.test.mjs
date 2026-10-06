import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalogo = fs.readFileSync('js/catalogo.js', 'utf8');
const loja = fs.readFileSync('js/loja-publica.js', 'utf8');
const vendedor = fs.readFileSync('js/vendedor.js', 'utf8');
const api = fs.readFileSync('supabase/functions/api/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/037_recuperacao_catalogo_e_vitrines.sql', 'utf8');
const migrationPublicacao = fs.readFileSync('supabase/migrations/038_reparar_publicacao_produtos_admin.sql', 'utf8');
const admin = fs.readFileSync('js/admin.js', 'utf8');

assert.match(catalogo, /async function buscarCatalogoDireto/);
assert.match(catalogo, /Pesquisa avançada indisponível; a usar catálogo compatível/);
assert.match(catalogo, /\.eq\('ativo', true\)[\s\S]*\.eq\('vendedor_ativo', true\)[\s\S]*\.eq\('status_aprovacao', 'aprovado'\)/);

const renderizadores = loja.match(/^function renderizarProdutos\(/gm) || [];
assert.equal(renderizadores.length, 1, 'A vitrine deve declarar renderizarProdutos uma única vez.');
assert.match(loja, /Promise\.allSettled\([\s\S]*carregarPerfilPublicoDaLoja\(\)[\s\S]*carregarProdutosPublicosDaLoja\(\)/);
assert.match(loja, /criarLojaAPartirDosProdutos/);

assert.match(vendedor, /async function carregarProdutosDoVendedor/);
assert.match(vendedor, /call\('listarProdutosVendedor'\)/);
assert.match(api, /async function listarProdutosVendedor/);
assert.match(api, /const vendedor = await requireSeller\(req\)/);
assert.match(api, /case 'listarProdutosVendedor': return listarProdutosVendedor\(req\)/);
assert.match(migration, /using \(vendedor_id = auth\.uid\(\)\)/);
assert.match(migration, /grant select on public\.lojas_publicas to anon, authenticated/);
assert.match(admin, /statusAprovacao: 'aprovado'/);
assert.match(admin, /vendedorAtivo: true/);
assert.match(migrationPublicacao, /where vendedor_id is null/);
assert.match(migrationPublicacao, /status_aprovacao = 'aprovado'/);
assert.match(migrationPublicacao, /using \(ativo = true and vendedor_ativo = true and status_aprovacao = 'aprovado'\)/);

console.log('OK: regressões de catálogo, loja pública e produtos do vendedor protegidas.');
