/**
 * Testes do C.O — rode com: node test.js
 * 1) Motor de cálculo reproduz a planilha H Stern – Lume
 * 2) API ponta a ponta (sobe o servidor numa porta e pasta temporárias)
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const Calc = require('./calc.js');

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('  ✓', nome); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: esperado ${b}, obtido ${a}`);

console.log('\n  Motor de cálculo');
const hora = (nome, moeda, custoUnit, qtd) => ({ tipoCobranca: 'hora', natureza: 'setup', perfilNome: nome, moeda, custoUnit, qtd, qtdModo: 'fixa' });
const planilha = (designH) => ({
  cambio: 5.01, params: { modoPreco: 'markup', margem: 0.30, imposto: 0, contingencia: 0, meses: 0 },
  itens: [hora('PM', 'USD', 22, 40), hora('TL', 'USD', 22, 30), hora('FE', 'USD', 22, 160), hora('QA', 'USD', 22, 30),
          hora('Design', 'BRL', 85.57, designH), hora('GP', 'BRL', 195, 126), hora('BO', 'BRL', 136, 80),
          hora('Pay', 'BRL', 136, 10), hora('SAC', 'BRL', 136, 40), hora('Transp', 'BRL', 136, 40)],
});

t('reproduz a planilha original (Design com 20h faturadas)', () => {
  const c = Calc.calcular(planilha(20));
  near(c.custoTotal, 78058.60, 'total sem margem');
  near(c.tcv, 101476.18, 'total com margem');
  assert.strictEqual(c.horasSetup, 576);
});
t('Design corrigido para 80h', () => {
  const c = Calc.calcular(planilha(80));
  near(c.custoTotal, 83192.80, 'custo'); near(c.tcv, 108150.64, 'preço');
  assert.strictEqual(c.horasSetup, 636);
});
t('markup de 30% equivale a ~23,1% de margem real', () => {
  near(Calc.calcular(planilha(80)).margemReal * 100, 23.08, 'margem real');
});
t('modo margem entrega exatamente a margem pedida', () => {
  const o = planilha(80); o.params = { modoPreco: 'margem', margem: 0.30, imposto: 0.15 };
  const c = Calc.calcular(o);
  near(c.margemReal * 100, 30, 'margem real'); near(c.tcv, 83192.80 / 0.55, 'preço');
});
t('variável por pedido, % GMV, fee e TCV', () => {
  const o = { cambio: 5, params: { modoPreco: 'margem', margem: 0.2, imposto: 0, meses: 12, pedidosMes: 1000, gmvMes: 100000, feeGmv: 2 },
    itens: [{ tipoCobranca: 'unidade', natureza: 'variavel', moeda: 'BRL', custoUnit: 2, qtdModo: 'porPedido', fator: 1.5 },
            { tipoCobranca: 'percentual', natureza: 'variavel', moeda: 'BRL', custoUnit: 1 },
            { tipoCobranca: 'fixo', natureza: 'setup', moeda: 'BRL', custoUnit: 800, qtd: 1 }] };
  const c = Calc.calcular(o);
  near(c.nat.variavel.custo, 3000 + 1000, 'custo variável'); // 1000×1,5×2 + 1% de 100k
  near(c.mensal, 4000 / 0.8 + 2000, 'mensal');
  near(c.tcv, 800 / 0.8 + (4000 / 0.8 + 2000) * 12, 'TCV');
});
t('GP em % das horas: soma as demais horas da mesma natureza', () => {
  const o = planilha(80);
  o.itens[5] = { tipoCobranca: 'hora', natureza: 'setup', perfilNome: 'GP', moeda: 'BRL', custoUnit: 195, qtdModo: 'percHoras', percHoras: 24.71 };
  const c = Calc.calcular(o);
  assert.strictEqual(c.baseHoras.setup, 510);                 // 636 − 126 do próprio GP
  assert.strictEqual(c.linhas[5].qtd, 126);                   // 510 × 24,71% = 126,0 h
  near(c.tcv, 108150.64, 'mesmo valor da planilha');
});
t('GP dedicado 25% x compartilhado 10%', () => {
  const o = planilha(80);
  o.itens[5] = { tipoCobranca: 'hora', natureza: 'setup', perfilNome: 'GP', moeda: 'BRL', custoUnit: 195, qtdModo: 'percHoras', percHoras: 25 };
  assert.strictEqual(Calc.calcular(o).linhas[5].qtd, 127.5);
  o.itens[5].percHoras = 10;
  assert.strictEqual(Calc.calcular(o).linhas[5].qtd, 51);
  o.itens[0].qtd += 100;                                      // +100 h de PM → GP acompanha
  assert.strictEqual(Calc.calcular(o).linhas[5].qtd, 61);
});
t('GP mensal usa só as horas mensais', () => {
  const o = { cambio: 5, params: { modoPreco: 'margem', margem: 0.2, meses: 12 }, itens: [
    { tipoCobranca: 'hora', natureza: 'setup', moeda: 'BRL', custoUnit: 100, qtd: 300 },
    { tipoCobranca: 'hora', natureza: 'mensal', moeda: 'BRL', custoUnit: 100, qtd: 200 },
    { tipoCobranca: 'hora', natureza: 'mensal', moeda: 'BRL', custoUnit: 195, qtdModo: 'percHoras', percHoras: 10 }] };
  assert.strictEqual(Calc.calcular(o).linhas[2].qtd, 20);
});
t('bloqueia envio com margem abaixo da mínima', () => {
  const o = planilha(80); o.status = 'rascunho';
  assert.ok(Calc.validarTransicao(o, 'enviado', { margemMinima: 0.25 }));
  assert.strictEqual(Calc.validarTransicao(o, 'em_aprovacao', { margemMinima: 0.25 }), null);
  assert.strictEqual(Calc.validarTransicao({ ...o, status: 'aprovado' }, 'enviado', { margemMinima: 0.25 }), null);
});

// ── API ──
const PORT = 3999;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'co-test-'));
function req(method, p, body) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json' } }, x => {
      let raw = ''; x.on('data', c => raw += c); x.on('end', () => res({ status: x.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

(async () => {
  console.log('\n  API');
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT, DATA_DIR: DATA }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await req('GET', '/api/status'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const st = await req('GET', '/api/status'); assert.strictEqual(st.status, 200); ok++; console.log('  ✓ status', st.body.version);
    const db = (await req('GET', '/api/db')).body;
    assert.strictEqual(db.templates.length, 3); ok++; console.log('  ✓ seed com 3 templates e', db.servicos.length, 'serviços');

    const orc = (await req('POST', '/api/orcamentos', { cliente: 'H Stern', templateId: 'tp_lume' })).body;
    near(orc.resumo.tcv, 108150.64, 'orçamento Lume via API'); ok++; console.log('  ✓ orçamento a partir do template Lume =', orc.resumo.tcv);

    await req('PUT', '/api/settings', { margemMinima: 0.25 });
    let r = await req('POST', `/api/orcamentos/${orc.id}/status`, { status: 'enviado' });
    assert.strictEqual(r.status, 422); ok++; console.log('  ✓ envio bloqueado:', r.body.error.slice(0, 60) + '…');

    for (const s of ['em_aprovacao', 'aprovado', 'enviado', 'aceito']) {
      r = await req('POST', `/api/orcamentos/${orc.id}/status`, { status: s }); assert.strictEqual(r.status, 200, r.body.error);
    }
    assert.strictEqual(r.body.versoes.length, 1); ok++; console.log('  ✓ fluxo de aprovação até aceito, versão congelada no envio');

    r = await req('PUT', `/api/orcamentos/${orc.id}`, { cliente: 'X' });
    assert.strictEqual(r.status, 409); ok++; console.log('  ✓ orçamento aceito bloqueado para edição');

    await req('PUT', '/api/perfis/pf_design', { custoHora: 100 });
    const o2 = (await req('GET', `/api/orcamentos/${orc.id}`)).body;
    near(o2.resumo.tcv, 108150.64, 'custo congelado'); ok++; console.log('  ✓ mudar a tabela de custos não altera orçamento existente');

    const ful = (await req('POST', '/api/orcamentos', { cliente: 'Loja Y', templateId: 'tp_full' })).body;
    assert.ok(ful.resumo.mensal > 0 && ful.resumo.tcv > ful.resumo.setup); ok++;
    console.log(`  ✓ Fullcommerce: setup ${ful.resumo.setup} · mensal ${ful.resumo.mensal} · TCV ${ful.resumo.tcv} · margem ${(ful.resumo.margemReal * 100).toFixed(1)}%`);

    const gp = ful.itens.find(i => i.servicoId === 'sv_gp');
    assert.strictEqual(gp.alocacao, 'dedicado'); assert.strictEqual(gp.percHoras, 25); ok++;
    console.log('  ✓ template Fullcommerce traz GP dedicado 25%');

    await req('PUT', '/api/settings', { gpDedicadoPct: 20 });
    const upd = (await req('POST', `/api/orcamentos/${ful.id}/atualizar-custos`)).body;
    assert.strictEqual(upd.itens.find(i => i.servicoId === 'sv_gp').percHoras, 20); ok++;
    console.log('  ✓ “Atualizar custos” reaplica o novo % de GP dedicado');

    const dup = (await req('POST', `/api/orcamentos/${ful.id}/duplicar`)).body;
    assert.notStrictEqual(dup.numero, ful.numero); ok++; console.log('  ✓ duplicar →', dup.numero);

    console.log(`\n  ${ok} testes passaram\n`);
  } catch (e) { console.error('\n  ✗', e.message, '\n'); process.exitCode = 1; }
  finally { srv.kill(); fs.rmSync(DATA, { recursive: true, force: true }); }
})();
