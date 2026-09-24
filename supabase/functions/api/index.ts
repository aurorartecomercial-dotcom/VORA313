import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const FRETES: Record<string, number> = {
  'Luanda Centro': 1000, Ingombota: 1000, Maianga: 1200, Rangel: 1500, Cazenga: 2000,
  Viana: 3500, Talatona: 4000, Kilamba: 4500, Benfica: 3000,
  'Ondjiva (Cunene)': 1500, 'Cuanhama (Ondjiva)': 1500, 'Ombadja (Xangongo)': 2500,
  'Cuvelai (Cunene)': 2500, 'Namacunde (Santa Clara)': 2000, 'Curoca (Cunene)': 3500,
  'Cahama (Cunene)': 3000, 'Outro (Cunene)': 4000
};
const ESTADOS = new Set(['aguardando_pagamento','pago','em_preparacao','enviado','entregue','cancelado']);
const COMISSAO_PADRAO = 7;
const COMISSAO_MAX = 30;

function err(message: string, code = 'bad_request'): never { throw Object.assign(new Error(message), { code }); }
function text(v: unknown, field: string, max: number, required = true) { const x = typeof v === 'string' ? v.trim() : ''; if (required && !x) err(`${field} é obrigatório.`); if (x.length > max) err(`${field} excede o limite permitido.`); return x; }
function intPos(v: unknown, field: string, max = 100) { const x = Number(v); if (!Number.isInteger(x) || x < 1 || x > max) err(`${field} é inválido.`); return x; }
function priceCents(v: unknown) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100);
  const raw = String(v ?? '').trim();
  const normalized = raw.replace(/\s|kz/gi, '');
  // A loja opera em Kz: ponto é milhar e vírgula é decimal. Não aceitar
  // formatos ambíguos como "12.50", que já causaram faturas incorretas.
  if (!/^(?:\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)$/.test(normalized)) {
    err('Preço inválido. Use, por exemplo, 1.500,00 Kz.');
  }
  const value = Number(normalized.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) err('Preço inválido.');
  return Math.round(value * 100);
}
function money(c:number){return Number((c/100).toFixed(2));}
function code(prefix:string){ return `${prefix}-${crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`; }
function dbRow(input: Record<string,any>) { const out:any={}; for(const [k,v] of Object.entries(input)) { out[k.replace(/[A-Z]/g,m=>'_'+m.toLowerCase())]=v; } return out; }
function camelRow(input:any):any { if(Array.isArray(input)) return input.map(camelRow); if(input&&typeof input==='object'&&!(input instanceof Date)){const o:any={};for(const[k,v]of Object.entries(input)){o[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]=camelRow(v);}return o;}return input; }

