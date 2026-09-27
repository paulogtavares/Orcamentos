/**
 * Motor de cálculo: reproduz a planilha H Stern – Lume (portado do test.js da v1.2.1).
 * Estes valores são a referência de negócio: nenhuma mudança no cálculo pode alterá-los.
 */
import { describe, expect, it } from "vitest";
import * as Calc from "./calc.js";

const perto = (obtido: number, esperado: number) => expect(Math.abs(obtido - esperado)).toBeLessThan(0.01);

const hora = (nome: string, moeda: string, custoUnit: number, qtd: number) => ({
  tipoCobranca: "hora",
  natureza: "setup",
  perfilNome: nome,
  moeda,
  custoUnit,
  qtd,
  qtdModo: "fixa",
});

const planilha = (designH: number): any => ({
  cambio: 5.01,
  params: { modoPreco: "markup", margem: 0.3, imposto: 0, contingencia: 0, meses: 0 },
  itens: [
    hora("PM", "USD", 22, 40),
    hora("TL", "USD", 22, 30),
    hora("FE", "USD", 22, 160),
    hora("QA", "USD", 22, 30),
    hora("Design", "BRL", 85.57, designH),
    hora("GP", "BRL", 195, 126),
    hora("BO", "BRL", 136, 80),
    hora("Pay", "BRL", 136, 10),
    hora("SAC", "BRL", 136, 40),
    hora("Transp", "BRL", 136, 40),
  ],
});

describe("planilha H Stern", () => {
  it("reproduz a planilha original (Design com 20h faturadas)", () => {
    const c = Calc.calcular(planilha(20));
    perto(c.custoTotal, 78058.6);
    perto(c.tcv, 101476.18);
    expect(c.horasSetup).toBe(576);
  });

  it("Design corrigido para 80h", () => {
    const c = Calc.calcular(planilha(80));
    perto(c.custoTotal, 83192.8);
    perto(c.tcv, 108150.64);
    expect(c.horasSetup).toBe(636);
  });

  it("markup de 30% equivale a ~23,1% de margem real", () => {
    perto(Calc.calcular(planilha(80)).margemReal * 100, 23.08);
  });

  it("modo margem entrega exatamente a margem pedida", () => {
    const o = planilha(80);
    o.params = { modoPreco: "margem", margem: 0.3, imposto: 0.15 };
    const c = Calc.calcular(o);
    perto(c.margemReal * 100, 30);
    perto(c.tcv, 83192.8 / 0.55);
  });
});

describe("recorrente", () => {
  it("variável por pedido, % GMV, fee e TCV", () => {
    const o = {
      cambio: 5,
      params: { modoPreco: "margem", margem: 0.2, imposto: 0, meses: 12, pedidosMes: 1000, gmvMes: 100000, feeGmv: 2 },
      itens: [
        { tipoCobranca: "unidade", natureza: "variavel", moeda: "BRL", custoUnit: 2, qtdModo: "porPedido", fator: 1.5 },
        { tipoCobranca: "percentual", natureza: "variavel", moeda: "BRL", custoUnit: 1 },
        { tipoCobranca: "fixo", natureza: "setup", moeda: "BRL", custoUnit: 800, qtd: 1 },
      ],
    };
    const c = Calc.calcular(o);
    perto(c.nat.variavel.custo, 3000 + 1000); // 1000 × 1,5 × 2 + 1% de 100k
    perto(c.mensal, 4000 / 0.8 + 2000);
    perto(c.tcv, 800 / 0.8 + (4000 / 0.8 + 2000) * 12);
  });
});

describe("GP em % das horas", () => {
  it("soma as demais horas da mesma natureza", () => {
    const o = planilha(80);
    o.itens[5] = {
      tipoCobranca: "hora",
      natureza: "setup",
      perfilNome: "GP",
      moeda: "BRL",
      custoUnit: 195,
      qtdModo: "percHoras",
      percHoras: 24.71,
    };
    const c = Calc.calcular(o);
    expect(c.baseHoras.setup).toBe(510); // 636 − 126 do próprio GP
    expect(c.linhas[5].qtd).toBe(126); // 510 × 24,71% = 126,0 h
    perto(c.tcv, 108150.64);
  });

  it("dedicado 25% x compartilhado 10%", () => {
    const o = planilha(80);
    o.itens[5] = {
      tipoCobranca: "hora",
      natureza: "setup",
      perfilNome: "GP",
      moeda: "BRL",
      custoUnit: 195,
      qtdModo: "percHoras",
      percHoras: 25,
    };
    expect(Calc.calcular(o).linhas[5].qtd).toBe(127.5);
    o.itens[5].percHoras = 10;
    expect(Calc.calcular(o).linhas[5].qtd).toBe(51);
    o.itens[0].qtd += 100; // +100 h de PM → GP acompanha
    expect(Calc.calcular(o).linhas[5].qtd).toBe(61);
  });

  it("GP mensal usa só as horas mensais", () => {
    const o = {
      cambio: 5,
      params: { modoPreco: "margem", margem: 0.2, meses: 12 },
      itens: [
        { tipoCobranca: "hora", natureza: "setup", moeda: "BRL", custoUnit: 100, qtd: 300 },
        { tipoCobranca: "hora", natureza: "mensal", moeda: "BRL", custoUnit: 100, qtd: 200 },
        { tipoCobranca: "hora", natureza: "mensal", moeda: "BRL", custoUnit: 195, qtdModo: "percHoras", percHoras: 10 },
      ],
    };
    expect(Calc.calcular(o).linhas[2].qtd).toBe(20);
  });
});

describe("status", () => {
  it("bloqueia envio com margem abaixo da mínima", () => {
    const o = { ...planilha(80), status: "rascunho" };
    expect(Calc.validarTransicao(o, "enviado", { margemMinima: 0.25 })).toBeTruthy();
    expect(Calc.validarTransicao(o, "em_aprovacao", { margemMinima: 0.25 })).toBeNull();
    expect(Calc.validarTransicao({ ...o, status: "aprovado" }, "enviado", { margemMinima: 0.25 })).toBeNull();
  });
});
