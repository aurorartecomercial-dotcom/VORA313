import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Projetos Supabase recentes disponibilizam as chaves seguras num mapa JSON.
// A chave legada continua apenas como compatibilidade para instalações antigas.
const SECRET_KEYS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const SERVICE_KEY = SECRET_KEYS.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE_KEY) throw new Error('A chave segura da Edge Function não está disponível.');
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default || Deno.env.get('SUPABASE_ANON_KEY');
if (!PUBLISHABLE_KEY) throw new Error('A chave pública da Edge Function não está disponível.');
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ORIGENS_PERMITIDAS = new Set(
  (Deno.env.get('CORS_ALLOWED_ORIGINS') || 'https://aurorartecomercial-dotcom.github.io')
    .split(',').map((origem) => origem.trim()).filter(Boolean)
);

function cors(req: Request) {
  const origem = req.headers.get('Origin') || '';
  const permitida = ORIGENS_PERMITIDAS.has(origem);
  return {
    ...(permitida ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
};

const FRETES: Record<string, number> = {
  'Luanda Centro': 1000, Ingombota: 1000, Maianga: 1200, Rangel: 1500, Cazenga: 2000,
  Viana: 3500, Talatona: 4000, Kilamba: 4500, Benfica: 3000,
  'Ondjiva (Cunene)': 1500, 'Cuanhama (Ondjiva)': 1500, 'Ombadja (Xangongo)': 2500,
  'Cuvelai (Cunene)': 2500, 'Namacunde (Santa Clara)': 2000, 'Curoca (Cunene)': 3500,
  'Cahama (Cunene)': 3000, 'Outro (Cunene)': 4000
};
const ESTADOS = new Set(['aguardando_pagamento','pago','em_preparacao','enviado','entregue','cancelado']);
const METODOS_PAGAMENTO = new Set(['multicaixa_express', 'multicaixa_referencia', 'cartao', 'transferencia_manual']);
const COMISSAO_PADRAO = 7;
const COMISSAO_MAX = 30;

const LIMITE_CORPO_BYTES = 64 * 1024;
const MIME_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_VIDEO = new Set(['video/mp4', 'video/webm']);
const TAMANHO_VIDEO_MAXIMO = 100 * 1024 * 1024;
const DURACAO_VIDEO_MAXIMA = 60;
const LIMITE_VIDEOS_POR_VENDEDOR = 7;

function err(message: string, code = 'bad_request'): never { throw Object.assign(new Error(message), { code }); }
function detalhesErroParaLog(causa: unknown) {
  const erro = causa as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  return {
    codigo: typeof erro?.code === 'string' ? erro.code : '',
    mensagem: typeof erro?.message === 'string' ? erro.message : '',
    detalhes: typeof erro?.details === 'string' ? erro.details : '',
    sugestao: typeof erro?.hint === 'string' ? erro.hint : ''
  };
}
function configuracaoDeVideoEmFalta(causa: unknown) {
  const erro = detalhesErroParaLog(causa);
  const detalhe = `${erro.mensagem} ${erro.detalhes} ${erro.sugestao}`.toLowerCase();
  return erro.codigo === '42P01'
    // A tabela existe, mas ainda tem o formato da migration 024. A fila de
    // moderação usa as colunas introduzidas pela 026.
    || (erro.codigo === '42703' && /(revisado_|motivo_recusa|revisado_por)/.test(detalhe))
    || (erro.codigo === '23514' && /videos_vendedores.*status|status.*videos_vendedores/.test(detalhe))
    || /relation .*videos_vendedores.*does not exist/.test(detalhe)
    || /bucket (not found|does not exist)|((not found|does not exist).*bucket)/.test(detalhe);
}
function falhaInfraestruturaVideo(causa: unknown, etapa: string): never {
  // Só é registado nos Logs privados da Edge Function: nunca expõe detalhes ao cliente.
  console.error(`Falha de vídeo na etapa: ${etapa}`, detalhesErroParaLog(causa));
  if (configuracaoDeVideoEmFalta(causa)) {
    err('A moderação de vídeos ainda não está configurada. Execute as migrations 016, 024, 025 e 026, nesta ordem, e publique novamente a Edge Function api.', 'failed_precondition');
  }
  const erro = detalhesErroParaLog(causa);
  if (erro.codigo === '42501' && /videos_vendedores/i.test(`${erro.mensagem} ${erro.detalhes}`)) {
    err('O servidor ainda não tem autorização para gravar vídeos. Execute a migration 025 de permissões de vídeo no Supabase.', 'failed_precondition');
  }
  err('O servidor não conseguiu preparar a publicação do vídeo. Abra os Logs privados da Edge Function api para identificar a configuração pendente.', 'failed_precondition');
}
function text(v: unknown, field: string, max: number, required = true) { const x = typeof v === 'string' ? v.trim() : ''; if (required && !x) err(`${field} é obrigatório.`); if (x.length > max) err(`${field} excede o limite permitido.`); return x; }
function intPos(v: unknown, field: string, max = 100) { const x = Number(v); if (!Number.isInteger(x) || x < 1 || x > max) err(`${field} é inválido.`); return x; }
function urlHttps(valor: unknown, field: string, max = 1200) {
  const original = text(valor, field, max, false);
  if (!original) return '';
  let url: URL;
  try { url = new URL(original); } catch (_) { err(`${field} contém uma URL inválida.`); }
  if (url!.protocol !== 'https:' || url!.username || url!.password) err(`${field} deve utilizar HTTPS.`);
  return url!.href;
}
function instagramSeguro(valor: unknown) {
  const original = text(valor, 'Instagram', 120, false);
  if (!original) return '';
  if (/^@?[a-z0-9._]{1,30}$/i.test(original)) return `https://instagram.com/${original.replace(/^@/, '').toLowerCase()}`;
  const url = urlHttps(original, 'Instagram', 120);
  if (!['instagram.com', 'www.instagram.com'].includes(new URL(url).hostname.toLowerCase())
    || !/^\/[a-z0-9._]{1,30}\/?$/i.test(new URL(url).pathname)) {
    err('Instagram inválido. Use @utilizador ou um link HTTPS do Instagram.');
  }
  return url;
}
function perfilPublicoSeguro(valor: unknown) {
  const perfil = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
  const estiloVitrine = text(perfil.estiloVitrine, 'Estilo da vitrine', 40, false).toLowerCase() || 'padrao';
  if (!['padrao', 'tema_categoria', 'editorial_moda', 'editorial_beleza', 'editorial_livros'].includes(estiloVitrine)) {
    err('Estilo da vitrine inválido.');
  }
  const editorialProdutoId = text(perfil.editorialProdutoId, 'Produto editorial', 128, false);
  if (editorialProdutoId && !/^[A-Za-z0-9_-]{1,128}$/.test(editorialProdutoId)) {
    err('Produto editorial inválido.');
  }
  return {
    logoUrl: urlHttps(perfil.logoUrl, 'Logótipo'),
    capaUrl: urlHttps(perfil.capaUrl, 'Capa'),
    horario: text(perfil.horario, 'Horário', 160, false),
    instagram: instagramSeguro(perfil.instagram),
    destaque: text(perfil.destaque, 'Destaque', 280, false),
    estiloVitrine,
    editorialColecao: text(perfil.editorialColecao, 'Coleção editorial', 80, false),
    editorialTitulo: text(perfil.editorialTitulo, 'Título editorial', 120, false),
    editorialChamada: text(perfil.editorialChamada, 'Texto editorial', 320, false),
    editorialProdutoId
  };
}
function imagensSeguras(valor: unknown) {
  if (!Array.isArray(valor) || valor.length > 8) err('Envie no máximo 8 imagens válidas.');
  return valor.map((item, indice) => urlHttps(item, `Imagem ${indice + 1}`));
}
function variacoesSeguras(valor: unknown) {
  if (valor === undefined || valor === null || valor === '') return [];
  if (!Array.isArray(valor) || valor.length > 3) err('Envie no máximo 3 tipos de variação.');
  const nomes = new Set<string>();
  return valor.map((grupo, indice) => {
    if (!grupo || typeof grupo !== 'object' || Array.isArray(grupo)) err(`Variação ${indice + 1} inválida.`);
    const dados = grupo as Record<string, unknown>;
    const nome = text(dados.nome, `Nome da variação ${indice + 1}`, 40);
    const chave = nome.toLocaleLowerCase('pt-AO');
    if (nomes.has(chave)) err('Não repita o mesmo tipo de variação.');
    nomes.add(chave);
    if (!Array.isArray(dados.opcoes) || !dados.opcoes.length || dados.opcoes.length > 20) {
      err(`${nome} deve ter entre 1 e 20 opções.`);
    }
    const opcoesUsadas = new Set<string>();
    const opcoes = dados.opcoes.map((opcao, opIndice) => {
      const valorOpcao = typeof opcao === 'string' ? opcao : (opcao && typeof opcao === 'object' ? (opcao as Record<string, unknown>).nome : '');
      const opcaoNome = text(valorOpcao, `Opção ${opIndice + 1} de ${nome}`, 40);
      const opcaoChave = opcaoNome.toLocaleLowerCase('pt-AO');
      if (opcoesUsadas.has(opcaoChave)) err(`Não repita uma opção de ${nome}.`);
      opcoesUsadas.add(opcaoChave);
      return { nome: opcaoNome };
    });
    return { nome, obrigatoria: dados.obrigatoria !== false, opcoes };
  });
}
function selecaoVariacaoSegura(configuradas: unknown, recebida: unknown) {
  const grupos = variacoesSeguras(configuradas);
  if (!grupos.length) return [];
  const entrada = recebida && typeof recebida === 'object' && !Array.isArray(recebida) ? recebida as Record<string, unknown> : {};
  const usadas = new Set(Object.keys(entrada).map((chave) => chave.toLocaleLowerCase('pt-AO')));
  for (const grupo of grupos) usadas.delete(grupo.nome.toLocaleLowerCase('pt-AO'));
  if (usadas.size) err('A seleção de variações contém uma opção desconhecida.');
  return grupos.map((grupo) => {
    const valor = text(entrada[grupo.nome], grupo.nome, 40, grupo.obrigatoria);
    if (!valor) return null;
    const opcao = grupo.opcoes.find((item) => item.nome.toLocaleLowerCase('pt-AO') === valor.toLocaleLowerCase('pt-AO'));
    if (!opcao) err(`A opção escolhida para ${grupo.nome} não existe.`);
    return { nome: grupo.nome, valor: opcao.nome };
  }).filter(Boolean);
}
async function lerCorpo(req: Request) {
  const tamanhoInformado = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(tamanhoInformado) && tamanhoInformado > LIMITE_CORPO_BYTES) err('Pedido demasiado grande.', 'payload_too_large');
  const bruto = await req.text();
  if (new TextEncoder().encode(bruto).byteLength > LIMITE_CORPO_BYTES) err('Pedido demasiado grande.', 'payload_too_large');
  try { return JSON.parse(bruto); } catch (_) { err('JSON inválido.'); }
}
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

function dbDoUtilizador(req: Request) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
  });
}
async function userFromRequest(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data, error } = await dbDoUtilizador(req).auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function requireUser(req:Request){const u=await userFromRequest(req);if(!u)err('Inicie sessão para continuar.','unauthenticated');return u;}
async function isAdmin(req:Request,uid:string){const {data,error}=await dbDoUtilizador(req).from('profiles').select('role,ativo').eq('id',uid).maybeSingle();if(error){console.error('Falha ao verificar administrador:',error.message);return false;}return data?.role==='admin'&&data?.ativo!==false;}
async function isSeller(req:Request,uid:string){const {data,error}=await dbDoUtilizador(req).from('vendedores').select('status,ativo').eq('id',uid).maybeSingle();if(error){console.error('Falha ao verificar vendedor:',error.message);return false;}return data?.status==='aprovado'&&data?.ativo!==false;}
async function requireAdmin(req:Request){const u=await requireUser(req);if(!(await isAdmin(req,u.id)))err('Acesso administrativo necessário.','permission_denied');return u;}
async function requireSeller(req:Request){const u=await requireUser(req);if(!(await isSeller(req,u.id)))err('Conta de vendedor aprovada necessária.','permission_denied');return u;}

