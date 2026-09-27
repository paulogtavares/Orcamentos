/**
 * C.O · Central de Orçamentos
 * Precificação de Projetos, Fullcommerce e Fulfillment — Infracommerce.
 * Mesmo padrão do C.P: Node.js puro (sem dependências), SPA em index.html, dados em JSON.
 *
 * Variáveis de ambiente (Railway/Render):
 *   PORT       — definida automaticamente pelo Railway
 *   DATA_DIR   — pasta do banco JSON (no Railway, aponte para um Volume, ex: /data)
 *   APP_USER   — (opcional) usuário para login básico
 *   APP_PASS   — (opcional) senha para login básico
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const Calc  = require('./calc.js');

// ── Versão lida do package.json (fonte da verdade) ────────────────────────────
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const APP_VERSION = PKG.version   || '0.0.0';
const APP_BUILD   = PKG.buildDate || '—';

const PORT     = process.env.PORT || 3333;
const IS_CLOUD = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || process.env.CLOUD === '1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
const AUTH     = process.env.APP_USER && process.env.APP_PASS
  ? 'Basic ' + Buffer.from(`${process.env.APP_USER}:${process.env.APP_PASS}`).toString('base64')
  : null;

function log(...a) { console.log(new Date().toLocaleTimeString('pt-BR'), ...a); }
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

// Percentual de GP sobre a soma das horas (valores de exemplo — ajustáveis em Parâmetros)
const SETTINGS_GP = { gpDedicadoPct: 25, gpCompartilhadoPct: 10 };

// ── Seed inicial (baseado na planilha H Stern – Lume) ─────────────────────────
function seedDb() {
  const perfis = [
    { id: 'pf_design', nome: 'Designer',                categoria: 'Design',       moeda: 'BRL', custoHora: 85.57 },
    { id: 'pf_pm',     nome: 'Project Manager',         categoria: 'Squad LATAM',  moeda: 'USD', custoHora: 22 },
    { id: 'pf_tl',     nome: 'Technical Leader',        categoria: 'Squad LATAM',  moeda: 'USD', custoHora: 22 },
    { id: 'pf_fe',     nome: 'Front-end Developer',     categoria: 'Squad LATAM',  moeda: 'USD', custoHora: 22 },
    { id: 'pf_qa',     nome: 'Quality Assurance',       categoria: 'Squad LATAM',  moeda: 'USD', custoHora: 22 },
    { id: 'pf_gp',     nome: 'GP + Analista 100%',      categoria: 'Gestão',       moeda: 'BRL', custoHora: 195 },
    { id: 'pf_bo',     nome: 'Backoffice',              categoria: 'Operação',     moeda: 'BRL', custoHora: 136 },
    { id: 'pf_sac',    nome: 'SAC',                     categoria: 'Operação',     moeda: 'BRL', custoHora: 136 },
    { id: 'pf_transp', nome: 'Transportes',             categoria: 'Operação',     moeda: 'BRL', custoHora: 136 },
    { id: 'pf_pay',    nome: 'Payments',                categoria: 'Operação',     moeda: 'BRL', custoHora: 136 },
  ].map(p => ({ ...p, ativo: true }));

  const H = (id, nome, perfilId, area, grupo, natureza = 'setup') =>
    ({ id, nome, area, grupo: grupo || '', tipoCobranca: 'hora', natureza, perfilId, unidade: 'hora' });
  const U = (id, nome, area, custoUnit, unidade, natureza, tipoCobranca = 'unidade', grupo = '') =>
    ({ id, nome, area, grupo, tipoCobranca, natureza, custoUnit, unidade, moeda: 'BRL' });

  const servicos = [
    H('sv_pm',     'Project Manager',     'pf_pm',     'Tecnologia', 'Squad Dev'),
    H('sv_tl',     'Technical Leader',    'pf_tl',     'Tecnologia', 'Squad Dev'),
    H('sv_fe',     'Front-end Developer', 'pf_fe',     'Tecnologia', 'Squad Dev'),
    H('sv_qa',     'Quality Assurance',   'pf_qa',     'Tecnologia', 'Squad Dev'),
    H('sv_design', 'Design',              'pf_design', 'Tecnologia'),
    H('sv_gp',     'GP',                  'pf_gp',     'Gestão'),
    H('sv_bo',     'Backoffice',          'pf_bo',     'Operação'),
    H('sv_pay',    'Payments',            'pf_pay',    'Operação'),
    H('sv_sac',    'SAC',                 'pf_sac',    'Operação'),
    H('sv_transp', 'Transportes',         'pf_transp', 'Operação'),
    // Fulfillment (valores de exemplo — validar com Logística)
    U('sv_onb',     'Onboarding e integração WMS', 'Logística',  3500,  'projeto',       'setup',    'fixo'),
    U('sv_arm',     'Armazenagem',                 'Logística',  45,    'posição-pallet','variavel'),
    U('sv_rec',     'Recebimento',                 'Logística',  0.35,  'unidade',       'variavel'),
    U('sv_pick',    'Picking',                     'Logística',  0.90,  'item',          'variavel'),
    U('sv_pack',    'Packing',                     'Logística',  2.50,  'pedido',        'variavel'),
    U('sv_emb',     'Embalagem',                   'Logística',  1.80,  'pedido',        'variavel'),
    U('sv_exp',     'Expedição',                   'Logística',  0.60,  'pedido',        'variavel'),
    // Fullcommerce (valores de exemplo)
    U('sv_gest',    'Gestão de conta',             'Gestão',     2500,  'mês',           'mensal',   'fixo'),
    U('sv_lic',     'Licença de plataforma',       'Tecnologia', 3000,  'mês',           'mensal',   'fixo'),
    U('sv_host',    'Hospedagem e CDN',            'Tecnologia', 800,   'mês',           'mensal',   'fixo'),
    U('sv_gw',      'Gateway e antifraude',        'Operação',   1.2,   '% GMV',         'variavel', 'percentual'),
  ];

  const T = (servicoId, qtd, extra = {}) => ({ servicoId, qtd, qtdModo: 'fixa', ...extra });
  const P = (servicoId, fator, extra = {}) => ({ servicoId, qtd: 0, qtdModo: 'porPedido', fator, ...extra });
  // GP em % da soma das demais horas da mesma natureza
  const G = (servicoId, alocacao, percHoras, extra = {}) => ({ servicoId, qtd: 0, qtdModo: 'percHoras', alocacao, percHoras, ...extra });

  const templates = [
    {
      id: 'tp_lume', nome: 'Fast Template Lume – Filial', modelo: 'projeto',
      descricao: 'Front de loja com fast template. Réplica da planilha H Stern (Design corrigido para 80h; GP = 24,71% das horas = 126h).',
      params: { modoPreco: 'markup', margem: 0.30, imposto: 0, contingencia: 0, meses: 0 },
      itens: [T('sv_pm', 40), T('sv_tl', 30), T('sv_fe', 160), T('sv_qa', 30), T('sv_design', 80),
              G('sv_gp', 'personalizado', 24.71), T('sv_bo', 80), T('sv_pay', 10), T('sv_sac', 40), T('sv_transp', 40)],
    },
    {
      id: 'tp_ful', nome: 'Fulfillment – Operação padrão', modelo: 'fulfillment',
      descricao: 'Armazenagem, recebimento, picking, packing e expedição com volume projetado.',
      params: { modoPreco: 'margem', margem: 0.25, imposto: 0.15, contingencia: 0.05, meses: 12, pedidosMes: 5000, gmvMes: 0, feeGmv: 0 },
      itens: [T('sv_onb', 1), T('sv_gp', 40), T('sv_arm', 120), P('sv_rec', 1.5), P('sv_pick', 1.8),
              P('sv_pack', 1), P('sv_emb', 1), P('sv_exp', 1), T('sv_gest', 1)],
    },
    {
      id: 'tp_full', nome: 'Fullcommerce – Loja completa', modelo: 'fullcommerce',
      descricao: 'Implantação da loja + operação ponta a ponta (backoffice, SAC, pagamentos, logística).',
      params: { modoPreco: 'margem', margem: 0.28, imposto: 0.15, contingencia: 0.05, meses: 24, pedidosMes: 3000, gmvMes: 900000, feeGmv: 3 },
      itens: [T('sv_pm', 60), T('sv_tl', 50), T('sv_fe', 240), T('sv_qa', 50), T('sv_design', 120), G('sv_gp', 'dedicado', 25),
              T('sv_bo', 160, { natureza: 'mensal' }), T('sv_sac', 176, { natureza: 'mensal' }),
              T('sv_pay', 20, { natureza: 'mensal' }), T('sv_transp', 40, { natureza: 'mensal' }),
              T('sv_lic', 1), T('sv_host', 1), T('sv_gest', 1),
              T('sv_arm', 80), P('sv_rec', 1.5), P('sv_pick', 1.6), P('sv_pack', 1), P('sv_emb', 1), P('sv_exp', 1),
              T('sv_gw', 1)],
    },
  ];

  return {
    meta: { createdAt: now(), seq: 0 },
    settings: {
      empresa: 'Infracommerce',
      cambio: { usd: 5.01, fonte: 'manual', atualizadoEm: now() },
      margemAlvo: 0.30, margemMinima: 0.20, impostoPadrao: 0.15, contingenciaPadrao: 0.05,
      modoPrecoPadrao: 'margem', validadeDias: 30,
      ...SETTINGS_GP,
    },
    perfis, servicos, templates, orcamentos: [],
  };
}

// ── Banco JSON (escrita atômica) ──────────────────────────────────────────────
let db = null;
function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Migração v1.2.0: percentuais de GP dedicado/compartilhado
    let migrou = false;
    Object.entries(SETTINGS_GP).forEach(([k, v]) => { if (db.settings[k] === undefined) { db.settings[k] = v; migrou = true; } });
    if (migrou) { saveDb(); log('[db] migração: percentuais de GP adicionados aos parâmetros'); }
    log(`[db] carregado: ${db.orcamentos.length} orçamentos, ${db.servicos.length} serviços`);
  } catch {
    db = seedDb();
    saveDb();
    log('[db] primeira execução — banco criado com dados de exemplo');
  }
}
function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ── Helpers HTTP ──────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function json(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 20e6) { reject(new Error('Payload muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
  });
}
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' }, timeout: 8000 }, r => {
      let raw = ''; r.on('data', c => raw += c);
      r.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Resposta inválida do BCB')); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('Timeout BCB')); });
  });
}

// ── Câmbio PTAX (Banco Central) ───────────────────────────────────────────────
async function fetchPtax() {
  for (let back = 0; back < 7; back++) {
    const d = new Date(Date.now() - back * 864e5);
    const mmddyyyy = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mmddyyyy}'&$format=json`;
    const data = await httpsGetJson(url);
    const v = data?.value?.[0];
    if (v && v.cotacaoVenda) return { usd: Number(v.cotacaoVenda), dataCotacao: v.dataHoraCotacao };
  }
  throw new Error('PTAX não encontrada nos últimos 7 dias');
}

// ── Regras de domínio ─────────────────────────────────────────────────────────
function perfilById(id) { return db.perfis.find(p => p.id === id); }

// Congela custos do serviço no item (orçamentos antigos não mudam quando a tabela muda)
function snapshotItem(sv, over = {}) {
  const pf = sv.tipoCobranca === 'hora' ? perfilById(sv.perfilId) : null;
  return {
    uid: uid('it'),
    servicoId: sv.id, nome: sv.nome, area: sv.area, grupo: sv.grupo || '',
    tipoCobranca: sv.tipoCobranca, natureza: over.natureza || sv.natureza,
    unidade: sv.unidade, perfilId: pf?.id || null, perfilNome: pf?.nome || null,
    moeda: pf ? pf.moeda : (sv.moeda || 'BRL'),
    custoUnit: pf ? pf.custoHora : sv.custoUnit,
    qtd: over.qtd ?? 1, qtdModo: over.qtdModo || 'fixa', fator: over.fator ?? 0,
    alocacao: over.alocacao || null,
    percHoras: over.alocacao === 'dedicado' ? db.settings.gpDedicadoPct
             : over.alocacao === 'compartilhado' ? db.settings.gpCompartilhadoPct
             : (over.percHoras ?? 0),
  };
}

function nextNumero() {
  db.meta.seq = (db.meta.seq || 0) + 1;
  return `ORC-${new Date().getFullYear()}-${String(db.meta.seq).padStart(4, '0')}`;
}

function novoOrcamento(b) {
  const s = db.settings;
  const tp = b.templateId ? db.templates.find(t => t.id === b.templateId) : null;
  const itens = [];
  if (tp) tp.itens.forEach(ti => {
    const sv = db.servicos.find(x => x.id === ti.servicoId);
    if (sv) itens.push(snapshotItem(sv, ti));
  });
  const validade = new Date(Date.now() + (s.validadeDias || 30) * 864e5).toISOString().slice(0, 10);
  const orc = {
    id: uid('orc'), numero: nextNumero(),
    cliente: b.cliente || 'Novo cliente', projeto: b.projeto || tp?.nome || 'Novo orçamento',
    modelo: b.modelo || tp?.modelo || 'projeto', responsavel: b.responsavel || '',
    status: 'rascunho', validade, templateId: tp?.id || null,
    cambio: s.cambio.usd,
    params: Object.assign({
      modoPreco: s.modoPrecoPadrao, margem: s.margemAlvo, imposto: s.impostoPadrao,
      contingencia: s.contingenciaPadrao, meses: 12, pedidosMes: 0, gmvMes: 0, feeGmv: 0,
    }, tp?.params || {}),
    premissas: '', itens, versoes: [],
    historico: [{ data: now(), acao: tp ? `Criado a partir do template "${tp.nome}"` : 'Criado em branco' }],
    criadoEm: now(), atualizadoEm: now(),
  };
  orc.resumo = Calc.resumo(orc);
  return orc;
}

// CRUD genérico para coleções de cadastro
const COLLECTIONS = { perfis: 'pf', servicos: 'sv', templates: 'tp' };
async function handleCollection(req, res, name, id) {
  const col = db[name];
  if (req.method === 'GET') { json(res, 200, id ? col.find(x => x.id === id) || null : col); return; }
  if (req.method === 'POST' && !id) {
    const b = await readBody(req);
    const item = { ...b, id: uid(COLLECTIONS[name]) };
    if (name === 'perfis' && item.ativo === undefined) item.ativo = true;
    col.push(item); saveDb(); json(res, 201, item); return;
  }
  const idx = col.findIndex(x => x.id === id);
  if (idx < 0) { json(res, 404, { error: 'Registro não encontrado.' }); return; }
  if (req.method === 'PUT') {
    const b = await readBody(req);
    col[idx] = { ...col[idx], ...b, id }; saveDb(); json(res, 200, col[idx]); return;
  }
  if (req.method === 'DELETE') {
    if (name === 'perfis' && db.servicos.some(s => s.perfilId === id)) {
      json(res, 409, { error: 'Este perfil é usado por serviços do catálogo. Desative-o em vez de excluir.' }); return;
    }
    if (name === 'servicos' && db.templates.some(t => t.itens.some(i => i.servicoId === id))) {
      json(res, 409, { error: 'Este serviço está em um template. Remova-o do template antes de excluir.' }); return;
    }
    col.splice(idx, 1); saveDb(); json(res, 200, { ok: true }); return;
  }
  json(res, 405, { error: 'Método não suportado.' });
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
function serveFile(res, file, type) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) { json(res, 404, { error: `${file} não encontrado` }); return; }
  cors(res); res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(p, 'utf8'));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // Login básico opcional (APP_USER / APP_PASS)
  if (AUTH && req.headers.authorization !== AUTH) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Orcamentos"' }); res.end('Acesso restrito'); return;
  }

  if (pathname === '/' || pathname === '/index.html') return serveFile(res, 'index.html', 'text/html');
  if (pathname === '/calc.js') return serveFile(res, 'calc.js', 'application/javascript');

  if (pathname === '/api/status') {
    json(res, 200, { running: true, cloud: IS_CLOUD, version: APP_VERSION, buildDate: APP_BUILD, port: PORT, auth: !!AUTH, dataDir: IS_CLOUD ? undefined : DATA_DIR });
    return;
  }

  // Tudo de uma vez (o volume é pequeno, igual ao cache do C.P)
  if (pathname === '/api/db' && req.method === 'GET') { json(res, 200, db); return; }

  if (pathname === '/api/settings' && req.method === 'PUT') {
    const b = await readBody(req);
    db.settings = { ...db.settings, ...b, cambio: { ...db.settings.cambio, ...(b.cambio || {}) } };
    saveDb(); json(res, 200, db.settings); return;
  }

  if (pathname === '/api/cambio/ptax' && req.method === 'POST') {
    try {
      const r = await fetchPtax();
      db.settings.cambio = { usd: r.usd, fonte: 'PTAX BCB', dataCotacao: r.dataCotacao, atualizadoEm: now() };
      saveDb(); log(`[câmbio] PTAX ${r.usd}`);
      json(res, 200, db.settings.cambio);
    } catch (e) {
      json(res, 502, { error: `Não foi possível consultar a PTAX: ${e.message}. Informe o câmbio manualmente.` });
    }
    return;
  }

  // Cadastros: /api/perfis, /api/servicos, /api/templates (+ /:id)
  const mCol = pathname.match(/^\/api\/(perfis|servicos|templates)(?:\/([\w-]+))?$/);
  if (mCol) return handleCollection(req, res, mCol[1], mCol[2]);

  // Orçamentos
  if (pathname === '/api/orcamentos' && req.method === 'GET') { json(res, 200, db.orcamentos); return; }
  if (pathname === '/api/orcamentos' && req.method === 'POST') {
    const orc = novoOrcamento(await readBody(req));
    db.orcamentos.unshift(orc); saveDb(); log(`[orc] ${orc.numero} criado`);
    json(res, 201, orc); return;
  }

  const mOrc = pathname.match(/^\/api\/orcamentos\/([\w-]+)(?:\/(status|versao|duplicar|item|atualizar-custos))?$/);
  if (mOrc) {
    const idx = db.orcamentos.findIndex(o => o.id === mOrc[1]);
    if (idx < 0) { json(res, 404, { error: 'Orçamento não encontrado.' }); return; }
    const orc = db.orcamentos[idx];
    const action = mOrc[2];
    const bloqueado = ['enviado', 'aceito'].includes(orc.status);

    if (!action && req.method === 'GET') { json(res, 200, orc); return; }

    if (!action && req.method === 'PUT') {
      if (bloqueado) { json(res, 409, { error: `Orçamento ${orc.status}. Volte para rascunho para editar.` }); return; }
      const b = await readBody(req);
      ['cliente', 'projeto', 'modelo', 'responsavel', 'validade', 'cambio', 'params', 'premissas', 'itens']
        .forEach(k => { if (b[k] !== undefined) orc[k] = b[k]; });
      orc.itens.forEach(it => { if (!it.uid) it.uid = uid('it'); });
      // Qualquer edição após aprovação volta para rascunho
      if (orc.status === 'aprovado' || orc.status === 'em_aprovacao') {
        orc.status = 'rascunho'; orc.historico.push({ data: now(), acao: 'Editado após aprovação — voltou para rascunho' });
      }
      orc.atualizadoEm = now(); orc.resumo = Calc.resumo(orc);
      saveDb(); json(res, 200, orc); return;
    }

    if (!action && req.method === 'DELETE') {
      db.orcamentos.splice(idx, 1); saveDb(); json(res, 200, { ok: true }); return;
    }

    if (action === 'item' && req.method === 'POST') {
      if (bloqueado) { json(res, 409, { error: 'Orçamento bloqueado para edição.' }); return; }
      const b = await readBody(req);
      const sv = db.servicos.find(s => s.id === b.servicoId);
      if (!sv) { json(res, 404, { error: 'Serviço não encontrado.' }); return; }
      orc.itens.push(snapshotItem(sv, b));
      orc.atualizadoEm = now(); orc.resumo = Calc.resumo(orc);
      saveDb(); json(res, 200, orc); return;
    }

    if (action === 'atualizar-custos' && req.method === 'POST') {
      if (bloqueado) { json(res, 409, { error: 'Orçamento bloqueado para edição.' }); return; }
      let n = 0;
      orc.itens.forEach(it => {
        const sv = db.servicos.find(s => s.id === it.servicoId); if (!sv) return;
        const snap = snapshotItem(sv);
        if (snap.custoUnit !== it.custoUnit || snap.moeda !== it.moeda) n++;
        it.custoUnit = snap.custoUnit; it.moeda = snap.moeda; it.perfilNome = snap.perfilNome;
      });
      // Reaplica os percentuais vigentes de GP dedicado / compartilhado
      orc.itens.forEach(it => {
        if (it.qtdModo !== 'percHoras') return;
        const novo = it.alocacao === 'dedicado' ? db.settings.gpDedicadoPct : it.alocacao === 'compartilhado' ? db.settings.gpCompartilhadoPct : null;
        if (novo != null && novo !== it.percHoras) { it.percHoras = novo; n++; }
      });
      orc.cambio = db.settings.cambio.usd;
      orc.historico.push({ data: now(), acao: `Custos e câmbio atualizados pela tabela vigente (${n} itens alterados)` });
      orc.atualizadoEm = now(); orc.resumo = Calc.resumo(orc);
      saveDb(); json(res, 200, orc); return;
    }

    if (action === 'status' && req.method === 'POST') {
      const b = await readBody(req);
      const err = Calc.validarTransicao(orc, b.status, db.settings);
      if (err) { json(res, 422, { error: err }); return; }
      const de = orc.status;
      orc.status = b.status;
      if (b.status === 'enviado') {
        orc.versoes.push({ v: orc.versoes.length + 1, data: now(), resumo: Calc.resumo(orc), snapshot: JSON.parse(JSON.stringify({ itens: orc.itens, params: orc.params, cambio: orc.cambio })) });
      }
      orc.historico.push({ data: now(), acao: `${Calc.STATUS[de].label} → ${Calc.STATUS[b.status].label}${b.comentario ? ` · "${b.comentario}"` : ''}`, por: b.por || '' });
      orc.atualizadoEm = now(); saveDb(); json(res, 200, orc); return;
    }

    if (action === 'versao' && req.method === 'POST') {
      orc.versoes.push({ v: orc.versoes.length + 1, data: now(), resumo: Calc.resumo(orc), snapshot: JSON.parse(JSON.stringify({ itens: orc.itens, params: orc.params, cambio: orc.cambio })) });
      orc.historico.push({ data: now(), acao: `Versão ${orc.versoes.length} salva` });
      saveDb(); json(res, 200, orc); return;
    }

    if (action === 'duplicar' && req.method === 'POST') {
      const copia = JSON.parse(JSON.stringify(orc));
      Object.assign(copia, { id: uid('orc'), numero: nextNumero(), status: 'rascunho', versoes: [], criadoEm: now(), atualizadoEm: now(),
        projeto: `${orc.projeto} (cópia)`, historico: [{ data: now(), acao: `Duplicado de ${orc.numero}` }] });
      copia.itens.forEach(it => it.uid = uid('it'));
      db.orcamentos.unshift(copia); saveDb(); json(res, 201, copia); return;
    }
  }

  // Backup / restauração (mesma filosofia do rollback por ZIP do C.P)
  if (pathname === '/api/backup' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="co-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    res.end(JSON.stringify(db, null, 2)); return;
  }
  if (pathname === '/api/restore' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b || !Array.isArray(b.orcamentos) || !Array.isArray(b.perfis) || !b.settings) {
      json(res, 400, { error: 'Arquivo de backup inválido.' }); return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(DB_FILE, path.join(DATA_DIR, `db-antes-restore-${Date.now()}.json`));
    db = b; saveDb(); log('[db] restaurado a partir de backup');
    json(res, 200, { ok: true }); return;
  }

  json(res, 404, { error: `Rota não encontrada: ${pathname}` });
}

// ── Start ─────────────────────────────────────────────────────────────────────
loadDb();

const server = http.createServer(async (req, res) => {
  try { await handleRequest(req, res); }
  catch (e) { log('Erro interno:', e.message); json(res, 500, { error: e.message }); }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`\n  Servidor já rodando em http://localhost:${PORT}\n`); process.exit(0); }
  console.error('Erro fatal:', e.message); process.exit(1);
});

const HOST = IS_CLOUD ? '0.0.0.0' : '127.0.0.1';
server.listen(PORT, HOST, () => {
  if (IS_CLOUD) {
    console.log(`\n  Orçamentos v${APP_VERSION} (${APP_BUILD}) — porta ${PORT}\n`);
  } else {
    console.log('');
    console.log('  ============================================');
    console.log(`   Orçamentos  v${APP_VERSION} · ${APP_BUILD}`);
    console.log('  ============================================');
    console.log('');
    log(`Dados: ${DB_FILE}`);
    log(`Pronto: http://localhost:${PORT}`);
    log('NÃO feche esta janela enquanto estiver usando. Para parar: Ctrl+C');
  }
});

process.on('SIGINT',  () => { console.log('\n  Encerrado.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n  Encerrado.'); process.exit(0); });
