/**
 * Casos de borda do cálculo (etapa 1 do plano): arredondamento, câmbio, TCV, margem,
 * itens mensais e variáveis. Valores esperados calculados à mão.
 */
import { describe, expect, it } from "vitest";
import { calcular, qtdEfetiva, precoDe, r2, resumo, validarTransicao, type ItemOrcamento } from "./calc.js";

const item = (x: ItemOrcamento): ItemOrcamento => ({ moeda: "BRL", qtdModo: "fixa", natureza: "setup", ...x });

describe("arredondamento", () => {
  it("r2 arredonda a centavos e trata valores inválidos como 0", () => {
    expect(r2(10.005)).toBe(10.01);
    expect(r2(10.004)).toBe(10);
    expect(r2(2.675)).toBe(2.68);
    expect(r2(-0.125)).toBe(-0.12); // Math.round leva o .5 exato para cima (em direção a +∞)
    expect(r2(-1.235)).toBe(-1.24); // -1,235 × 100 = -123,50000000000001 em ponto flutuante
    expect(r2("3.333")).toBe(3.33);
    expect(r2(undefined)).toBe(0);
    expect(r2("abc")).toBe(0);
  });

  it("horas em % arredondam a 0,1 h", () => {
    const base = { setup: 333, mensal: 0, variavel: 0 };
    const gp = item({ tipoCobranca: "hora", qtdModo: "percHoras", percHoras: 12.5 });
    expect(qtdEfetiva(gp, {}, base)).toBe(41.6); // 41,625 → 41,6
    expect(qtdEfetiva({ ...gp, percHoras: 12.52 }, {}, base)).toBe(41.7); // 41,6916 → 41,7
  });

  it("totais do contrato saem em centavos, margem real sem arredondar; o resumo arredonda a margem a 4 casas", () => {
    const o = {
      cambio: 1,
      params: { modoPreco: "margem", margem: 0.3, imposto: 0, meses: 0 },
      itens: [item({ tipoCobranca: "fixo", custoUnit: 100, qtd: 1 })],
    };
    const c = calcular(o);
    expect(c.tcv).toBe(142.86); // 100 / 0,7 = 142,857…
    expect(c.margemReal).toBeCloseTo(0.3, 12);
    expect(resumo({ ...o, params: { ...o.params, margem: 0.33333 } }).margemReal).toBe(0.3333);
  });
});

describe("câmbio", () => {
  it("só itens em USD usam o câmbio", () => {
    const o = {
      cambio: 5.5,
      params: { modoPreco: "margem", margem: 0, imposto: 0, meses: 0 },
      itens: [
        item({ tipoCobranca: "hora", moeda: "USD", custoUnit: 10, qtd: 2 }),
        item({ tipoCobranca: "hora", moeda: "BRL", custoUnit: 10, qtd: 2 }),
      ],
    };
    expect(calcular(o).custoTotal).toBe(110 + 20);
  });

  it("câmbio ausente zera o custo em USD (não quebra)", () => {
    const o = {
      params: { margem: 0, meses: 0 },
      itens: [item({ tipoCobranca: "hora", moeda: "USD", custoUnit: 10, qtd: 2 })],
    };
    expect(calcular(o).custoTotal).toBe(0);
    expect(calcular({ ...o, cambio: "5" }).custoTotal).toBe(100); // texto numérico é aceito
  });

  it("% do GMV ignora o câmbio mesmo com moeda USD", () => {
    const o = {
      cambio: 5,
      params: { margem: 0, meses: 1, gmvMes: 10000 },
      itens: [item({ tipoCobranca: "percentual", natureza: "variavel", moeda: "USD", custoUnit: 2 })],
    };
    expect(calcular(o).nat.variavel.custo).toBe(200);
  });
});

