import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const carrinho = fs.readFileSync('js/carrinho.js', 'utf8');
const styles = fs.readFileSync('style.css', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');

assert.match(index, /Continuar para a fatura/);
assert.match(index, /Gerar pedido e fatura proforma/);
assert.match(index, /id="btnImprimirFatura"/);
assert.match(index, /Imprimir \/ guardar fatura proforma/);
assert.match(index, /Enviar pedido pelo WhatsApp/);
assert.match(index, /A fatura proforma não confirma pagamento/);
assert.doesNotMatch(index, /Banco:<\/strong> BAI \/ Standard Bank/, 'Não publicar dados bancários fixos e possivelmente desatualizados.');

assert.match(carrinho, /function imprimirFaturaPendente\(\)/);
assert.match(carrinho, /Fatura proforma aberta\. Pode imprimir ou guardar em PDF\./);
assert.match(carrinho, /PEDIDO PARA PAGAMENTO MANUAL/);
assert.match(carrinho, /solicito os dados para efetuar o pagamento/);
assert.match(carrinho, /function sessaoAnonimaFoiDesativada\(error\)/);
assert.match(carrinho, /anonymous sign-ins are disabled/);
assert.match(carrinho, /function criarProformaManual\(cliente\)/);
assert.match(carrinho, /FRETES_PROFORMA/);
assert.match(carrinho, /proformaManual: true/);
assert.match(
  carrinho,
  /if \(sessaoAnonimaFoiDesativada\(error\)\) \{[\s\S]*?abrirFluxoProformaManual\(cliente\);/,
  'Se o Supabase bloquear convidados, o cliente ainda deve conseguir gerar a proforma.'
);
assert.match(
  carrinho,
  /if \(pedido\.proformaManual\) \{\s*enviarPedidoWhatsApp\(pedido\);\s*return;/,
  'A proforma provisória não pode tentar iniciar um pagamento autenticado.'
);
assert.match(carrinho, /sem pedido registado/);
assert.match(carrinho, /return true;\s*}\s*$/, 'A abertura bem-sucedida da fatura deve ter retorno explícito.');
assert.doesNotMatch(
  carrinho.match(/function enviarPedidoWhatsApp\(pedido\) \{[\s\S]*?\n}\n\nexport function gerarFaturaHTML/)?.[0] || '',
  /gerarFaturaHTML\(pedido\)/,
  'O WhatsApp não deve abrir automaticamente uma segunda janela de fatura.'
);

assert.match(styles, /\.vora-home-benefit-card\.buyer\s*\{/);
assert.match(styles, /#7d1d4e/);
assert.match(styles, /\.vora-home-benefit-card\.seller\s*\{/);
assert.match(styles, /#004f43/);
assert.match(styles, /\.v31-mobile-nav\s*\{/);
assert.match(styles, /#003f35/);
assert.match(serviceWorker, /vora313-cache-v69-proforma-sem-sessao/);

console.log('OK: fatura proforma manual, WhatsApp e contraste visual protegidos.');
