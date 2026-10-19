import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('js/app.js', 'utf8');
const homepage = fs.readFileSync('js/homepage.js', 'utf8');
const detalhe = fs.readFileSync('js/detalhe-app.js', 'utf8');
const catalogo = fs.readFileSync('js/catalogo.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');

assert.match(app, /const catalogoInicial = aplicarFiltros\(\);/);
assert.doesNotMatch(app, /renderizarTudo\(/, 'A vitrine inicial não pode disparar uma segunda pesquisa.');
assert.match(app, /function carregarQuandoProximo\(elemento, tarefa\)/);
assert.match(app, /iniciarConteudosSecundarios\(\);/);
assert.match(app, /executarQuandoLivre\(\(\) => preencherFiltroVendedores\(\)\)/);

assert.match(homepage, /renderizarCategorias\(\[\]\);/);
assert.match(homepage, /function carregarProdutosHomepageQuandoNecessario\(\)/);
assert.match(homepage, /IntersectionObserver/);

assert.doesNotMatch(detalhe, /await initFavoritos\(\)/, 'Favoritos não devem bloquear o detalhe do produto.');
assert.match(detalhe, /fetchpriority="high"/);
assert.match(detalhe, /executarQuandoLivre\(\(\) => renderizarRecomendacoes\(produtoAtual\)\)/);
assert.doesNotMatch(
  catalogo.match(/export async function obterProdutoPublico\(id\) \{[\s\S]*?\n}\n\nexport async function obterVendedoresPublicos/)?.[0] || '',
  /produto_avaliacoes_resumo/,
  'O detalhe do produto deve consultar dados essenciais antes das avaliações.'
);

assert.match(index, /xeuthybpiphiejfvjrtu\.supabase\.co/);
assert.doesNotMatch(index, /<script type="module" src="js\/(carrinho|fidelidade|favoritos|fase3)\.js/, 'Módulos já importados pelo app não devem ser descarregados outra vez.');
assert.match(serviceWorker, /vora313-cache-v71-desempenho/);
assert.match(serviceWorker, /'\.\/','\.\/index\.html','\.\/style\.css','\.\/logo-vora-313\.png','\.\/manifest\.json'/);
assert.doesNotMatch(serviceWorker, /'\.\/produtos\.json'/, 'O Service Worker não deve ocupar a primeira visita com catálogos inteiros.');

console.log('OK: catálogo prioritário, secções sob demanda, detalhe rápido e cache leve verificados.');