describe("TCV e margem", () => {
  const base = {
    cambio: 1,
    itens: [
      item({ tipoCobranca: "fixo", natureza: "setup", custoUnit: 1000, qtd: 1 }),
      item({ tipoCobranca: "fixo", natureza: "mensal", custoUnit: 200, qtd: 1 }),
      item({ tipoCobranca: "unidade", natureza: "variavel", custoUnit: 1, qtdModo: "porPedido", fator: 2 }),
    ],
  };

  it("TCV = setup + mensalidade × meses, com contingência e imposto", () => {
    const c = calcular({
      ...base,
      params: { modoPreco: "margem", margem: 0.2, imposto: 0.1, contingencia: 0.1, meses: 12, pedidosMes: 50 },
    });
    // setup: 1000 × 1,1 / 0,7 ; mensal: (200 + 100) × 1,1 / 0,7
    expect(c.setup).toBe(r2(1100 / 0.7));
    expect(c.mensal).toBe(r2(330 / 0.7));
    expect(c.tcv).toBe(r2(1100 / 0.7 + (330 / 0.7) * 12));
    expect(c.custoTotal).toBe(1000 + 300 * 12);
    // margem real desconta a contingência (custo real é sem contingência)
    const tcv = 1100 / 0.7 + (330 / 0.7) * 12;
    expect(c.margemReal).toBeCloseTo((tcv - tcv * 0.1 - 4600) / tcv, 10);
  });

  it("meses = 0: só o setup entra no TCV", () => {
    const c = calcular({ ...base, params: { margem: 0.2, meses: 0, pedidosMes: 50 } });
    expect(c.tcv).toBe(1250);
    expect(c.mensal).toBeGreaterThan(0);
  });

  it("fee sobre o GMV entra na mensalidade sem custo", () => {
    const c = calcular({ cambio: 1, params: { margem: 0.2, meses: 10, gmvMes: 50000, feeGmv: 1.5 }, itens: [] });
    expect(c.feeMes).toBe(750);
    expect(c.mensal).toBe(750);
    expect(c.tcv).toBe(7500);
    expect(c.margemReal).toBe(1);
    expect(c.temRecorrente).toBe(true);
  });

  it("margem + imposto ≥ 100% não gera preço (evita divisão por zero ou preço negativo)", () => {
    expect(precoDe(100, { modoPreco: "margem", margem: 0.6, imposto: 0.4 })).toBe(0);
    expect(precoDe(100, { modoPreco: "margem", margem: 0.8, imposto: 0.3 })).toBe(0);
    expect(precoDe(100, { modoPreco: "markup", margem: 0.5, imposto: 1 })).toBe(0);
  });

  it("HERDADO da v1.2.1: margem 70% + imposto 30% dá preço astronômico (1 − 0,7 − 0,3 = 5,55e-17 em ponto flutuante)", () => {
    // Mantido igual à v1.2.1 de propósito (regra de cálculo não muda sem decisão).
    // Pendência registrada no CHANGELOG: tratar denominador ≤ 1e-9 como zero.
    expect(precoDe(100, { modoPreco: "margem", margem: 0.7, imposto: 0.3 })).toBeGreaterThan(1e17);
  });

  it("orçamento vazio: tudo zero, margem 0", () => {
    const c = calcular({});
    expect([c.setup, c.mensal, c.tcv, c.custoTotal, c.margemReal, c.markupEquiv]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(c.temRecorrente).toBe(false);
  });

  it("markup equivalente ao preço praticado", () => {
    const c = calcular({ ...base, params: { modoPreco: "markup", margem: 0.3, imposto: 0, meses: 0 } });
    expect(c.markupEquiv).toBeCloseTo(0.3, 10);
  });
});

describe("itens mensais e variáveis", () => {
  it("horas mensais e variáveis somam em horasMensais; horas por perfil separam setup e mês", () => {
    const c = calcular({
      cambio: 1,
      params: { margem: 0, meses: 12 },
      itens: [
        item({ tipoCobranca: "hora", natureza: "setup", perfilNome: "SAC", custoUnit: 10, qtd: 5 }),
        item({ tipoCobranca: "hora", natureza: "mensal", perfilNome: "SAC", custoUnit: 10, qtd: 20 }),
        item({ tipoCobranca: "hora", natureza: "variavel", perfilNome: "SAC", custoUnit: 10, qtd: 3 }),
      ],
    });
    expect(c.horasSetup).toBe(5);
    expect(c.horasMensais).toBe(23);
    expect(c.horasPerfil.SAC).toEqual({ setup: 5, mes: 23, custo: 280 });
  });

  it("natureza desconhecida conta como setup", () => {
    const c = calcular({
      cambio: 1,
      params: { margem: 0, meses: 12 },
      itens: [item({ tipoCobranca: "fixo", natureza: "xyz", custoUnit: 9, qtd: 1 })],
    });
    expect(c.nat.setup.custo).toBe(9);
    expect(c.linhas[0].natureza).toBe("setup");
  });

  it("por pedido multiplica o fator pelos pedidos do mês; sem pedidos, zero", () => {
    const pick = item({
      tipoCobranca: "unidade",
      natureza: "variavel",
      custoUnit: 0.9,
      qtdModo: "porPedido",
      fator: 1.8,
    });
    expect(qtdEfetiva(pick, { pedidosMes: 5000 })).toBe(9000);
    expect(qtdEfetiva(pick, {})).toBe(0);
  });

  it("preço por linha distribui o preço da natureza pelo peso do custo", () => {
    const c = calcular({
      cambio: 1,
      params: { margem: 0.5, meses: 1 },
      itens: [
        item({ tipoCobranca: "fixo", natureza: "mensal", custoUnit: 30, qtd: 1 }),
        item({ tipoCobranca: "fixo", natureza: "mensal", custoUnit: 70, qtd: 1 }),
      ],
    });
    expect(c.linhas.map((l) => l.preco)).toEqual([60, 140]);
  });
});

describe("status", () => {
  it("sem itens só pode voltar para rascunho", () => {
    expect(validarTransicao({ status: "rascunho", itens: [] }, "em_aprovacao")).toMatch(/Adicione itens/);
  });
  it("transição fora do fluxo e status inválido", () => {
    expect(validarTransicao({ status: "aceito", itens: [{}] }, "rascunho")).toMatch(/Não é possível/);
    expect(validarTransicao({ status: "rascunho", itens: [{}] }, "xyz")).toBe("Status inválido: xyz");
    expect(validarTransicao({ status: "rascunho", itens: [{}] }, "toString")).toBe("Status inválido: toString");
  });
});
