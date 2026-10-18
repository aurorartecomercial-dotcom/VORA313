import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const styles = fs.readFileSync('style.css', 'utf8');

assert.match(index, /id="headerBuscaForm"/);
assert.match(index, /id="heroBuscaForm"/);
assert.match(index, /id="campoBusca"[^>]*aria-autocomplete="list"/);
assert.match(index, /id="heroCampoBusca"[^>]*aria-autocomplete="list"/);

assert.match(app, /function configurarBuscaComSugestoes\(form, input, tipo\)/);
assert.match(app, /input\.addEventListener\('input'/);
assert.match(app, /function criarLinkProdutoSugestao\(produto, indice\)/);
assert.match(app, /detalhe\.html\?id=\$\{encodeURIComponent\(produto\.id\)\}/);
assert.match(app, /function criarLinkCategoriaSugestao\(categoria, indice\)/);
assert.match(app, /function navegarSugestoes\(event, estado\)/);
assert.match(app, /ArrowDown/);
assert.match(app, /ArrowUp/);
assert.match(app, /Ver todos os resultados para/);
assert.match(app, /function executarPesquisa\(valor, estado\)/);
assert.match(app, /function categoriasPopulares\(\)/);

assert.match(styles, /\.sugestoes-busca\{/);
assert.match(styles, /#headerBuscaForm\{overflow:visible!important\}/);
assert.match(styles, /\.sugestao-busca-item\{/);

console.log('OK: pesquisa inteligente sugere produtos, categorias e mantém navegação acessível.');