async function registarEventoSeguranca(actorId: string | null, categoria: string, evento: string, alvo: string | null, detalhes: Record<string, unknown> = {}) {
  // A auditoria é complementar: se a migration 018 ainda não foi aplicada,
  // a operação legítima continua disponível, mas o erro não revela detalhes.
  try {
    const { error } = await db.rpc('registrar_evento_seguranca', {
      p_categoria: categoria,
      p_evento: evento,
      p_alvo: alvo,
      p_detalhes: detalhes,
      p_actor_id: actorId
    });
    if (error) console.warn('Auditoria de segurança indisponível.', error.code || 'erro');
  } catch (_) {
    console.warn('Auditoria de segurança indisponível.');
  }
}

async function consumirLimite(uid: string, acao: string, maximo: number, janelaSegundos: number) {
  const { data, error } = await db.rpc('consumir_limite_api', {
    p_chave: `user:${uid}`,
    p_acao: acao,
    p_maximo: maximo,
    p_janela_segundos: janelaSegundos
  });
  if (error) {
    console.error('Falha no limite de segurança.', error.code || 'erro');
    err('A proteção de limite ainda não está configurada. Execute a migration 016 antes de publicar esta versão.', 'failed_precondition');
  }
  if (data !== true) {
    await registarEventoSeguranca(uid, 'limite', 'limite_api_atingido', acao, { acao });
    err('Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.', 'resource_exhausted');
  }
}

