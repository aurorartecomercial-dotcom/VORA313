import assert from 'node:assert/strict';
import test from 'node:test';

import { extrairValorNumerico, valorMonetarioKz } from '../js/utils.js';

test('aceita valores Kz no formato definido pela aplicação', () => {
  assert.equal(valorMonetarioKz('1.500 Kz'), 1500);
  assert.equal(valorMonetarioKz('1.500,50 Kz'), 1500.5);
  assert.equal(valorMonetarioKz('1500'), 1500);
  assert.equal(extrairValorNumerico('KZ 45.000.000,00'), 45000000);
});

test('rejeita formatos de preço ambíguos ou inválidos', () => {
  assert.equal(valorMonetarioKz('1.50 Kz'), null);
  assert.equal(valorMonetarioKz('12,345'), null);
  assert.equal(valorMonetarioKz('grátis'), null);
});