async function userFromRequest(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function requireUser(req:Request){const u=await userFromRequest(req);if(!u)err('Inicie sessão para continuar.','unauthenticated');return u;}
async function isAdmin(uid:string){const {data}=await db.from('profiles').select('role,ativo').eq('id',uid).maybeSingle();return data?.role==='admin'&&data?.ativo!==false;}
async function isSeller(uid:string){const {data}=await db.from('vendedores').select('status,ativo').eq('id',uid).maybeSingle();return data?.status==='aprovado'&&data?.ativo!==false;}
async function requireAdmin(req:Request){const u=await requireUser(req);if(!(await isAdmin(u.id)))err('Acesso administrativo necessário.','permission_denied');return u;}
async function requireSeller(req:Request){const u=await requireUser(req);if(!(await isSeller(u.id)))err('Conta de vendedor aprovada necessária.','permission_denied');return u;}

async function criarPedido(req:Request, input:any){
  const user=await requireUser(req); if(!Array.isArray(input?.itens)||!input.itens.length||input.itens.length>30)err('O carrinho é inválido.');
  const idempotencyRecebida=text(input?.idempotencyKey,'Chave do pedido',128,false);
  if(idempotencyRecebida&&!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyRecebida))err('Chave do pedido inválida.');
  // Clientes com uma versão antiga do PWA não enviam a chave; mantemos a
  // compatibilidade, mas os clientes atuais sempre recebem idempotência.
  const idempotencyKey=idempotencyRecebida||code('CHECKOUT');
  const pedidoResposta=(p:any)=>({pedidoId:p.id,codigoRastreio:p.codigo_rastreio,numeroFatura:p.numero_fatura,status:p.status,subtotal:Number(p.subtotal||0),frete:Number(p.frete||0),valorDesconto:Number(p.valor_desconto||0),valorTotal:Number(p.valor_total||0),itens:camelRow(p.itens||[]),cupomAplicado:camelRow(p.cupom_aplicado)});
  const {data:existente,error:existenteErro}=await db.from('vendas').select('*').eq('uid_cliente',user.id).eq('idempotency_key',idempotencyKey).maybeSingle();
  if(existenteErro)throw existenteErro;
  if(existente)return pedidoResposta(existente);
  const cliente={nome:text(input.cliente?.nome,'Nome',120),telefone:text(input.cliente?.telefone,'Telefone',15),nif:text(input.cliente?.nif,'NIF',10),morada:text(input.cliente?.morada,'Morada',300,false),bairro:text(input.cliente?.bairro,'Bairro',80),observacao:text(input.cliente?.observacao,'Observação',500,false)};
  if(!/^\d{9,15}$/.test(cliente.telefone))err('Telefone inválido.'); if(!/^\d{10}$/.test(cliente.nif))err('NIF inválido.'); if(!(cliente.bairro in FRETES))err('Bairro não atendido.');
  const grouped=new Map<string,number>(); for(const item of input.itens){const id=text(item?.produtoId,'Produto',128);const q=intPos(item?.quantidade,'Quantidade',20);grouped.set(id,(grouped.get(id)||0)+q);} if([...grouped.values()].some(x=>x>20))err('Quantidade máxima por produto excedida.');
  const ids=[...grouped.keys()]; const {data:products,error:pe}=await db.from('produtos').select('*').in('id',ids).eq('ativo',true).eq('vendedor_ativo',true).eq('status_aprovacao','aprovado'); if(pe)throw pe;
  if((products||[]).length!==ids.length)err('Um produto do carrinho já não existe.','not_found');
  let subtotal=0; const itens:any[]=[];
  for(const p of products||[]){const q=grouped.get(p.id)||0;const estoque=Number(p.estoque||0);const precoNumerico=p.preco_valor===null||p.preco_valor===undefined?null:Number(p.preco_valor);const pc=Number.isFinite(precoNumerico)&&precoNumerico>0?Math.round(precoNumerico*100):priceCents(p.preco);if(!Number.isInteger(estoque)||estoque<q)err(`${p.nome||'Produto'} não possui estoque suficiente.`,'failed_precondition');const percentual=Number(p.monetizacao?.percentualComissao??p.percentual_comissao??COMISSAO_PADRAO);if(!Number.isFinite(percentual)||percentual<0||percentual>COMISSAO_MAX)err(`Comissão inválida para ${p.nome||'produto'}.`,'failed_precondition');const bruto=pc*q;const com=Math.round(bruto*percentual/100);subtotal+=bruto;itens.push({produtoId:p.id,nome:text(p.nome,'Nome do produto',160),quantidade:q,preco:money(pc),observacao:'',vendedorId:p.vendedor_id||'vora313',vendedorNome:p.vendedor_nome||'VORA 313',comissaoPercentual:percentual,valorBruto:money(bruto),comissaoVora:money(com),valorVendedor:money(bruto-com)});}
  const codigoCupom=text(input.cupom,'Cupom',60,false).toUpperCase();let desconto=0;let cupomAplicado:any=null;
  if(codigoCupom){const {data:cupom}=await db.from('cupons').select('*').eq('codigo',codigoCupom).maybeSingle();if(!cupom||cupom.ativo!==true)err('Cupom inválido.','failed_precondition');if(cupom.uid_cliente&&cupom.uid_cliente!==user.id)err('Cupom indisponível.','failed_precondition');if(cupom.validade&&new Date(cupom.validade)<new Date())err('Cupom expirado.','failed_precondition');if(Number.isFinite(cupom.max_usos)&&Number(cupom.usos||0)>=Number(cupom.max_usos))err('Cupom atingiu o limite de uso.','failed_precondition');desconto=Math.round(subtotal*Number(cupom.percentual)/100);cupomAplicado={codigo:codigoCupom,percentual:Number(cupom.percentual)};}
  const frete=FRETES[cliente.bairro]*100;const total=subtotal-desconto+frete;const comissao=itens.reduce((s,i)=>s+Math.round(Number(i.comissaoVora||0)*100),0);const receita=comissao+frete;const valorVend=subtotal-comissao;const id=crypto.randomUUID();const rastreio=code('VORA');const fatura=code('FR');const now=new Date();
  const venda={id,codigo_rastreio:rastreio,numero_fatura:fatura,uid_cliente:user.id,status:'aguardando_pagamento',pagamento:{metodo:'multicaixa_manual',status:'pendente'},nome_cliente:cliente.nome,telefone_cliente:cliente.telefone,nif_cliente:cliente.nif,morada_cliente:cliente.morada,bairro:cliente.bairro,observacao:cliente.observacao,itens,produtos_resumo:itens.map(i=>`${i.nome} (x${i.quantidade})`).join(', '),total_itens:itens.reduce((s,i)=>s+i.quantidade,0),subtotal:money(subtotal),frete:money(frete),valor_desconto:money(desconto),valor_total:money(total),cupom_aplicado:cupomAplicado,monetizacao:{modelo:'comissao_por_venda',comissaoProdutos:money(comissao),receitaVora:money(receita),valorVendedores:money(valorVend),comissaoGerada:false},data_hora:now.toLocaleString('pt-AO',{timeZone:'Africa/Luanda'}),expira_em:new Date(now.getTime()+2*60*60*1000).toISOString(),idempotency_key:idempotencyKey,criado_em:now.toISOString(),atualizado_em:now.toISOString()};
  const itemRows=itens.map(i=>({...dbRow(i),id:crypto.randomUUID(),venda_id:id,produto_id:i.produtoId,nome:i.nome,quantidade:i.quantidade,preco:i.preco,observacao:i.observacao,vendedor_id:i.vendedorId==='vora313'?null:i.vendedorId,vendedor_nome:i.vendedorNome,comissao_percentual:i.comissaoPercentual,valor_bruto:i.valorBruto,comissao_vora:i.comissaoVora,valor_vendedor:i.valorVendedor}));
  const rastreioRow={codigo:rastreio,status:'aguardando_pagamento',criado_em:now.toISOString(),atualizado_em:now.toISOString()};
  const {error:saveError}=await db.rpc('criar_pedido_atomico',{p_venda:venda,p_itens:itemRows,p_rastreio:rastreioRow});
  if(saveError){
    if(saveError.code==='23505'){
      const {data:repetido,error:repetidoErro}=await db.from('vendas').select('*').eq('uid_cliente',user.id).eq('idempotency_key',idempotencyKey).maybeSingle();
      if(repetidoErro)throw repetidoErro;
      if(repetido)return pedidoResposta(repetido);
    }
    throw saveError;
  }
  return {pedidoId:id,codigoRastreio:rastreio,numeroFatura:fatura,status:'aguardando_pagamento',subtotal:money(subtotal),frete:money(frete),valorDesconto:money(desconto),valorTotal:money(total),itens,cupomAplicado};
}

