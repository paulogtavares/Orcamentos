/** A visão da tela dá o mesmo preço para quem vê custos (calculado na hora) e para quem não vê (do servidor). */
import { calcular } from "@orcamentos/compartilhado/calc";
import { describe, expect, it } from "vitest";
import type { Orcamento } from "./tipos";
import { visao } from "./visao";

const orc = {
  cambio: 5,
  params: { modoPreco: "margem", margem: 0.2, imposto: 0, meses: 12, pedidosMes: 100 },
  itens: [
    {
      uid: "a",
      tipoCobranca: "hora",
      natureza: "setup",
      moeda: "USD",
      custoUnit: 20,
      qtd: 10,
      qtdModo: "fixa",
      perfilNome: "PM",
    },
    {
      uid: "b",
      tipoCobranca: "hora",
      natureza: "setup",
      moeda: "BRL",
      custoUnit: 195,
      qtdModo: "percHoras",
      percHoras: 25,
    },
    {
      uid: "c",
      tipoCobranca: "unidade",
      natureza: "variavel",
      moeda: "BRL",
      custoUnit: 2,
      qtdModo: "porPedido",
      fator: 3,
    },
  ],
} as unknown as Orcamento;

describe("visão da tela", () => {
  it("quem vê custos: tudo do calc.ts", () => {
    const v = visao(orc, true);
    const c = calcular(orc);
    expect([v.setup, v.mensal, v.tcv]).toEqual([c.setup, c.mensal, c.tcv]);
    expect(v.linhas.map((l) => l.custo)).toEqual(c.linhas.map((l) => l.custo));
  });

  it("quem não vê custos: quantidades calculadas na hora, preço e totais do servidor, sem custo", () => {
    const c = calcular(orc);
    const doServidor = {
      ...orc,
      itens: orc.itens.map((i, k) => ({
        ...i,
        custoUnit: undefined,
        preco: Math.round(c.linhas[k].preco * 100) / 100,
      })),
      resumo: { setup: c.setup, mensal: c.mensal, tcv: c.tcv, horas: c.horasSetup },
    } as unknown as Orcamento;
    const v = visao(doServidor, false);
    expect(v.linhas.map((l) => l.qtd)).toEqual(c.linhas.map((l) => l.qtd)); // inclui o GP em % das horas
    expect(v.linhas.every((l) => l.custo === null)).toBe(true);
    expect(v.calculo).toBeNull();
    expect([v.setup, v.mensal, v.tcv]).toEqual([c.setup, c.mensal, c.tcv]);
    expect(v.nat.setup.preco).toBeCloseTo(c.nat.setup.preco, 1);
    expect(v.temRecorrente).toBe(true);
  });
});
