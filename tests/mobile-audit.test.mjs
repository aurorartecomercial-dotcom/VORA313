import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = [
  'index.html','categoria.html','detalhe.html','loja.html','perfil.html',
  'meus-pedidos.html','meus-favoritos.html','vendedor.html',
  'admin-vendas.html','admin-vendedores.html','admin.html','blog.html','rastreio.html','monetizacao.html'
];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html, /<meta[^>]+name=["']viewport["']/i, `${file}: viewport ausente`);
}
const style = fs.readFileSync(path.join(root,'style.css'),'utf8');
for (const token of [
  'body.page-standalone{padding-top:0!important',
  '#modalLogin>div',
  '#modalPagamento>div',
  '.carrinho-corpo .item-controles',
  '.filtros-sidebar select{min-height:44px',
  'Deslize horizontalmente para ver mais',
  '.btn-favorito{width:40px'
]) assert.ok(style.includes(token), `style.css: regra ausente: ${token}`);
const sellerCss = fs.readFileSync(path.join(root,'vendedor-v25.css'),'utf8');
assert.ok(sellerCss.includes('.seller-app{position:relative;'), 'seller-app sem posicionamento relativo');
const seller = fs.readFileSync(path.join(root,'vendedor.html'),'utf8');
assert.match(seller, /<body[^>]+page-vendedor/);
const adminSeller = fs.readFileSync(path.join(root,'admin-vendedores.html'),'utf8');
assert.match(adminSeller, /page-admin-vendedores/);
console.log(`OK: ${pages.length} jornadas/pages mobile auditadas; regras finais presentes.`);
