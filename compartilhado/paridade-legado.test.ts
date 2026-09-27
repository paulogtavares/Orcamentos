/**
 * Paridade com a v1.2.1: o calc.ts precisa dar exatamente o mesmo resultado do calc.js original
 * em orçamentos gerados ao acaso (todas as naturezas, cobranças, moedas e modos de quantidade).
 * Sai junto com a pasta legado/ na v2.0.0 final.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as Calc from "./calc.js";

const Legado = createRequire(import.meta.url)("../legado/calc.js");

// gerador determinístico (mulberry32): o mesmo sorteio em toda execução
function sorteio(semente: number) {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orcamentoAleatorio(r: () => number) {
  const um = <T>(lista: readonly T[]) => lista[Math.floor(r() * lista.length)];
  const valor = (max: number, casas = 2) => Math.round(r() * max * 10 ** casas) / 10 ** casas;
  const itens = Array.from({ length: Math.floor(r() * 14) }, () => {
    const tipoCobranca = um(["hora", "hora", "unidade", "fixo", "percentual"]);
    const qtdModo = tipoCobranca === "hora" ? um(["fixa", "percHoras", "porPedido"]) : um(["fixa", "porPedido"]);
    return {
      tipoCobranca,
      natureza: um(["setup", "mensal", "variavel", "setup", "outra", undefined]),
      perfilNome: um(["PM", "GP", "SAC", null, undefined]),
      moeda: um(["BRL", "USD"]),
      custoUnit: um([valor(300), valor(5, 3), "12.5", null]),
      qtd: um([valor(200, 1), 0, "40", null]),
      qtdModo,
      fator: um([valor(3, 2), 0, undefined]),
      percHoras: um([25, 10, valor(40, 2), undefined]),
    };
  });
  return {
    status: um(["rascunho", "aprovado", "enviado", "perdido", undefined]),
    cambio: um([5.01, valor(7, 4), "5.5", 0, null]),
    params: um([
      null,
      {
        modoPreco: um(["margem", "markup", undefined]),
        margem: um([0.3, 0.2, valor(0.6, 3), undefined]),
        imposto: um([0, 0.15, valor(0.3, 3), undefined]),
        contingencia: um([0, 0.05, undefined]),
        meses: um([0, 12, 24, undefined]),
        pedidosMes: um([0, 1000, 5000, undefined]),
        gmvMes: um([0, 100000, 900000, undefined]),
        feeGmv: um([0, 2, 3, undefined]),
      },
    ]),
    itens,
  };
}

const semFuncoes = (x: unknown) => JSON.parse(JSON.stringify(x));

describe("paridade com o calc.js da v1.2.1", () => {
  it("calcular, resumo e validarTransicao idênticos em 5.000 orçamentos", () => {
    const r = sorteio(20260927);
    for (let i = 0; i < 5000; i++) {
      const o = orcamentoAleatorio(r);
      expect(semFuncoes(Calc.calcular(o))).toEqual(semFuncoes(Legado.calcular(o)));
      expect(Calc.resumo(o)).toEqual(Legado.resumo(o));
      for (const novo of ["em_aprovacao", "aprovado", "enviado", "aceito", "perdido", "rascunho", "xyz"]) {
        const settings = { margemMinima: [0, 0.2, 0.25][i % 3] };
        expect(Calc.validarTransicao(o, novo, settings)).toBe(Legado.validarTransicao(o, novo, settings));
      }
    }
  });

  it("constantes iguais", () => {
    expect(Calc.STATUS).toEqual(Legado.STATUS);
    expect(Calc.TRANSICOES).toEqual(Legado.TRANSICOES);
    expect([...Calc.NATUREZAS]).toEqual(Legado.NATUREZAS);
  });
});
