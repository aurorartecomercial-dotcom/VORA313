import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const dir = path.resolve(process.env.MIGRATION_OUTPUT || './migration-output');
const users = JSON.parse(await fs.readFile(path.join(dir, 'auth-users.json'), 'utf8'));
const mapFile = path.join(dir, 'firebase_uid_map.json');

try { await fs.access(mapFile); } catch {
  const template = users.map(u => ({ firebase_uid: u.uid, supabase_uid: '', email: u.email, role: u.customClaims?.admin === true ? 'admin' : (u.customClaims?.seller === true ? 'vendedor' : 'cliente') }));
  await fs.writeFile(mapFile, JSON.stringify(template, null, 2));
  console.error(`Criado template: ${mapFile}`);
  console.error('Preencha supabase_uid com o UUID correspondente de cada utilizador e execute novamente.');
  process.exit(2);
}

const mapRows = JSON.parse(await fs.readFile(mapFile, 'utf8'));
const uidMap = new Map(mapRows.filter(x => x.supabase_uid).map(x => [x.firebase_uid, x.supabase_uid]));
const missing = users.filter(u => !uidMap.has(u.uid));
if (missing.length) {
  throw new Error(`${missing.length} utilizadores ainda não têm supabase_uid no firebase_uid_map.json.`);
}

const read = async name => JSON.parse(await fs.readFile(path.join(dir, `${name}.json`), 'utf8'));
const write = async (name, rows) => fs.writeFile(path.join(dir, `${name}.supabase.json`), JSON.stringify(rows, null, 2));
const uid = x => x ? uidMap.get(x) || null : null;
const iso = x => x?.__type === 'timestamp' ? x.value : x || null;
const money = x => Number(x || 0);

const profileRows = users.map(u => ({
  id: uid(u.uid), firebase_uid: u.uid, nome: u.displayName, telefone: u.phoneNumber, nif: null,
  role: u.customClaims?.admin === true ? 'admin' : (u.customClaims?.seller === true ? 'vendedor' : 'cliente'), ativo: !u.disabled
}));
await write('profiles', profileRows);

const clientes = await read('clientes');
await write('clientes', clientes.map(r => ({ id: uid(r.id), firebase_uid: r.id, nome: r.data.nome || null, email: r.data.email || null, pontos: Number(r.data.pontos || 0), historico: r.data.historico || [] })));

const vendedores = await read('vendedores');
await write('vendedores', vendedores.map(r => ({ id: uid(r.id), uid: r.id, nome: r.data.nome || '', nome_loja: r.data.nomeLoja || r.data.nome_loja || '', telefone: r.data.telefone || null, email: r.data.email || null, morada: r.data.morada || null, categoria: r.data.categoria || null, descricao: r.data.descricao || null, status: r.data.status || 'pendente', ativo: r.data.ativo !== false, plano: r.data.plano || 'basico', saldo_disponivel: money(r.data.saldoDisponivel), saldo_retido: money(r.data.saldoRetido), total_vendas: Number(r.data.totalVendas || 0), total_produtos: Number(r.data.totalProdutos || 0), dados_recebimento: r.data.dadosRecebimento || null })));

const produtos = await read('produtos');
await write('produtos', produtos.map(r => ({ id: r.data.id || r.id, ordem: Number(r.data.ordem ?? 999999), nome: r.data.nome || '', categoria: r.data.categoria || '', preco: String(r.data.preco ?? ''), preco_antigo: r.data.precoAntigo ?? null, desconto: r.data.desconto ?? null, parcelas: r.data.parcelas ?? null, frete_gratis: r.data.freteGratis === true, descricao: r.data.descricao || '', imagens: r.data.imagens || [], marca: r.data.marca || null, sku: r.data.sku || null, tag: r.data.tag || null, estoque: Number(r.data.estoque || 0), vendedor_id: uid(r.data.vendedorId), vendedor_nome: r.data.vendedorNome || null, status_aprovacao: r.data.statusAprovacao || 'aprovado', ativo: r.data.ativo !== false, vendedor_ativo: r.data.vendedorAtivo !== false, monetizacao: r.data.monetizacao || {} })));

const cupons = await read('cupons');
await write('cupons', cupons.map(r => ({ id: r.data.id || r.id, codigo: r.data.codigo || r.id, uid_cliente: uid(r.data.uidCliente), ativo: r.data.ativo !== false, percentual: Number(r.data.percentual || 0), validade: iso(r.data.validade), max_usos: r.data.maxUsos == null ? null : Number(r.data.maxUsos), usos: Number(r.data.usos || 0) })));