// A medição é pública, mas nunca recebe e-mail, telefone ou IP. O navegador
// gera um UUID aleatório e só o SHA-256 dele chega ao banco. O limite separado
// evita que uma página pública seja usada para criar milhões de registos.
const PAGINAS_DE_ACESSO_PUBLICO = new Set(['inicio', 'categoria', 'loja', 'produto']);
const UUID_VISITANTE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function hashVisitante(valor: string) {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function consumirLimitePublico(chave: string) {
  const { data, error } = await db.rpc('consumir_limite_api', {
    p_chave: `visitante:${chave}`,
    p_acao: 'registar_acesso_publico',
    p_maximo: 80,
    p_janela_segundos: 60 * 60
  });
  if (error) {
    console.error('Falha no limite de métricas públicas.', detalhesErroParaLog(error));
    err('A medição de acessos ainda não está configurada. Execute a migration 016 antes de publicar esta versão.', 'failed_precondition');
  }
  if (data !== true) err('Muitas medições em pouco tempo. Tente novamente mais tarde.', 'resource_exhausted');
}

function falhaInfraestruturaMetricas(causa: unknown, etapa: string): never {
  console.error(`Falha de métricas na etapa: ${etapa}`, detalhesErroParaLog(causa));
  const erro = detalhesErroParaLog(causa);
  if (erro.codigo === '42P01' || erro.codigo === '42883') {
    err('A medição de acessos ainda não está configurada. Execute a migration 027 e publique novamente a Edge Function api.', 'failed_precondition');
  }
  err('Não foi possível atualizar as métricas agora. Tente novamente.', 'failed_precondition');
}

async function registarAcessoPublico(_req: Request, input: any) {
  const pagina = text(input?.pagina, 'Página', 20).toLowerCase();
  const visitanteId = text(input?.visitanteId, 'Identificador do visitante', 60);
  let produtoId = text(input?.produtoId, 'Produto', 128, false);
  if (!PAGINAS_DE_ACESSO_PUBLICO.has(pagina)) err('Página de medição inválida.');
  if (!UUID_VISITANTE_RE.test(visitanteId)) err('Identificador do visitante inválido.');
  if (pagina === 'produto' && !produtoId) err('Produto é obrigatório para esta medição.');
  if (pagina !== 'produto') produtoId = '';

  const visitanteHash = await hashVisitante(visitanteId);
  await consumirLimitePublico(visitanteHash);

  if (produtoId) {
    const { data: produto, error: produtoErro } = await db.from('produtos').select('id').eq('id', produtoId).maybeSingle();
    if (produtoErro) falhaInfraestruturaMetricas(produtoErro, 'validação do produto');
    // Se um produto foi removido entre o carregamento da página e esta chamada,
    // a navegação continua e não se cria uma visualização órfã.
    if (!produto) return { ok: true, visualizacoes: 0 };
  }

  const agora = new Date().toISOString();
  const dia = agora.slice(0, 10);
  const { error: acessoErro } = await db.from('acessos_site_diarios').upsert({
    dia,
    visitante_hash: visitanteHash,
    pagina,
    produto_id: produtoId,
    ultimo_acesso_em: agora
  }, { onConflict: 'dia,visitante_hash,pagina,produto_id' });
  if (acessoErro) falhaInfraestruturaMetricas(acessoErro, 'registo de acesso');

  if (!produtoId) return { ok: true };
  const { error: visualizacaoErro } = await db.from('produto_visualizacoes_unicas').upsert({
    produto_id: produtoId,
    visitante_hash: visitanteHash,
    ultimo_visto_em: agora
  }, { onConflict: 'produto_id,visitante_hash' });
  if (visualizacaoErro) falhaInfraestruturaMetricas(visualizacaoErro, 'registo de visualização');
  const { count, error: contagemErro } = await db.from('produto_visualizacoes_unicas')
    .select('produto_id', { count: 'exact', head: true }).eq('produto_id', produtoId);
  if (contagemErro) falhaInfraestruturaMetricas(contagemErro, 'contagem de visualizações');
  return { ok: true, visualizacoes: count || 0 };
}

async function consultarMetricasAcesso(req: Request, input: any) {
  await requireAdmin(req);
  const dias = intPos(input?.dias ?? 30, 'Período', 365);
  try {
    const [geralResposta, diarioResposta, produtosResposta] = await Promise.all([
      db.rpc('resumo_acessos_geral_admin', { p_dias: dias }),
      db.rpc('resumo_acessos_diarios_admin', { p_dias: Math.min(dias, 30) }),
      db.rpc('produtos_mais_vistos_admin', { p_dias: dias, p_limite: 5 })
    ]);
    if (geralResposta.error) falhaInfraestruturaMetricas(geralResposta.error, 'resumo geral');
    if (diarioResposta.error) falhaInfraestruturaMetricas(diarioResposta.error, 'resumo diário');
    if (produtosResposta.error) falhaInfraestruturaMetricas(produtosResposta.error, 'produtos mais vistos');

    const geral = Array.isArray(geralResposta.data) ? geralResposta.data[0] || {} : {};
    const produtos = Array.isArray(produtosResposta.data) ? produtosResposta.data : [];
    const ids = produtos.map((item: any) => String(item.produto_id || '')).filter(Boolean);
    let nomes: Record<string, string> = {};
    if (ids.length) {
      const { data: catalogo, error: catalogoErro } = await db.from('produtos').select('id,nome').in('id', ids);
      if (catalogoErro) falhaInfraestruturaMetricas(catalogoErro, 'nomes dos produtos');
      nomes = Object.fromEntries((catalogo || []).map((produto: any) => [String(produto.id), String(produto.nome || 'Produto removido')]));
    }
    return {
      periodo_dias: dias,
      visitantes_unicos: Number(geral.visitantes_unicos || 0),
      acessos_registados: Number(geral.acessos_registados || 0),
      visualizacoes_produtos: Number(geral.visualizacoes_produtos || 0),
      diario: diarioResposta.data || [],
      produtos: produtos.map((item: any) => ({
        produto_id: String(item.produto_id || ''),
        nome: nomes[String(item.produto_id || '')] || 'Produto removido',
        visualizacoes: Number(item.visualizacoes || 0)
      }))
    };
  } catch (causa) {
    falhaInfraestruturaMetricas(causa, 'consulta administrativa');
  }
}

async function confirmarLimiteVideosVendedor(vendedorId: string) {
  // Vídeos recusados não contam: o vendedor pode substituir um conteúdo que
  // não passou na análise. Pendentes, publicados e ocultos continuam a ocupar
  // uma das sete vagas para impedir acúmulo de conteúdo a moderar.
  const { count, error } = await db.from('videos_vendedores')
    .select('id', { count: 'exact', head: true })
    .eq('vendedor_id', vendedorId)
    .in('status', ['pendente', 'publicado', 'oculto']);
  if (error) falhaInfraestruturaVideo(error, 'verificação do limite de vídeos');
  if ((count || 0) >= LIMITE_VIDEOS_POR_VENDEDOR) {
    err(`A sua loja já atingiu o limite de ${LIMITE_VIDEOS_POR_VENDEDOR} vídeos em revisão ou publicados. Elimine um vídeo antes de enviar outro.`, 'failed_precondition');
  }
  return count || 0;
}

async function criarUploadAssinado(req: Request, input: any) {
  const user = await requireUser(req);
  const tipo = text(input?.tipo, 'Tipo de upload', 24).toLowerCase();
  const mimeType = text(input?.mimeType, 'Tipo do ficheiro', 60).toLowerCase();
  const tamanho = Number(input?.tamanho);
  if (!Number.isInteger(tamanho) || tamanho < 1) err('Tamanho do ficheiro inválido.');

  let pasta: string;
  let maximo: number;
  if (tipo === 'produto') {
    if (!MIME_IMAGEM.has(mimeType)) err('Formato não permitido. Use JPG, PNG, WEBP ou GIF.');
    if (!(await isSeller(req, user.id))) err('Conta de vendedor aprovada necessária.', 'permission_denied');
    pasta = `vendedores/${user.id}/produtos`;
    maximo = 5 * 1024 * 1024;
  } else if (tipo === 'logo') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) err('Use imagem JPG, PNG ou WEBP para o logótipo.');
    if (!(await isSeller(req, user.id))) err('Conta de vendedor aprovada necessária.', 'permission_denied');
    pasta = `vendedores/${user.id}/perfil`;
    maximo = 2 * 1024 * 1024;
  } else if (tipo === 'produto_admin') {
    if (!MIME_IMAGEM.has(mimeType)) err('Formato não permitido. Use JPG, PNG, WEBP ou GIF.');
    if (!(await isAdmin(req, user.id))) err('Acesso administrativo necessário.', 'permission_denied');
    pasta = `admin/${user.id}/produtos`;
    maximo = 5 * 1024 * 1024;
  } else if (tipo === 'video') {
    if (!MIME_VIDEO.has(mimeType)) err('Formato de vídeo não permitido. Use MP4 ou WEBM.');
    if (!(await isSeller(req, user.id))) err('Conta de vendedor aprovada necessária.', 'permission_denied');
    await confirmarLimiteVideosVendedor(user.id);
    pasta = `vendedores/${user.id}/videos`;
    maximo = TAMANHO_VIDEO_MAXIMO;
  } else {
    err('Tipo de upload inválido.');
  }
  if (tamanho > maximo) {
    const unidade = tipo === 'video' ? 'vídeo' : 'imagem';
    err(`O ${unidade} deve ter no máximo ${Math.round(maximo / 1024 / 1024)} MB.`);
  }
  await consumirLimite(user.id, `upload:${tipo}`, tipo === 'video' ? 8 : 30, 60 * 60);

  const extensao = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'video/mp4' ? 'mp4' : mimeType.split('/')[1];
  const caminho = `${pasta}/${crypto.randomUUID()}.${extensao}`;
  const { data, error } = await db.storage.from('vora-public').createSignedUploadUrl(caminho);
  if (error || !data?.token) {
    if (tipo === 'video') falhaInfraestruturaVideo(error || new Error('Token de upload não recebido.'), 'criação da URL de upload');
    throw error || new Error('Não foi possível preparar o upload seguro.');
  }
  return { caminho, token: data.token };
}

async function criarVideoVendedor(req: Request, input: any) {
  const user = await requireSeller(req);
  const titulo = text(input?.titulo, 'Título do vídeo', 100);
  const descricao = text(input?.descricao, 'Descrição', 600, false);
  const caminho = text(input?.caminho, 'Vídeo', 300);
  const mimeType = text(input?.mimeType, 'Tipo do vídeo', 60).toLowerCase();
  const tamanho = Number(input?.tamanho);
  const duracao = input?.duracaoSegundos === undefined || input?.duracaoSegundos === null || input?.duracaoSegundos === ''
    ? null : Number(input?.duracaoSegundos);
  const produtoId = text(input?.produtoId, 'Produto relacionado', 128, false);

  if (!MIME_VIDEO.has(mimeType)) err('Formato de vídeo não permitido. Use MP4 ou WEBM.');
  if (!/^vendedores\/[0-9a-f-]{36}\/videos\/[0-9a-f-]{36}\.(mp4|webm)$/.test(caminho) || !caminho.startsWith(`vendedores/${user.id}/videos/`)) {
    err('Ficheiro de vídeo inválido ou não pertence à sua conta.', 'permission_denied');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > TAMANHO_VIDEO_MAXIMO) err('Tamanho do vídeo inválido.');
  if (duracao !== null && (!Number.isInteger(duracao) || duracao < 1 || duracao > DURACAO_VIDEO_MAXIMA)) err('O vídeo deve ter no máximo 60 segundos.');
  await confirmarLimiteVideosVendedor(user.id);

  let produto = null;
  if (produtoId) {
    const { data, error } = await db.from('produtos')
      .select('id,vendedor_id,nome,status_aprovacao,ativo,vendedor_ativo,imagens,preco')
      .eq('id', produtoId).maybeSingle();
    if (error) throw error;
    if (!data || data.vendedor_id !== user.id || data.status_aprovacao !== 'aprovado' || data.ativo !== true || data.vendedor_ativo === false) {
      err('O produto relacionado precisa estar publicado na sua própria loja.', 'permission_denied');
    }
    produto = data;
  }

  const { data: video, error } = await db.from('videos_vendedores').insert({
    vendedor_id: user.id,
    produto_id: produto?.id || null,
    titulo,
    descricao,
    caminho_storage: caminho,
    video_url: db.storage.from('vora-public').getPublicUrl(caminho).data.publicUrl,
    mime_type: mimeType,
    tamanho_bytes: tamanho,
    duracao_segundos: duracao,
    // Um vídeo novo nunca vai diretamente para a loja pública. A equipa
    // administrativa precisa aprová-lo explicitamente no painel de revisão.
    status: 'pendente'
  }).select('*').single();
  if (error) {
    try {
      await db.storage.from('vora-public').remove([caminho]);
    } catch (_) {
      // A gravação do vídeo já falhou; a mensagem útil ao vendedor tem prioridade.
    }
    if (error?.code === 'P0001' && /limite de 7 vídeos/i.test(error.message || '')) {
      err(`A sua loja já atingiu o limite de ${LIMITE_VIDEOS_POR_VENDEDOR} vídeos em revisão ou publicados. Elimine um vídeo antes de enviar outro.`, 'failed_precondition');
    }
    falhaInfraestruturaVideo(error, 'registo do vídeo no banco');
  }
  await registarEventoSeguranca(user.id, 'vendedor', 'video_enviado_para_revisao', video.id, { produtoId: produto?.id || null });
  return camelRow(video);
}

async function eliminarVideoVendedor(req: Request, input: any) {
  const user = await requireSeller(req);
  const id = text(input?.videoId, 'Vídeo', 128);
  const { data: video, error: leituraErro } = await db.from('videos_vendedores').select('*').eq('id', id).maybeSingle();
  if (leituraErro) throw leituraErro;
  if (!video || video.vendedor_id !== user.id) err('Vídeo não encontrado ou sem permissão.', 'permission_denied');

  const { error: storageErro } = await db.storage.from('vora-public').remove([video.caminho_storage]);
  if (storageErro) throw storageErro;
  const { error } = await db.from('videos_vendedores').delete().eq('id', id).eq('vendedor_id', user.id);
  if (error) throw error;
  await registarEventoSeguranca(user.id, 'vendedor', 'video_eliminado', id, {});
  return { ok: true };
}