async function atualizarEstadoPedido(req:Request,input:any){
  await requireAdmin(req);const codigo=text(input?.codigoRastreio,'Código de rastreio',64).toUpperCase();const novo=text(input?.status,'Estado',32);if(!ESTADOS.has(novo))err('Estado inválido.');
  const {data,error}=await db.rpc('atualizar_estado_pedido',{p_codigo:codigo,p_novo_status:novo});
  if(error)throw error;
  return camelRow(data);
}

async function handle(req:Request,name:string,input:any){
  switch(name){
    case 'criarPedido': return criarPedido(req,input);
    case 'atualizarEstadoPedido': return atualizarEstadoPedido(req,input);
    case 'solicitarVendedor': {const u=await requireUser(req);const d={nome:text(input?.nome,'Nome',120),nomeLoja:text(input?.nomeLoja,'Nome da loja',120),telefone:text(input?.telefone,'Telefone',15),email:text(u.email,'Email',160),morada:text(input?.morada,'Morada',300,false),categoria:text(input?.categoria,'Categoria',80),descricao:text(input?.descricao,'Descrição',1000,false),status:'pendente',ativo:false,plano:'basico',uid:u.id};const {data:old}=await db.from('vendedores').select('status').eq('id',u.id).maybeSingle();if(old?.status==='aprovado'||old?.status==='pendente')return {ok:true,status:old.status};if(old?.status==='suspenso')err('A sua loja está suspensa. Contacte a VORA 313.','failed_precondition');const {error}=await db.from('vendedores').upsert({id:u.id,...d},{onConflict:'id'});if(error)throw error;return {ok:true,status:'pendente'};}
    case 'atualizarPerfilVendedor': {const u=await requireSeller(req);const d={nome:text(input?.nome,'Nome',120),nomeLoja:text(input?.nomeLoja,'Nome da loja',120),telefone:text(input?.telefone,'Telefone',15),morada:text(input?.morada,'Morada',300,false),categoria:text(input?.categoria,'Categoria',80),descricao:text(input?.descricao,'Descrição',1000,false),atualizado_em:new Date().toISOString()};const {error}=await db.from('vendedores').update(d).eq('id',u.id);if(error)throw error;return {ok:true};}
    case 'atualizarDadosRecebimento': {const u=await requireSeller(req);const metodo=text(input?.metodo,'Método de recebimento',40),titular=text(input?.titular,'Titular',160),referencia=text(input?.referencia,'Conta/IBAN/telefone',160);if(!['transferencia_bancaria','multicaixa_express','outro'].includes(metodo))err('Método de recebimento inválido.');const {error}=await db.from('vendedores').update({dados_recebimento:{metodo,titular,referencia,atualizadoEm:new Date().toISOString()},atualizado_em:new Date().toISOString()}).eq('id',u.id);if(error)throw error;return {ok:true};}
    case 'criarProdutoVendedor': {const u=await requireSeller(req);const {data:v}=await db.from('vendedores').select('*').eq('id',u.id).maybeSingle();const estoque=Number(input?.estoque);if(!Number.isInteger(estoque)||estoque<0||estoque>100000)err('Estoque inválido.');const id=crypto.randomUUID();const preco=text(input?.preco,'Preço',60);const p={id,ordem:999999,nome:text(input?.nome,'Nome',160),categoria:text(input?.categoria,'Categoria',80),preco,preco_valor:money(priceCents(preco)),preco_antigo:text(input?.precoAntigo,'Preço antigo',60,false),desconto:text(input?.desconto,'Desconto',30,false),parcelas:text(input?.parcelas,'Parcelas',80,false),frete_gratis:input?.freteGratis===true,descricao:text(input?.descricao,'Descrição',3000),imagens:Array.isArray(input?.imagens)?input.imagens.slice(0,8):[],marca:text(input?.marca,'Marca',120,false),sku:text(input?.sku,'SKU',80,false),tag:text(input?.tag||input?.categoria,'Tag',80,false),estoque,vendedor_id:u.id,vendedor_nome:v?.nome_loja||v?.nome,status_aprovacao:'aguardando_aprovacao',ativo:false,vendedor_ativo:true,monetizacao:{destaque:false}};const {error}=await db.from('produtos').insert(p);if(error)throw error;await db.from('vendedores').update({total_produtos:Number(v?.total_produtos||0)+1}).eq('id',u.id);return {ok:true,produtoId:id,status:p.status_aprovacao};}
    case 'atualizarProdutoVendedor': {const u=await requireSeller(req);const id=text(input?.produtoId,'Produto',128);const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p||p.vendedor_id!==u.id)err('Produto não pertence à sua loja.','permission_denied');const x=input?.produto||{};const estoque=Number(x.estoque);if(!Number.isInteger(estoque)||estoque<0||estoque>100000)err('Estoque inválido.');const preco=text(x.preco,'Preço',60);const patch={nome:text(x.nome,'Nome',160),categoria:text(x.categoria,'Categoria',80),preco,preco_valor:money(priceCents(preco)),preco_antigo:text(x.precoAntigo,'Preço antigo',60,false),desconto:text(x.desconto,'Desconto',30,false),parcelas:text(x.parcelas,'Parcelas',80,false),frete_gratis:x.freteGratis===true,descricao:text(x.descricao,'Descrição',3000),imagens:Array.isArray(x.imagens)?x.imagens.slice(0,8):[],marca:text(x.marca,'Marca',120,false),sku:text(x.sku,'SKU',80,false),tag:text(x.tag,'Tag',80,false),estoque,status_aprovacao:'aguardando_aprovacao',ativo:false,vendedor_ativo:true,atualizado_em:new Date().toISOString()};const {error}=await db.from('produtos').update(patch).eq('id',id);if(error)throw error;return {ok:true,status:'aguardando_aprovacao'};}
    case 'solicitarDestaque': {const u=await requireSeller(req);const id=text(input?.produtoId,'Produto',128),dias=Number(input?.dias),precos:any={7:5000,15:9000,30:15000};if(!precos[dias])err('Período de destaque inválido.');const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p||p.vendedor_id!==u.id||p.status_aprovacao!=='aprovado'||p.ativo!==true)err('Produto não está aprovado e publicado.','permission_denied');const {data:exist}=await db.from('destaques_solicitados').select('*').eq('uid_vendedor',u.id).eq('produto_id',id);if((exist||[]).some((d:any)=>['aguardando_pagamento','pendente'].includes(d.status)||(d.status==='ativo'&&d.fim&&new Date(d.fim)>new Date())))err('Já existe uma solicitação ativa ou pendente.','already_exists');const {data:row,error}=await db.from('destaques_solicitados').insert({uid_vendedor:u.id,produto_id:id,nome_produto:p.nome,dias,valor:precos[dias],status:'aguardando_pagamento'}).select('id,valor').single();if(error)throw error;return {ok:true,requestId:row.id,valor:row.valor};}
    case 'solicitarLevantamento': {const u=await requireSeller(req);const informado=input?.valor;const valor=informado===undefined||informado===null||informado===''?null:Number(informado);if(valor!==null&&(!Number.isFinite(valor)||valor<=0))err('Valor de levantamento inválido.','failed_precondition');const {data,error}=await db.rpc('solicitar_levantamento_atomico',{p_vendedor:u.id,p_valor:valor});if(error)throw error;return camelRow(data);}
    case 'gerirVendedor': {await requireAdmin(req);const uid=text(input?.uid,'Vendedor',128),acao=text(input?.acao,'Ação',30);if(!['aprovar','reativar','recusar','suspender'].includes(acao))err('Ação inválida.');const status=acao==='aprovar'||acao==='reativar'?'aprovado':acao==='recusar'?'recusado':'suspenso';const ativo=status==='aprovado';const {error}=await db.from('vendedores').update({status,ativo,atualizado_em:new Date().toISOString()}).eq('id',uid);if(error)throw error;await db.from('produtos').update({vendedor_ativo:ativo}).eq('vendedor_id',uid);return {ok:true,status};}
    case 'aprovarProdutoVendedor': {await requireAdmin(req);const id=text(input?.produtoId,'Produto',128),acao=text(input?.acao,'Ação',20);if(!['aprovar','recusar'].includes(acao))err('Ação inválida.');const {data:p}=await db.from('produtos').select('vendedor_id').eq('id',id).maybeSingle();if(!p)err('Produto não encontrado.','not_found');const ativo=acao==='aprovar';if(ativo&&!p.vendedor_id)err('Produto de vendedor inválido.','failed_precondition');const {data:v}=p.vendedor_id?await db.from('vendedores').select('status,ativo').eq('id',p.vendedor_id).maybeSingle():{data:null};if(ativo&&(!v||v.status!=='aprovado'||v.ativo===false))err('O vendedor não está ativo/aprovado.','failed_precondition');const {error}=await db.from('produtos').update({status_aprovacao:ativo?'aprovado':'recusado',ativo,vendedor_ativo:ativo?true:(v?.ativo!==false),atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;return {ok:true,status:ativo?'aprovado':'recusado'};}
    case 'definirDestaqueManual': {await requireAdmin(req);const id=text(input?.produtoId,'Produto',128),ativo=input?.ativo===true;const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p)err('Produto não encontrado.','not_found');if(ativo&&p.vendedor_id){const {data:v}=await db.from('vendedores').select('status,ativo').eq('id',p.vendedor_id).maybeSingle();if(!v||v.status!=='aprovado'||p.status_aprovacao!=='aprovado')err('O vendedor/produto não está aprovado.','failed_precondition');}const m={...(p.monetizacao||{}),destaque:ativo,destaqueInicio:ativo?new Date().toISOString():null,destaqueFim:ativo?new Date(Date.now()+30*86400000).toISOString():null,atualizadoEm:new Date().toISOString()};const {error}=await db.from('produtos').update({monetizacao:m,atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;return {ok:true,ativo};}
    case 'processarDestaque': {await requireAdmin(req);const id=text(input?.requestId,'Solicitação',128),acao=text(input?.acao,'Ação',20);const {data:d}=await db.from('destaques_solicitados').select('*').eq('id',id).maybeSingle();if(!d)err('Solicitação não encontrada.','not_found');if(!['aguardando_pagamento','pendente'].includes(d.status))err('Esta solicitação já foi processada.','failed_precondition');if(acao==='recusar'){await db.from('destaques_solicitados').update({status:'recusado',atualizado_em:new Date().toISOString()}).eq('id',id);return {ok:true};}if(acao!=='aprovar')err('Ação inválida.');const inicio=new Date(),fim=new Date(inicio.getTime()+Number(d.dias)*86400000);const {error}=await db.from('destaques_solicitados').update({status:'ativo',inicio:inicio.toISOString(),fim:fim.toISOString(),atualizado_em:inicio.toISOString()}).eq('id',id);if(error)throw error;const {data:p}=await db.from('produtos').select('monetizacao').eq('id',d.produto_id).maybeSingle();await db.from('produtos').update({monetizacao:{...(p?.monetizacao||{}),destaque:true,destaqueInicio:inicio.toISOString(),destaqueFim:fim.toISOString(),destaqueSolicitacaoId:id},atualizado_em:inicio.toISOString()}).eq('id',d.produto_id);return {ok:true,fim:fim.toISOString()};}
    case 'definirPlanoVendedor': {await requireAdmin(req);const uid=text(input?.uid,'Vendedor',128),plano=text(input?.plano,'Plano',20).toLowerCase();if(!['basico','profissional','premium'].includes(plano))err('Plano inválido.');const {error}=await db.from('vendedores').update({plano,atualizado_em:new Date().toISOString()}).eq('id',uid);if(error)throw error;return {ok:true,plano};}
    case 'processarLevantamento': {await requireAdmin(req);const id=text(input?.levantamentoId,'Levantamento',128),acao=text(input?.acao,'Ação',20);if(!['aprovar','recusar'].includes(acao))err('Ação inválida.');const {data,error}=await db.rpc('processar_levantamento_atomico',{p_levantamento_id:id,p_acao:acao});if(error)throw error;return camelRow(data);}
    case 'adicionarAvaliacao': {const u=await requireUser(req);const produtoId=text(input?.produtoId,'Produto',128);const nota=Number(input?.nota);if(!Number.isInteger(nota)||nota<1||nota>5)err('Nota inválida.');const {data:pedidos,error:pedidosErro}=await db.from('vendas').select('id').eq('uid_cliente',u.id).eq('status','entregue');if(pedidosErro)throw pedidosErro;if(!(pedidos||[]).length)err('Só é possível avaliar produtos de pedidos entregues.','permission_denied');const {data:item,error:itemErro}=await db.from('venda_itens').select('id').eq('produto_id',produtoId).in('venda_id',(pedidos||[]).map(p=>p.id)).limit(1).maybeSingle();if(itemErro)throw itemErro;if(!item)err('Só é possível avaliar produtos que comprou e recebeu.','permission_denied');const id=`${u.id}_${produtoId}`;const {error}=await db.from('avaliacoes').upsert({id,produto_id:produtoId,uid_cliente:u.id,nota,data:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return {ok:true};}
    case 'criarPagamentoMulticaixa': case 'consultarPagamentoMulticaixa': case 'criarPagamentoCartao': case 'consultarPagamentoCartao': err(`Integração de pagamento "${name}" ainda não está configurada no backend Supabase.`,'not_configured');
    default: err(`Função "${name}" não existe no backend Supabase.`,'not_found');
  }
}

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{const body=await req.json();const result=await handle(req,String(body?.name||''),body?.data||{});return new Response(JSON.stringify({data:camelRow(result)}),{status:200,headers:{...cors,'Content-Type':'application/json'}});}catch(e){console.error(e);return new Response(JSON.stringify({error:{code:e?.code||'internal',message:e?.message||'Erro interno.'}}),{status:400,headers:{...cors,'Content-Type':'application/json'}});}
});
