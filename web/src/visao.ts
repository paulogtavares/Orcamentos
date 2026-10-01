/**
 * O que a tela mostra de um orçamento. Quem vê custos: tudo calculado na hora pelo calc.ts (igual à v1).
 * Quem não vê: quantidades calculadas na hora (não dependem de custo) e preços vindos do servidor
 * (item.preco e resumo), atualizados a cada salvamento.
 */
import { calcular, NATUREZAS, type Calculo, type Natureza } from "@orcamentos/compartilhado/calc";
import type { Orcamento, Item } from "./tipos";

export interface LinhaVisao {
  item: Item;
  natureza: Natureza;
  qtd: number | null;
  baseHoras: number | null;
  custo: number | null;
  preco: number;
}

export interface Visao {
  veCustos: boolean;
  linhas: LinhaVisao[];
  nat: Record<Natureza, { custo: number | null; preco: number; quantidade: number }>;
  setup: number;
  mensal: number;
  tcv: number;
  feeMes: number;
  horasSetup: number;
  horasMensais: number;
  temRecorrente: boolean;
  horasPerfil: Calculo["horasPerfil"];
  /** só para quem vê custos */
  calculo: Calculo | null;
}

export function visao(o: Pick<Orcamento, "itens" | "params" | "cambio" | "resumo">, veCustos: boolean): Visao {
  const c = calcular(o);
  const linhas: LinhaVisao[] = c.linhas.map((l) => ({
    item: l.item as Item,
    natureza: l.natureza,
    qtd: l.qtd,
    baseHoras: l.baseHoras,
    custo: veCustos ? l.custo : null,
    preco: veCustos ? l.preco : Number((l.item as Item).preco) || 0,
  }));
  const nat = {} as Visao["nat"];
  NATUREZAS.forEach((n) => {
    const ls = linhas.filter((l) => l.natureza === n);
    nat[n] = {
      custo: veCustos ? c.nat[n].custo : null,
      preco: veCustos ? c.nat[n].preco : ls.reduce((t, l) => t + l.preco, 0),
      quantidade: ls.length,
    };
  });
  const r = o.resumo ?? {};
  const mensal = veCustos ? c.mensal : Number(r.mensal) || 0;
  return {
    veCustos,
    linhas,
    nat,
    setup: veCustos ? c.setup : Number(r.setup) || 0,
    mensal,
    tcv: veCustos ? c.tcv : Number(r.tcv) || 0,
    feeMes: c.feeMes,
    horasSetup: c.horasSetup,
    horasMensais: c.horasMensais,
    temRecorrente: veCustos ? c.temRecorrente : mensal > 0,
    horasPerfil: c.horasPerfil,
    calculo: veCustos ? c : null,
  };
}