async function criarPedido(req:Request, input:any){
  const user=await requireUser(req); if(!Array.isArray(input?.itens)||!input.itens.length||input.itens.length>30)err('O carrinho é inválido.');
  const idempotencyRecebida=text(input?.idempotencyKey,'Chave do pedido',128,false);
  if(idempotencyRecebida&&!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyRecebida))err('Chave do pedido inválida.');
  // Clientes com uma versão antiga do PWA não enviam a chave; mantemos a
  // compatibilidade, mas os clientes atuais sempre recebem idempotência.
  const idempotencyKey=idempotencyRecebida||code('CHECKOUT');
  const pedidoResposta=(p:any)=>({
    pedidoId:p.id,codigoRastreio:p.codigo_rastreio,numeroFatura:p.numero_fatura,status:p.status,
    subtotal:Number(p.subtotal||0),frete:Number(p.frete||0),valorDesconto:Number(p.valor_desconto||0),
    valorTotal:Number(p.valor_total||0),itens:camelRow(p.itens||[]),cupomAplicado:camelRow(p.cupom_aplicado),
    cliente:{nome:p.nome_cliente,telefone:p.telefone_cliente,nif:p.nif_cliente,morada:p.morada_cliente,bairro:p.bairro},
    emitidoEm:p.criado_em||p.data_hora||null,expiraEm:p.expira_em||null,pagamento:camelRow(p.pagamento||{})
  });
  const {data:existente,error:existenteErro}=await db.from('vendas').select('*').eq('uid_cliente',user.id).eq('idempotency_key',idempotencyKey).maybeSingle();
  if(existenteErro)throw existenteErro;
  if(existente)return pedidoResposta(existente);
  const cliente={nome:text(input.cliente?.nome,'Nome',120),telefone:text(input.cliente?.telefone,'Telefone',15),nif:text(input.cliente?.nif,'NIF',10),morada:text(input.cliente?.morada,'Morada',300,false),bairro:text(input.cliente?.bairro,'Bairro',80),observacao:text(input.cliente?.observacao,'Observação',500,false)};
  if(!/^\d{9,15}$/.test(cliente.telefone))err('Telefone inválido.'); if(!/^\d{10}$/.test(cliente.nif))err('NIF inválido.'); if(!(cliente.bairro in FRETES))err('Bairro não atendido.');
  const entradas = input.itens.map((item: any) => ({
    produtoId: text(item?.produtoId, 'Produto', 128),
    quantidade: intPos(item?.quantidade, 'Quantidade', 20),
    variacao: item?.variacao
  }));
  const grouped=new Map<string,number>(); for(const item of entradas){grouped.set(item.produtoId,(grouped.get(item.produtoId)||0)+item.quantidade);} if([...grouped.values()].some(x=>x>20))err('Quantidade máxima por produto excedida.');
  const ids=[...grouped.keys()]; const {data:products,error:pe}=await db.from('produtos').select('*').in('id',ids).eq('ativo',true).eq('vendedor_ativo',true).eq('status_aprovacao','aprovado'); if(pe)throw pe;
  if((products||[]).length!==ids.length)err('Um produto do carrinho já não existe.','not_found');
  let subtotal=0; const itens:any[]=[];
  for(const p of products||[]){
    const entradasProduto=entradas.filter((item) => item.produtoId===p.id);
    const quantidadeTotal=grouped.get(p.id)||0;
    const estoque=Number(p.estoque||0);
    const precoNumerico=p.preco_valor===null||p.preco_valor===undefined?null:Number(p.preco_valor);
    const pc=Number.isFinite(precoNumerico)&&precoNumerico>0?Math.round(precoNumerico*100):priceCents(p.preco);
    if(!Number.isInteger(estoque)||estoque<quantidadeTotal)err(`${p.nome||'Produto'} não possui estoque suficiente.`,'failed_precondition');
    const percentual=Number(p.monetizacao?.percentualComissao??p.percentual_comissao??COMISSAO_PADRAO);
    if(!Number.isFinite(percentual)||percentual<0||percentual>COMISSAO_MAX)err(`Comissão inválida para ${p.nome||'produto'}.`,'failed_precondition');
    const configuradas=variacoesSeguras(p.variacoes);
    for(const entrada of entradasProduto){
      const q=entrada.quantidade;
      const bruto=pc*q;
      const com=Math.round(bruto*percentual/100);
      subtotal+=bruto;
      itens.push({produtoId:p.id,nome:text(p.nome,'Nome do produto',160),quantidade:q,preco:money(pc),observacao:'',variacao:selecaoVariacaoSegura(configuradas,entrada.variacao),vendedorId:p.vendedor_id||'vora313',vendedorNome:p.vendedor_nome||'VORA 313',comissaoPercentual:percentual,valorBruto:money(bruto),comissaoVora:money(com),valorVendedor:money(bruto-com)});
    }
  }
  const codigoCupom=text(input.cupom,'Cupom',60,false).toUpperCase();let desconto=0;let cupomAplicado:any=null;
  if(codigoCupom){const {data:cupom}=await db.from('cupons').select('*').eq('codigo',codigoCupom).maybeSingle();if(!cupom||cupom.ativo!==true)err('Cupom inválido.','failed_precondition');if(cupom.uid_cliente&&cupom.uid_cliente!==user.id)err('Cupom indisponível.','failed_precondition');if(cupom.validade&&new Date(cupom.validade)<new Date())err('Cupom expirado.','failed_precondition');if(Number.isFinite(cupom.max_usos)&&Number(cupom.usos||0)>=Number(cupom.max_usos))err('Cupom atingiu o limite de uso.','failed_precondition');desconto=Math.round(subtotal*Number(cupom.percentual)/100);cupomAplicado={codigo:codigoCupom,percentual:Number(cupom.percentual)};}
  const frete=FRETES[cliente.bairro]*100;const total=subtotal-desconto+frete;const comissao=itens.reduce((s,i)=>s+Math.round(Number(i.comissaoVora||0)*100),0);const receita=comissao+frete;const valorVend=subtotal-comissao;const id=crypto.randomUUID();const rastreio=code('VORA');const fatura=code('FR');const now=new Date();
  const venda={id,codigo_rastreio:rastreio,numero_fatura:fatura,uid_cliente:user.id,status:'aguardando_pagamento',pagamento:{metodo:'multicaixa_manual',status:'pendente'},nome_cliente:cliente.nome,telefone_cliente:cliente.telefone,nif_cliente:cliente.nif,morada_cliente:cliente.morada,bairro:cliente.bairro,observacao:cliente.observacao,itens,produtos_resumo:itens.map(i=>`${i.nome} (x${i.quantidade})`).join(', '),total_itens:itens.reduce((s,i)=>s+i.quantidade,0),subtotal:money(subtotal),frete:money(frete),valor_desconto:money(desconto),valor_total:money(total),cupom_aplicado:cupomAplicado,monetizacao:{modelo:'comissao_por_venda',comissaoProdutos:money(comissao),receitaVora:money(receita),valorVendedores:money(valorVend),comissaoGerada:false},data_hora:now.toLocaleString('pt-AO',{timeZone:'Africa/Luanda'}),expira_em:new Date(now.getTime()+2*60*60*1000).toISOString(),idempotency_key:idempotencyKey,criado_em:now.toISOString(),atualizado_em:now.toISOString()};
  const itemRows=itens.map(i=>({...dbRow(i),id:crypto.randomUUID(),venda_id:id,produto_id:i.produtoId,nome:i.nome,quantidade:i.quantidade,preco:i.preco,observacao:i.observacao,variacao:i.variacao,vendedor_id:i.vendedorId==='vora313'?null:i.vendedorId,vendedor_nome:i.vendedorNome,comissao_percentual:i.comissaoPercentual,valor_bruto:i.valorBruto,comissao_vora:i.comissaoVora,valor_vendedor:i.valorVendedor}));
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
  return pedidoResposta(venda);
}

function respostaPagamento(p:any) {
  return {
    pagamentoId: p.id,
    pedidoId: p.venda_id,
    codigoRastreio: p.codigo_rastreio,
    numeroFatura: p.numero_fatura,
    valor: Number(p.valor || 0),
    moeda: p.moeda,
    metodo: p.metodo,
    provedor: p.provedor,
    status: p.status,
    entidade: p.entidade || null,
    referencia: p.referencia || null,
    checkoutUrl: p.checkout_url || null,
    qrPayload: p.qr_payload || null,
    expiraEm: p.expira_em || null,
    pagoEm: p.pago_em || null
  };
}