const vendas = await read('vendas');
const vendaRows = [];
const itemRows = [];
for (const r of vendas) {
  const d = r.data;
  vendaRows.push({ id: r.id, codigo_rastreio: d.codigoRastreio || null, numero_fatura: d.numeroFatura || null, uid_cliente: uid(d.uidCliente), status: d.status || 'aguardando_pagamento', pagamento: d.pagamento || {}, nome_cliente: d.nomeCliente || null, telefone_cliente: d.telefoneCliente || null, nif_cliente: d.nifCliente || null, morada_cliente: d.moradaCliente || null, bairro: d.bairro || null, observacao: d.observacao || null, produtos_resumo: d.produtosResumo || null, total_itens: Number(d.totalItens || 0), subtotal: money(d.subtotal), frete: money(d.frete), valor_desconto: money(d.valorDesconto), valor_total: money(d.valorTotal), cupom_aplicado: d.cupomAplicado || null, monetizacao: d.monetizacao || {}, data_hora: iso(d.criadoEm || d.dataHora), expira_em: iso(d.expiraEm) });
  for (const it of (d.itens || [])) itemRows.push({ id: randomUUID(), venda_id: r.id, produto_id: it.produtoId, nome: it.nome || '', quantidade: Number(it.quantidade || 0), preco: money(it.preco), observacao: it.observacao || null, vendedor_id: uid(it.vendedorId), vendedor_nome: it.vendedorNome || null, comissao_percentual: Number(it.comissaoPercentual ?? 7), valor_bruto: money(it.valorBruto), comissao_vora: money(it.comissaoVora), valor_vendedor: money(it.valorVendedor) });
}
await write('vendas', vendaRows); await write('venda_itens', itemRows);

for (const [source, target] of [['comissoes','comissoes'],['movimentosVendedores','movimentos_vendedores'],['vendasVendedor','vendas_vendedor'],['destaquesSolicitados','destaques_solicitados'],['levantamentos','levantamentos'],['avaliacoes','avaliacoes'],['rastreiosPublicos','rastreios_publicos']]) {
  const rows = await read(source); const out = [];
  for (const r of rows) {
    const d = r.data;
    if (target === 'comissoes') out.push({ id:r.id, pedido_id:d.pedidoId, codigo_rastreio:d.codigoRastreio||null, numero_fatura:d.numeroFatura||null, uid_cliente:uid(d.uidCliente), modelo:d.modelo||'comissao_por_venda', valor_venda_produtos:money(d.valorVendaProdutos), comissao_vora:money(d.comissaoVora), receita_frete_vora:money(d.receitaFreteVora), receita_total_vora:money(d.receitaTotalVora), status:d.status||'gerada', criado_em:iso(d.criadoEm) });
    if (target === 'movimentos_vendedores') out.push({ id:randomUUID(), uid_vendedor:uid(d.uidVendedor), pedido_id:d.pedidoId||null, codigo_rastreio:d.codigoRastreio||null, tipo:d.tipo||'venda_paga', valor_venda:money(d.valorVenda), comissao_vora:money(d.comissaoVora), valor_vendedor:money(d.valorVendedor), status:d.status||'disponivel', criado_em:iso(d.criadoEm) });
    if (target === 'vendas_vendedor') out.push({ id:r.id, uid_vendedor:uid(d.uidVendedor), pedido_id:d.pedidoId||null, codigo_rastreio:d.codigoRastreio||null, status:d.status||null, valor_venda:money(d.valorVenda), comissao_vora:money(d.comissaoVora), valor_vendedor:money(d.valorVendedor), produtos_resumo:d.produtosResumo||null, criado_em:iso(d.criadoEm), atualizado_em:iso(d.atualizadoEm) });
    if (target === 'destaques_solicitados') out.push({ id:randomUUID(), uid_vendedor:uid(d.uidVendedor), produto_id:d.produtoId, nome_produto:d.nomeProduto||null, dias:Number(d.dias), valor:money(d.valor), status:d.status||'aguardando_pagamento', inicio:iso(d.inicio), fim:iso(d.fim) });
    if (target === 'levantamentos') out.push({ id:randomUUID(), uid_vendedor:uid(d.uidVendedor), valor:money(d.valor), status:d.status||'pendente', dados_recebimento:d.dadosRecebimento||{}, processado_em:iso(d.processadoEm) });
    if (target === 'avaliacoes') out.push({ id:r.id, produto_id:d.produtoId, uid_cliente:uid(d.uidCliente), nota:Number(d.nota), data:iso(d.data) });
    if (target === 'rastreios_publicos') out.push({ codigo:d.codigo||r.id, status:d.status||'aguardando_pagamento', criado_em:iso(d.criadoEm), atualizado_em:iso(d.atualizadoEm) });
  }
  await write(target, out);
}

const fidelidade = [];
for (const c of clientes) {
  const hist = Array.isArray(c.data?.historico) ? c.data.historico : [];
  for (const h of hist) fidelidade.push({ id:randomUUID(), uid_cliente:uid(c.id), tipo:h.tipo||'ajuste', pontos:Number(h.pontos||0), descricao:h.descricao||null, pedido_id:h.pedidoId||null, criado_em:iso(h.data) });
}
await write('fidelidade_movimentos', fidelidade);
console.log('Transformação concluída. Ficheiros *.supabase.json preparados.');
