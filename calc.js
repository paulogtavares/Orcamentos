/**
 * C.O · Central de Orçamentos — Motor de cálculo
 * Arquivo compartilhado entre servidor (require) e navegador (window.Calc).
 * Fonte única da verdade para preço, margem e TCV.
 *
 * Conceitos:
 *   natureza  → setup (one-time) | mensal (recorrente fixo) | variavel (mensal, depende de volume)
 *   cobrança  → hora | unidade | fixo | percentual (% sobre GMV)
 *   modoPreco → margem  : preço = custo ÷ (1 − margem − imposto)       (margem real sobre o preço)
 *               markup  : preço = custo × (1 + markup) ÷ (1 − imposto)  (modelo da planilha antiga)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const NATUREZAS = ['setup', 'mensal', 'variavel'];
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

  // Item cujas horas são % da soma das demais horas (ex.: GP dedicado ou compartilhado)
  const ehPercHoras = it => it.tipoCobranca === 'hora' && it.qtdModo === 'percHoras';

  /**
   * Base de horas por natureza: soma das horas dos itens por hora com quantidade própria.
   * Itens em "% das horas" não entram na base (evita cálculo circular).
   */
  function baseHoras(itens, params) {
    const base = { setup: 0, mensal: 0, variavel: 0 };
    (itens || []).forEach(it => {
      if (it.tipoCobranca !== 'hora' || ehPercHoras(it)) return;
      const n = NATUREZAS.includes(it.natureza) ? it.natureza : 'setup';
      base[n] += qtdEfetiva(it, params);
    });
    return base;
  }

  // Quantidade efetiva: fixa, proporcional a pedidos/mês ou % das horas (arredondada a 0,1 h)
  function qtdEfetiva(item, params, base) {
    if (ehPercHoras(item)) {
      const b = base ? (base[item.natureza] ?? base.setup) : 0;
      return Math.round(b * (Number(item.percHoras) || 0) / 100 * 10) / 10;
    }
    if (item.qtdModo === 'porPedido') return (Number(item.fator) || 0) * (Number(params.pedidosMes) || 0);
    return Number(item.qtd) || 0;
  }

  // Custo do item em BRL
  function custoItem(item, params, cambio, base) {
    const fx = item.moeda === 'USD' ? (Number(cambio) || 0) : 1;
    if (item.tipoCobranca === 'percentual') {
      return (Number(params.gmvMes) || 0) * (Number(item.custoUnit) || 0) / 100;
    }
    return qtdEfetiva(item, params, base) * (Number(item.custoUnit) || 0) * fx;
  }

  function precoDe(custo, p) {
    const imposto = Number(p.imposto) || 0;
    const margem  = Number(p.margem)  || 0;
    if (p.modoPreco === 'markup') {
      const den = 1 - imposto;
      return den > 0 ? custo * (1 + margem) / den : 0;
    }
    const den = 1 - margem - imposto;
    return den > 0 ? custo / den : 0;
  }

  /**
   * Calcula o orçamento completo.
   * @returns objeto com totais por natureza, linhas, horas por perfil, TCV e margem real.
   */
  function calcular(orc) {
    const p   = Object.assign({ margem: 0.3, imposto: 0, contingencia: 0, modoPreco: 'margem', meses: 12, pedidosMes: 0, gmvMes: 0, feeGmv: 0 }, orc.params || {});
    const cambio = Number(orc.cambio) || 0;
    const itens  = orc.itens || [];

    const nat = {};
    NATUREZAS.forEach(n => nat[n] = { custo: 0, custoCont: 0, preco: 0, horas: 0 });

    const base = baseHoras(itens, p);
    const linhas = itens.map((it, idx) => {
      const q = it.tipoCobranca === 'percentual' ? null : qtdEfetiva(it, p, base);
      const custo = custoItem(it, p, cambio, base);
      const n = NATUREZAS.includes(it.natureza) ? it.natureza : 'setup';
      nat[n].custo += custo;
      if (it.tipoCobranca === 'hora') nat[n].horas += q || 0;
      return { idx, item: it, natureza: n, qtd: q, custo, baseHoras: ehPercHoras(it) ? base[n] : null };
    });

    const contingencia = Number(p.contingencia) || 0;
    NATUREZAS.forEach(n => {
      nat[n].custoCont = nat[n].custo * (1 + contingencia);
      nat[n].preco = precoDe(nat[n].custoCont, p);
      nat[n].fator = nat[n].custo > 0 ? nat[n].preco / nat[n].custo : 0;
    });
    // Preço alocado por linha (visão cliente)
    linhas.forEach(l => { l.preco = l.custo * nat[l.natureza].fator; });

    // Horas por perfil: implantação (setup) e operação (h/mês)
    const horasPerfil = {};
    linhas.forEach(l => {
      if (l.item.tipoCobranca !== 'hora') return;
      const k = l.item.perfilNome || '—';
      horasPerfil[k] = horasPerfil[k] || { setup: 0, mes: 0, custo: 0 };
      horasPerfil[k][l.natureza === 'setup' ? 'setup' : 'mes'] += l.qtd || 0;
      horasPerfil[k].custo += l.custo;
    });

    const imposto  = Number(p.imposto) || 0;
    const feeMes   = (Number(p.gmvMes) || 0) * (Number(p.feeGmv) || 0) / 100;
    const meses    = Number(p.meses) || 0;
    const setup    = nat.setup.preco;
    const mensal   = nat.mensal.preco + nat.variavel.preco + feeMes;
    const tcv      = setup + mensal * meses;
    const custoTot = nat.setup.custo + (nat.mensal.custo + nat.variavel.custo) * meses;
    const impostoTot = tcv * imposto;
    const lucro    = tcv - impostoTot - custoTot;
    const margemReal = tcv > 0 ? lucro / tcv : 0;
    const markupEquiv = custoTot > 0 ? (tcv - impostoTot) / custoTot - 1 : 0;
    const temRecorrente = (nat.mensal.custo + nat.variavel.custo + feeMes) > 0;

    return {
      params: p, cambio, linhas, nat, horasPerfil, feeMes, baseHoras: base,
      horasSetup: nat.setup.horas, horasMensais: nat.mensal.horas + nat.variavel.horas,
      setup: r2(setup), mensal: r2(mensal), tcv: r2(tcv),
      custoTotal: r2(custoTot), impostoTotal: r2(impostoTot), lucro: r2(lucro),
      margemReal, markupEquiv, temRecorrente,
    };
  }

  // Resumo gravado junto do orçamento (para listas e dashboard)
  function resumo(orc) {
    const c = calcular(orc);
    return { setup: c.setup, mensal: c.mensal, tcv: c.tcv, custoTotal: c.custoTotal, margemReal: Math.round(c.margemReal * 10000) / 10000, horas: c.horasSetup };
  }

  const STATUS = {
    rascunho:     { label: 'Rascunho',      cor: '#7A7488' },
    em_aprovacao: { label: 'Em aprovação',  cor: '#FFAC48' },
    aprovado:     { label: 'Aprovado',      cor: '#43BDDE' },
    enviado:      { label: 'Enviado',       cor: '#7A6CFF' },
    aceito:       { label: 'Aceito',        cor: '#32CC7E' },
    perdido:      { label: 'Perdido',       cor: '#E52862' },
  };

  // Transições permitidas
  const TRANSICOES = {
    rascunho:     ['em_aprovacao', 'enviado'],
    em_aprovacao: ['aprovado', 'rascunho'],
    aprovado:     ['enviado', 'rascunho'],
    enviado:      ['aceito', 'perdido', 'rascunho'],
    aceito:       [],
    perdido:      ['rascunho'],
  };

  /** Valida transição de status. Retorna null se ok, ou mensagem de erro. */
  function validarTransicao(orc, novo, settings) {
    const atual = orc.status || 'rascunho';
    if (!STATUS[novo]) return `Status inválido: ${novo}`;
    if (!(TRANSICOES[atual] || []).includes(novo)) return `Não é possível ir de "${STATUS[atual].label}" para "${STATUS[novo].label}".`;
    if (novo === 'enviado' && atual === 'rascunho') {
      const m = calcular(orc).margemReal;
      const min = Number(settings?.margemMinima) || 0;
      if (m < min) return `Margem real de ${(m * 100).toFixed(1)}% está abaixo da mínima de ${(min * 100).toFixed(1)}%. Envie para aprovação antes.`;
    }
    if (!(orc.itens || []).length && novo !== 'rascunho') return 'Adicione itens ao orçamento antes de mudar o status.';
    return null;
  }

  return { calcular, resumo, qtdEfetiva, custoItem, baseHoras, ehPercHoras, precoDe, validarTransicao, STATUS, TRANSICOES, NATUREZAS, r2 };
});