async function iniciarPagamentoPedido(req: Request, input: any) {
  const user = await requireUser(req);
  const pedidoId = text(input?.pedidoId, 'Pedido', 128);
  const metodo = text(input?.metodo, 'Método de pagamento', 40).toLowerCase();
  const chaveRecebida = text(input?.idempotencyKey, 'Chave de pagamento', 128, false);
  if (!METODOS_PAGAMENTO.has(metodo)) err('Método de pagamento inválido.');
  if (chaveRecebida && !/^[a-zA-Z0-9_-]{16,128}$/.test(chaveRecebida)) {
    err('Chave de pagamento inválida.');
  }
  const idempotencyKey = chaveRecebida || code('PAY');

  // Nesta primeira fase só o fluxo manual é disponibilizado. A integração
  // automática permanece intacta e será ligada apenas quando existir gateway
  // e credenciais reais configurados no backend.
  if (metodo !== 'transferencia_manual') {
    err('Este método ainda está em ativação pela VORA 313. Escolha transferência manual ou tente novamente quando o gateway estiver ativo.', 'not_configured');
  }

  const { data, error } = await db.rpc('iniciar_pagamento_vora', {
    p_venda_id: pedidoId,
    p_uid_cliente: user.id,
    p_metodo: metodo,
    p_idempotency_key: idempotencyKey
  });
  if (error) {
    const mensagem = String(error.message || '');
    if (/não encontrado/i.test(mensagem)) err('Pedido não encontrado.', 'not_found');
    if (/já não está disponível|expirou|método|chave|pagamento inválido|não pertence/i.test(mensagem)) {
      err(mensagem, 'failed_precondition');
    }
    throw error;
  }

  const pagamento = data?.pagamento || data;
  return respostaPagamento(pagamento);
}

async function consultarPagamentoPedido(req: Request, input: any) {
  const user = await requireUser(req);
  const pagamentoId = text(input?.pagamentoId, 'Pagamento', 128, false);
  const pedidoId = text(input?.pedidoId, 'Pedido', 128, false);
  if (!pagamentoId && !pedidoId) err('Informe o pagamento ou o pedido.');
  let consulta = db.from('pagamentos').select('*').eq('uid_cliente', user.id);
  consulta = pagamentoId ? consulta.eq('id', pagamentoId) : consulta.eq('venda_id', pedidoId).order('criado_em', { ascending: false }).limit(1);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw error;
  if (!data) err('Pagamento não encontrado.', 'not_found');
  return respostaPagamento(data);
}

async function listarMeusPedidos(req: Request) {
  const user = await requireUser(req);
  const { data: vendas, error: vendasErro } = await db.from('vendas')
    .select('id,codigo_rastreio,numero_fatura,status,pagamento,subtotal,frete,valor_desconto,valor_total,expira_em,criado_em,atualizado_em,entregue_em,nome_cliente,telefone_cliente,nif_cliente,morada_cliente,bairro')
    .eq('uid_cliente', user.id).order('criado_em', { ascending: false }).limit(50);
  if (vendasErro) throw vendasErro;
  const ids = (vendas || []).map((venda: any) => venda.id);
  if (!ids.length) return { pedidos: [] };
  const [{ data: itens, error: itensErro }, { data: pagamentos, error: pagamentosErro }, { data: historico, error: historicoErro }] = await Promise.all([
    db.from('venda_itens').select('*').in('venda_id', ids),
    db.from('pagamentos').select('id,venda_id,metodo,provedor,status,referencia,valor,moeda,expira_em,pago_em,criado_em').eq('uid_cliente', user.id).in('venda_id', ids).order('criado_em', { ascending: false }),
    db.from('pedido_status_historico').select('id,venda_id,status_anterior,status_novo,origem,ator_id,detalhes,criado_em').in('venda_id', ids).order('criado_em', { ascending: true })
  ]);
  if (itensErro) throw itensErro;
  if (pagamentosErro) throw pagamentosErro;
  if (historicoErro) throw historicoErro;
  const porVenda = new Map<string, any[]>();
  (itens || []).forEach((item: any) => porVenda.set(item.venda_id, [...(porVenda.get(item.venda_id) || []), camelRow(item)]));
  const pagamentoPorVenda = new Map<string, any>();
  (pagamentos || []).forEach((pagamento: any) => {
    if (!pagamentoPorVenda.has(pagamento.venda_id)) pagamentoPorVenda.set(pagamento.venda_id, camelRow(pagamento));
  });
  const historicoPorVenda = new Map<string, any[]>();
  (historico || []).forEach((evento: any) => historicoPorVenda.set(evento.venda_id, [...(historicoPorVenda.get(evento.venda_id) || []), camelRow(evento)]));
  return { pedidos: (vendas || []).map((venda: any) => ({ ...camelRow(venda), itens: porVenda.get(venda.id) || [], pagamentoDetalhe: pagamentoPorVenda.get(venda.id) || null, historicoStatus: historicoPorVenda.get(venda.id) || [] })) };
}

async function consultarElegibilidadeAvaliacao(req: Request, input: any) {
  const user = await requireUser(req);
  const produtoId = text(input?.produtoId, 'Produto', 128);
  const itemIdInformado = text(input?.itemId, 'Item da compra', 80, false);
  const userDb = dbDoUtilizador(req);
  const { data: pedidos, error: pedidosErro } = await userDb.from('vendas')
    .select('id,criado_em').eq('uid_cliente', user.id).eq('status', 'entregue')
    .order('criado_em', { ascending: false }).limit(100);
  if (pedidosErro) throw pedidosErro;
  const idsPedidos = (pedidos || []).map((p: any) => p.id);
  if (!idsPedidos.length) return { elegivel: false, podeAvaliarProduto: false, podeAvaliarVendedor: false, motivo: 'A avaliação fica disponível após a entrega do pedido.' };
  const { data: itens, error: itensErro } = await userDb.from('venda_itens')
    .select('id,venda_id,produto_id,vendedor_id').eq('produto_id', produtoId)
    .in('venda_id', idsPedidos)
    .order('venda_id', { ascending: false }).limit(20);
  if (itensErro) throw itensErro;
  if (!(itens || []).length) return { elegivel: false, podeAvaliarProduto: false, podeAvaliarVendedor: false, motivo: 'Só pode avaliar produtos que comprou e recebeu.' };
  const idsItens = (itens || []).map((row: any) => row.id);
  const { data: produtoReviewsTodos, error: produtoErroTodos } = await db.from('avaliacoes')
    .select('id,venda_item_id').eq('produto_id', produtoId).eq('uid_cliente', user.id).in('venda_item_id', idsItens);
  if (produtoErroTodos) throw produtoErroTodos;
  const revisados = new Set((produtoReviewsTodos || []).map((row: any) => String(row.venda_item_id)));
  const item = itemIdInformado
    ? (itens || []).find((row: any) => String(row.id) === itemIdInformado)
    : (itens || []).find((row: any) => !revisados.has(String(row.id))) || (itens || [])[0];
  if (!item) return { elegivel: false, podeAvaliarProduto: false, podeAvaliarVendedor: false, motivo: 'Só pode avaliar produtos que comprou e recebeu.' };
  const [{ data: produtoReviews, error: produtoErro }, { data: sellerReviews, error: sellerErro }] = await Promise.all([
    db.from('avaliacoes').select('id').eq('produto_id', produtoId).eq('venda_item_id', item.id).eq('uid_cliente', user.id).limit(1),
    item.vendedor_id
      ? db.from('avaliacoes_vendedores').select('id').eq('venda_id', item.venda_id).eq('vendedor_id', item.vendedor_id).eq('uid_cliente', user.id).limit(1)
      : Promise.resolve({ data: [], error: null } as any)
  ]);
  if (produtoErro) throw produtoErro;
  if (sellerErro) throw sellerErro;
  return {
    elegivel: !produtoReviews?.length,
    podeAvaliarProduto: !produtoReviews?.length,
    podeAvaliarVendedor: Boolean(item.vendedor_id) && !sellerReviews?.length,
    itemId: item.id,
    pedidoId: item.venda_id,
    vendedorId: item.vendedor_id || null,
    produtoJaAvaliado: Boolean(produtoReviews?.length),
    vendedorJaAvaliado: Boolean(sellerReviews?.length),
    motivo: produtoReviews?.length ? 'Este produto já foi avaliado por esta compra.' : ''
  };
}

async function confirmarPagamentoManual(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const pagamentoId = text(input?.pagamentoId, 'Pagamento', 128);
  const nota = text(input?.nota, 'Nota da confirmação', 600, false);
  const eventoExternoId = `MANUAL-${pagamentoId}-${crypto.randomUUID()}`;
  const { data, error } = await db.rpc('confirmar_pagamento_vora', {
    p_pagamento_id: pagamentoId,
    p_evento_externo_id: eventoExternoId,
    p_provedor_pagamento_id: null,
    p_origem: 'administrador',
    // O cliente pode consultar eventos do seu pagamento. Não guardar aqui
    // e-mail ou identificador do administrador; a auditoria interna registra
    // quem decidiu sem expor esse dado ao comprador.
    p_detalhes: { nota: nota || null }
  });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'pagamento', 'pagamento_confirmado_manual', pagamentoId, { manual: true });
  return camelRow(data);
}

async function atualizarEstadoPedido(req:Request,input:any){
  const admin=await requireAdmin(req);
  const codigo=text(input?.codigoRastreio,'Código de rastreio',64).toUpperCase();
  const novo=text(input?.status,'Estado',32);
  if(!ESTADOS.has(novo))err('Estado inválido.');
  // Usa o JWT do administrador no RPC para que o histórico guarde o ator real.
  const userDb=dbDoUtilizador(req);
  const {data,error}=await userDb.rpc('alterar_estado_pedido_autorizado',{p_codigo:codigo,p_novo_status:novo});
  if(error)throw error;
  await registarEventoSeguranca(admin.id,'pagamento','estado_pedido_alterado',codigo,{status:novo});
  return camelRow(data);
}

async function obterDashboardVendedor(req: Request) {
  const vendedor = await requireUser(req);
  const userDb = dbDoUtilizador(req);
  const { data, error } = await userDb.rpc('dashboard_operacional_vendedor');
  if (error) throw error;
  if (!data || String(data.vendedor_id || data.vendedorId || '') !== vendedor.id) err('Não foi possível validar o dashboard do vendedor.','permission_denied');
  return camelRow(data);
}

async function atualizarEstadoPedidoVendedor(req:Request,input:any){
  const vendedor=await requireSeller(req);
  const codigo=text(input?.codigoRastreio,'Código de rastreio',64).toUpperCase();
  const novo=text(input?.status,'Estado',32);
  if(!ESTADOS.has(novo))err('Estado inválido.');
  if(!['em_preparacao','enviado','entregue'].includes(novo))err('O vendedor só pode atualizar preparação, envio ou entrega.','permission_denied');
  const userDb=dbDoUtilizador(req);
  const {data,error}=await userDb.rpc('alterar_estado_pedido_autorizado',{p_codigo:codigo,p_novo_status:novo});
  if(error)throw error;
  await registarEventoSeguranca(vendedor.id,'vendedor','estado_pedido_alterado',codigo,{status:novo});
  return camelRow(data);
}

async function liberarSaldosVencidos(req: Request) {
  const admin = await requireAdmin(req);
  const { data, error } = await db.rpc('liberar_saldos_vencidos');
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'pagamento', 'saldos_liberados', null, {});
  return camelRow(data);
}

async function abrirDisputaFinanceira(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const codigo = text(input?.codigoRastreio, 'Código de rastreio', 64).toUpperCase();
  const motivo = text(input?.motivo, 'Motivo da disputa', 160);
  const descricao = text(input?.descricao, 'Descrição', 1200, false);
  const { data, error } = await db.rpc('abrir_disputa_financeira', {
    p_codigo: codigo,
    p_motivo: motivo,
    p_descricao: descricao || null
  });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'pagamento', 'disputa_aberta', codigo, {});
  return camelRow(data);
}

async function resolverDisputaFinanceira(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const disputaId = text(input?.disputaId, 'Disputa', 128);
  const decisao = text(input?.decisao, 'Decisão', 20);
  if (!['reembolsar', 'liberar'].includes(decisao)) err('Decisão inválida.');
  const { data, error } = await db.rpc('resolver_disputa_financeira', {
    p_disputa_id: disputaId,
    p_decisao: decisao,
    p_resolvida_por: admin.id
  });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'pagamento', 'disputa_resolvida', disputaId, { decisao });
  return camelRow(data);
}

async function moderarProdutoVendedor(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const produtoId = text(input?.produtoId, 'Produto', 128);
  const acao = text(input?.acao, 'Ação', 20);
  const motivoRecusa = text(input?.motivoRecusa, 'Motivo da recusa', 600, false);
  const checklist = input?.checklistRevisao;
  const camposObrigatorios = ['imagens', 'produto', 'descricao', 'politica'];
  if (!['aprovar', 'recusar'].includes(acao)) err('Ação inválida.');
  if (input?.revisaoConcluida !== true || !checklist || typeof checklist !== 'object'
      || !camposObrigatorios.every(campo => checklist[campo] === true)) {
    err('Conclua a revisão obrigatória antes de decidir.', 'failed_precondition');
  }
  if (acao === 'recusar' && motivoRecusa.length < 5) {
    err('Explique ao vendedor o motivo da recusa.', 'failed_precondition');
  }
  const { data, error } = await db.rpc('moderar_produto_vendedor', {
    p_produto_id: produtoId,
    p_acao: acao,
    p_motivo: motivoRecusa || null,
    p_checklist: checklist,
    p_administrador_id: admin.id,
    p_administrador_email: admin.email || null
  });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'vendedor', 'produto_moderado', produtoId, { acao });
  return camelRow(data);
}

async function eliminarProdutoVendedorAdmin(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const produtoId = text(input?.produtoId, 'Produto', 128);
  const confirmacao = text(input?.confirmacao, 'Confirmação', 20).toLocaleUpperCase('pt-AO');
  if (confirmacao !== 'ELIMINAR') err('Confirme a eliminação escrevendo ELIMINAR.', 'failed_precondition');
  const { data, error } = await db.rpc('eliminar_produto_vendedor_admin', { p_produto_id: produtoId });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'vendedor', 'produto_eliminado_admin', produtoId, { modo: 'individual' });
  return camelRow(data);
}

async function eliminarCatalogoVendedorAdmin(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const vendedorId = text(input?.vendedorId, 'Vendedor', 128);
  const confirmacao = text(input?.confirmacao, 'Confirmação', 20).toLocaleUpperCase('pt-AO');
  if (confirmacao !== 'ELIMINAR') err('Confirme a eliminação escrevendo ELIMINAR.', 'failed_precondition');
  const { data, error } = await db.rpc('eliminar_catalogo_vendedor_admin', { p_vendedor_id: vendedorId });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'vendedor', 'catalogo_eliminado_admin', vendedorId, { eliminados: Number(data?.eliminados || 0) });
  return camelRow(data);
}

async function administrarProdutoVendedor(req: Request, input: any) {
  const admin = await requireAdmin(req);
  const produtoId = text(input?.produtoId, 'Produto', 128);
  const acao = text(input?.acao, 'Ação', 20).toLowerCase();
  if (!['ocultar', 'reativar'].includes(acao)) err('Ação de produto inválida.');

  // A decisão também é validada no PostgreSQL com auth.uid()/is_admin().
  // Não usamos o cliente service-role para esta operação, para que o banco
  // participe efetivamente da autorização.
  const userDb = dbDoUtilizador(req);
  const { data, error } = await userDb.rpc('administrar_produto_vendedor', {
    p_produto_id: produtoId,
    p_acao: acao
  });
  if (error) throw error;
  await registarEventoSeguranca(admin.id, 'vendedor', acao === 'ocultar' ? 'produto_ocultado_admin' : 'produto_reativado_admin', produtoId, { acao });
  return camelRow(data);
}

async function handle(req:Request,name:string,input:any){
  const limites: Record<string, [number, number]> = {
    criarPedido: [5, 15 * 60],
    iniciarPagamentoPedido: [10, 15 * 60],
    consultarPagamentoPedido: [60, 60 * 60],
    listarMeusPedidos: [60, 60 * 60],
    consultarElegibilidadeAvaliacao: [60, 60 * 60],
    solicitarVendedor: [3, 24 * 60 * 60],
    atualizarPerfilVendedor: [20, 60 * 60],
    atualizarDadosRecebimento: [10, 24 * 60 * 60],
    criarProdutoVendedor: [30, 60 * 60],
    atualizarProdutoVendedor: [60, 60 * 60],
    criarVideoVendedor: [20, 60 * 60],
    eliminarVideoVendedor: [30, 60 * 60],
    eliminarProdutoVendedorAdmin: [30, 60 * 60],
    eliminarCatalogoVendedorAdmin: [5, 60 * 60],
    alterarDisponibilidadeProdutoVendedor: [60, 60 * 60],
    solicitarDestaque: [10, 24 * 60 * 60],
    solicitarLevantamento: [5, 24 * 60 * 60],
    adicionarAvaliacao: [20, 24 * 60 * 60],
    obterDashboardVendedor: [30, 15 * 60]
  };
  if (limites[name]) {
    const user = await requireUser(req);
    await consumirLimite(user.id, name, ...limites[name]);
  }
  if (name === 'criarProdutoVendedor' && input) input = { ...input, imagens: imagensSeguras(input.imagens || []) };
  if (name === 'atualizarProdutoVendedor' && input?.produto) input = { ...input, produto: { ...input.produto, imagens: imagensSeguras(input.produto.imagens || []) } };
  switch(name){
    case 'criarPedido': return criarPedido(req,input);
    case 'iniciarPagamentoPedido': return iniciarPagamentoPedido(req,input);
    case 'consultarPagamentoPedido': return consultarPagamentoPedido(req,input);
    case 'listarMeusPedidos': return listarMeusPedidos(req);
    case 'consultarElegibilidadeAvaliacao': return consultarElegibilidadeAvaliacao(req,input);
    case 'confirmarPagamentoManual': return confirmarPagamentoManual(req,input);
    case 'atualizarEstadoPedido': return atualizarEstadoPedido(req,input);
    case 'atualizarEstadoPedidoVendedor': return atualizarEstadoPedidoVendedor(req,input);
    case 'obterDashboardVendedor': return obterDashboardVendedor(req);
    case 'liberarSaldosVencidos': return liberarSaldosVencidos(req);
    case 'abrirDisputaFinanceira': return abrirDisputaFinanceira(req,input);
    case 'resolverDisputaFinanceira': return resolverDisputaFinanceira(req,input);
    case 'criarUploadAssinado': return criarUploadAssinado(req,input);
    case 'criarVideoVendedor': return criarVideoVendedor(req,input);
    case 'eliminarVideoVendedor': return eliminarVideoVendedor(req,input);
    case 'listarVideosParaModeracao': return listarVideosParaModeracao(req);
    case 'moderarVideoVendedor': return moderarVideoVendedor(req,input);
    case 'registarAcessoPublico': return registarAcessoPublico(req, input);
    case 'consultarMetricasAcesso': return consultarMetricasAcesso(req, input);
    case 'alterarDisponibilidadeProdutoVendedor': {const u=await requireSeller(req);const id=text(input?.produtoId,'Produto',128),ativo=input?.ativo===true;const {data:p}=await db.from('produtos').select('id,vendedor_id,status_aprovacao').eq('id',id).maybeSingle();if(!p||p.vendedor_id!==u.id||p.status_aprovacao!=='aprovado')err('Produto não encontrado, não aprovado ou sem permissão.','permission_denied');const {error}=await db.from('produtos').update({ativo,atualizado_em:new Date().toISOString()}).eq('id',id).eq('vendedor_id',u.id);if(error)throw error;return {ok:true,ativo};}
    case 'solicitarVendedor': {const u=await requireUser(req);const d={nome:text(input?.nome,'Nome',120),nomeLoja:text(input?.nomeLoja,'Nome da loja',120),telefone:text(input?.telefone,'Telefone',15),email:text(u.email,'Email',160),morada:text(input?.morada,'Morada',300,false),categoria:text(input?.categoria,'Categoria',80),descricao:text(input?.descricao,'Descrição',1000,false),status:'pendente',ativo:false,plano:'basico',uid:u.id};const {data:old}=await db.from('vendedores').select('status').eq('id',u.id).maybeSingle();if(old?.status==='aprovado'||old?.status==='pendente')return {ok:true,status:old.status};if(old?.status==='suspenso')err('A sua loja está suspensa. Contacte a VORA 313.','failed_precondition');const {error}=await db.from('vendedores').upsert({id:u.id,...d},{onConflict:'id'});if(error)throw error;return {ok:true,status:'pendente'};}
    case 'atualizarPerfilVendedor': {const u=await requireSeller(req);const perfilPublico=perfilPublicoSeguro(input?.perfilPublico);if(perfilPublico.editorialProdutoId){const {data:produto}=await db.from('produtos').select('id,vendedor_id,status_aprovacao,ativo').eq('id',perfilPublico.editorialProdutoId).maybeSingle();if(!produto||produto.vendedor_id!==u.id||produto.status_aprovacao!=='aprovado'||produto.ativo===false)err('O produto editorial deve ser um produto publicado da sua própria loja.','permission_denied');}const d={nome:text(input?.nome,'Nome',120),nomeLoja:text(input?.nomeLoja,'Nome da loja',120),telefone:text(input?.telefone,'Telefone',15),morada:text(input?.morada,'Morada',300,false),categoria:text(input?.categoria,'Categoria',80),descricao:text(input?.descricao,'Descrição',1000,false),perfilPublico,atualizado_em:new Date().toISOString()};const {error}=await db.from('vendedores').update(dbRow(d)).eq('id',u.id);if(error)throw error;await registarEventoSeguranca(u.id,'vendedor','perfil_publico_atualizado',u.id,{perfilPublico:true,estiloVitrine:perfilPublico.estiloVitrine});return {ok:true};}
    case 'atualizarDadosRecebimento': {const u=await requireSeller(req);const metodo=text(input?.metodo,'Método de recebimento',40),titular=text(input?.titular,'Titular',160),referencia=text(input?.referencia,'Conta/IBAN/telefone',160);if(!['transferencia_bancaria','multicaixa_express','outro'].includes(metodo))err('Método de recebimento inválido.');const {error}=await db.from('vendedores').update({dados_recebimento:{metodo,titular,referencia,atualizadoEm:new Date().toISOString()},atualizado_em:new Date().toISOString()}).eq('id',u.id);if(error)throw error;await registarEventoSeguranca(u.id,'vendedor','dados_recebimento_atualizados',u.id,{metodo});return {ok:true};}
    case 'criarProdutoVendedor': {const u=await requireSeller(req);const {data:v}=await db.from('vendedores').select('*').eq('id',u.id).maybeSingle();const estoque=Number(input?.estoque);if(!Number.isInteger(estoque)||estoque<0||estoque>100000)err('Estoque inválido.');const id=crypto.randomUUID();const preco=text(input?.preco,'Preço',60);const p={id,ordem:999999,nome:text(input?.nome,'Nome',160),categoria:text(input?.categoria,'Categoria',80),preco,preco_valor:money(priceCents(preco)),preco_antigo:text(input?.precoAntigo,'Preço antigo',60,false),desconto:text(input?.desconto,'Desconto',30,false),parcelas:text(input?.parcelas,'Parcelas',80,false),frete_gratis:input?.freteGratis===true,descricao:text(input?.descricao,'Descrição',3000),imagens:Array.isArray(input?.imagens)?input.imagens.slice(0,8):[],marca:text(input?.marca,'Marca',120,false),sku:text(input?.sku,'SKU',80,false),tag:text(input?.tag||input?.categoria,'Tag',80,false),estoque,variacoes:variacoesSeguras(input?.variacoes),vendedor_id:u.id,vendedor_nome:v?.nome_loja||v?.nome,status_aprovacao:'aguardando_aprovacao',ativo:false,vendedor_ativo:true,monetizacao:{destaque:false}};const {error}=await db.from('produtos').insert(p);if(error)throw error;await db.from('vendedores').update({total_produtos:Number(v?.total_produtos||0)+1}).eq('id',u.id);return {ok:true,produtoId:id,status:p.status_aprovacao};}
    case 'atualizarProdutoVendedor': {const u=await requireSeller(req);const id=text(input?.produtoId,'Produto',128);const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p||p.vendedor_id!==u.id)err('Produto não pertence à sua loja.','permission_denied');const x=input?.produto||{};const estoque=Number(x.estoque);if(!Number.isInteger(estoque)||estoque<0||estoque>100000)err('Estoque inválido.');const preco=text(x.preco,'Preço',60);const patch={nome:text(x.nome,'Nome',160),categoria:text(x.categoria,'Categoria',80),preco,preco_valor:money(priceCents(preco)),preco_antigo:text(x.precoAntigo,'Preço antigo',60,false),desconto:text(x.desconto,'Desconto',30,false),parcelas:text(x.parcelas,'Parcelas',80,false),frete_gratis:x.freteGratis===true,descricao:text(x.descricao,'Descrição',3000),imagens:Array.isArray(x.imagens)?x.imagens.slice(0,8):[],marca:text(x.marca,'Marca',120,false),sku:text(x.sku,'SKU',80,false),tag:text(x.tag,'Tag',80,false),estoque,variacoes:variacoesSeguras(x.variacoes),status_aprovacao:'aguardando_aprovacao',ativo:false,vendedor_ativo:true,motivo_recusa:null,revisado_em:null,revisado_por:null,revisado_por_email:null,revisao_notas:null,revisao_checklist:null,atualizado_em:new Date().toISOString()};const {error}=await db.from('produtos').update(patch).eq('id',id);if(error)throw error;return {ok:true,status:'aguardando_aprovacao'};}
    case 'solicitarDestaque': {const u=await requireSeller(req);const id=text(input?.produtoId,'Produto',128),dias=Number(input?.dias),precos:any={7:5000,15:9000,30:15000};if(!precos[dias])err('Período de destaque inválido.');const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p||p.vendedor_id!==u.id||p.status_aprovacao!=='aprovado'||p.ativo!==true)err('Produto não está aprovado e publicado.','permission_denied');const {data:exist}=await db.from('destaques_solicitados').select('*').eq('uid_vendedor',u.id).eq('produto_id',id);if((exist||[]).some((d:any)=>['aguardando_pagamento','pendente'].includes(d.status)||(d.status==='ativo'&&d.fim&&new Date(d.fim)>new Date())))err('Já existe uma solicitação ativa ou pendente.','already_exists');const {data:row,error}=await db.from('destaques_solicitados').insert({uid_vendedor:u.id,produto_id:id,nome_produto:p.nome,dias,valor:precos[dias],status:'aguardando_pagamento'}).select('id,valor').single();if(error)throw error;return {ok:true,requestId:row.id,valor:row.valor};}
    case 'solicitarLevantamento': {const u=await requireSeller(req);const informado=input?.valor;const valor=informado===undefined||informado===null||informado===''?null:Number(informado);if(valor!==null&&(!Number.isFinite(valor)||valor<=0))err('Valor de levantamento inválido.','failed_precondition');const {data,error}=await db.rpc('solicitar_levantamento_atomico',{p_vendedor:u.id,p_valor:valor});if(error)throw error;await registarEventoSeguranca(u.id,'vendedor','levantamento_solicitado',u.id,{});return camelRow(data);}
    case 'gerirVendedor': {const admin=await requireAdmin(req);const uid=text(input?.uid,'Vendedor',128),acao=text(input?.acao,'Ação',30),motivoRecusa=text(input?.motivoRecusa,'Motivo da recusa',600,false);if(!['aprovar','reativar','recusar','suspender'].includes(acao))err('Ação inválida.');const status=acao==='aprovar'||acao==='reativar'?'aprovado':acao==='recusar'?'recusado':'suspenso';const ativo=status==='aprovado';const userDb=dbDoUtilizador(req);const {error}=await userDb.from('vendedores').update({status,ativo,motivo_recusa:acao==='recusar'?motivoRecusa:null,atualizado_em:new Date().toISOString()}).eq('id',uid);if(error)throw error;const {error:produtosError}=await userDb.from('produtos').update({vendedor_ativo:ativo}).eq('vendedor_id',uid);if(produtosError)throw produtosError;await registarEventoSeguranca(admin.id,'vendedor','estado_vendedor_alterado',uid,{acao,status});return {ok:true,status};}
    case 'aprovarProdutoVendedor': return moderarProdutoVendedor(req, input);
    case 'eliminarProdutoVendedorAdmin': return eliminarProdutoVendedorAdmin(req, input);
    case 'eliminarCatalogoVendedorAdmin': return eliminarCatalogoVendedorAdmin(req, input);
    case 'administrarProdutoVendedor': return administrarProdutoVendedor(req, input);
    case 'definirDestaqueManual': {const admin=await requireAdmin(req);const id=text(input?.produtoId,'Produto',128),ativo=input?.ativo===true;const {data:p}=await db.from('produtos').select('*').eq('id',id).maybeSingle();if(!p)err('Produto não encontrado.','not_found');if(ativo&&p.vendedor_id){const {data:v}=await db.from('vendedores').select('status,ativo').eq('id',p.vendedor_id).maybeSingle();if(!v||v.status!=='aprovado'||p.status_aprovacao!=='aprovado')err('O vendedor/produto não está aprovado.','failed_precondition');}const m={...(p.monetizacao||{}),destaque:ativo,destaqueInicio:ativo?new Date().toISOString():null,destaqueFim:ativo?new Date(Date.now()+30*86400000).toISOString():null,atualizadoEm:new Date().toISOString()};const {error}=await db.from('produtos').update({monetizacao:m,atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;await registarEventoSeguranca(admin.id,'vendedor','destaque_manual_alterado',id,{ativo});return {ok:true,ativo};}
    case 'processarDestaque': {const admin=await requireAdmin(req);const id=text(input?.requestId,'Solicitação',128),acao=text(input?.acao,'Ação',20);const {data:d}=await db.from('destaques_solicitados').select('*').eq('id',id).maybeSingle();if(!d)err('Solicitação não encontrada.','not_found');if(!['aguardando_pagamento','pendente'].includes(d.status))err('Esta solicitação já foi processada.','failed_precondition');if(acao==='recusar'){await db.from('destaques_solicitados').update({status:'recusado',atualizado_em:new Date().toISOString()}).eq('id',id);await registarEventoSeguranca(admin.id,'vendedor','destaque_processado',id,{acao});return {ok:true};}if(acao!=='aprovar')err('Ação inválida.');const inicio=new Date(),fim=new Date(inicio.getTime()+Number(d.dias)*86400000);const {error}=await db.from('destaques_solicitados').update({status:'ativo',inicio:inicio.toISOString(),fim:fim.toISOString(),atualizado_em:inicio.toISOString()}).eq('id',id);if(error)throw error;const {data:p}=await db.from('produtos').select('monetizacao').eq('id',d.produto_id).maybeSingle();await db.from('produtos').update({monetizacao:{...(p?.monetizacao||{}),destaque:true,destaqueInicio:inicio.toISOString(),destaqueFim:fim.toISOString(),destaqueSolicitacaoId:id},atualizado_em:inicio.toISOString()}).eq('id',d.produto_id);await registarEventoSeguranca(admin.id,'vendedor','destaque_processado',id,{acao});return {ok:true,fim:fim.toISOString()};}
    case 'definirPlanoVendedor': {const admin=await requireAdmin(req);const uid=text(input?.uid,'Vendedor',128),plano=text(input?.plano,'Plano',20).toLowerCase();if(!['basico','profissional','premium'].includes(plano))err('Plano inválido.');const {error}=await db.from('vendedores').update({plano,atualizado_em:new Date().toISOString()}).eq('id',uid);if(error)throw error;await registarEventoSeguranca(admin.id,'vendedor','plano_vendedor_alterado',uid,{plano});return {ok:true,plano};}
    case 'processarLevantamento': {const admin=await requireAdmin(req);const id=text(input?.levantamentoId,'Levantamento',128),acao=text(input?.acao,'Ação',20),nota=text(input?.nota,'Nota',600,false),comprovativoUrl=text(input?.comprovativoUrl,'Comprovativo',1200,false);if(!['aprovar','recusar'].includes(acao))err('Ação inválida.');const {data,error}=await db.rpc('processar_levantamento_atomico',{p_levantamento_id:id,p_acao:acao,p_nota:nota||null,p_comprovativo_url:comprovativoUrl||null,p_processado_por:admin.id});if(error)throw error;await registarEventoSeguranca(admin.id,'pagamento','levantamento_processado',id,{acao});return camelRow(data);}
    case 'adicionarAvaliacao': {
      const u = await requireUser(req);
      const tipo = text(input?.tipo || 'produto', 'Tipo', 20).toLowerCase();
      const nota = Number(input?.nota);
      const comentario = text(input?.comentario, 'Comentário', 1000, false);
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) err('Nota inválida.');
      await consumirLimite(u.id, 'adicionar_avaliacao', 20, 24 * 60 * 60);
      const userDb = dbDoUtilizador(req);
      if (tipo === 'produto') {
        const produtoId = text(input?.produtoId, 'Produto', 128);
        const itemId = text(input?.itemId, 'Item da compra', 80);
        const { data, error } = await userDb.rpc('registrar_avaliacao_produto', { p_produto_id: produtoId, p_venda_item_id: itemId, p_nota: nota, p_comentario: comentario || null });
        if (error) {
          if (error.code === '23505') err('Este item já foi avaliado.', 'already_exists');
          if (error.code === '42501') err(error.message || 'Esta compra não pode ser avaliada.', 'permission_denied');
          throw error;
        }
        await registarEventoSeguranca(u.id, 'avaliacao', 'produto_avaliado', produtoId, { nota });
        return { ok: true, tipo, avaliacao: camelRow(data) };
      }
      if (tipo === 'vendedor') {
        const pedidoId = text(input?.pedidoId, 'Pedido', 128);
        const vendedorId = text(input?.vendedorId, 'Vendedor', 80);
        const { data, error } = await userDb.rpc('registrar_avaliacao_vendedor', { p_venda_id: pedidoId, p_vendedor_id: vendedorId, p_nota: nota, p_comentario: comentario || null });
        if (error) {
          if (error.code === '23505') err('Este vendedor já foi avaliado neste pedido.', 'already_exists');
          if (error.code === '42501') err(error.message || 'Este pedido não pode ser avaliado.', 'permission_denied');
          throw error;
        }
        await registarEventoSeguranca(u.id, 'avaliacao', 'vendedor_avaliado', vendedorId, { nota, pedidoId });
        return { ok: true, tipo, avaliacao: camelRow(data) };
      }
      err('Tipo de avaliação inválido.');
    }

    case 'criarPagamentoMulticaixa': case 'consultarPagamentoMulticaixa': case 'criarPagamentoCartao': case 'consultarPagamentoCartao': err(`Integração de pagamento "${name}" ainda não está configurada no backend Supabase.`,'not_configured');
    default: err(`Função "${name}" não existe no backend Supabase.`,'not_found');
  }
}

Deno.serve(async (req)=>{
  const headers = cors(req);
  const origem = req.headers.get('Origin');
  if (origem && !ORIGENS_PERMITIDAS.has(origem)) return new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Origem não autorizada.' } }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } });
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method !== 'POST') return new Response(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Use POST.' } }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) return new Response(JSON.stringify({ error: { code: 'unsupported_media_type', message: 'Envie JSON.' } }), { status: 415, headers: { ...headers, 'Content-Type': 'application/json' } });
  try {
    const body = await lerCorpo(req);
    const result = await handle(req, String(body?.name || ''), body?.data || {});
    return new Response(JSON.stringify({ data: camelRow(result) }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (causa) {
    const erro: any = causa;
    const codigoRecebido = typeof erro?.code === 'string' ? erro.code : 'internal';
    const codigosPublicos = new Set([
      'bad_request', 'payload_too_large', 'resource_exhausted', 'unauthenticated',
      'permission_denied', 'not_found', 'already_exists', 'failed_precondition',
      'unsupported_media_type', 'method_not_allowed', 'not_configured'
    ]);
    const codigo = codigosPublicos.has(codigoRecebido) ? codigoRecebido : 'internal';
    const status = codigo === 'payload_too_large' ? 413
      : codigo === 'resource_exhausted' ? 429
      : codigo === 'unauthenticated' ? 401
      : codigo === 'permission_denied' ? 403
      : codigo === 'not_found' ? 404
      : codigo === 'already_exists' || codigo === 'failed_precondition' ? 409
      : codigo === 'unsupported_media_type' ? 415
      : codigo === 'method_not_allowed' ? 405
      : codigo === 'not_configured' ? 501
      : codigo === 'internal' ? 500 : 400;
    console.error('Erro da API.', codigo, detalhesErroParaLog(erro));
    const mensagem = codigo === 'internal'
      ? 'Não foi possível concluir a operação. Tente novamente.'
      : String(erro?.message || 'Pedido inválido.');
    return new Response(JSON.stringify({ error: { code: codigo, message: mensagem } }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
});
