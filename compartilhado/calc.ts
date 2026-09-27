/**
 * Orçamentos · motor de cálculo (fonte única da verdade para preço, margem e TCV).
 * Importado pelo servidor (api) e pela tela (web). Tradução fiel do calc.js da v1.2.1:
 * qualquer mudança de regra aqui precisa manter os testes da planilha H Stern.
 *
 * Conceitos:
 *   natureza  → setup (pagamento único) | mensal (recorrente fixo) | variavel (mensal, depende de volume)
 *   cobrança  → hora | unidade | fixo | percentual (% sobre o GMV)
 *   modoPreco → margem : preço = custo ÷ (1 − margem − imposto)        (margem real sobre o preço)
 *               markup : preço = custo × (1 + markup) ÷ (1 − imposto)   (modelo da planilha antiga)
 */

export const NATUREZAS = ["setup", "mensal", "variavel"] as const;
export type Natureza = (typeof NATUREZAS)[number];
export type TipoCobranca = "hora" | "unidade" | "fixo" | "percentual";
export type ModoQuantidade = "fixa" | "porPedido" | "percHoras";
export type ModoPreco = "margem" | "markup";
export type Alocacao = "dedicado" | "compartilhado" | "personalizado";

/** Item de um orçamento, com o custo congelado no momento em que entrou. */
export interface ItemOrcamento {
  uid?: string;
  servicoId?: string;
  nome?: string;
  area?: string;
  grupo?: string;
  tipoCobranca?: TipoCobranca | string;
  natureza?: Natureza | string;
  unidade?: string;
  /** id do papel de custo (na v1.2.1: perfil) */
  perfilId?: string | null;
  perfilNome?: string | null;
  moeda?: "BRL" | "USD" | string;
  custoUnit?: number | string | null;
  qtd?: number | string | null;
  qtdModo?: ModoQuantidade | string;
  fator?: number | string | null;
  alocacao?: Alocacao | string | null;
  percHoras?: number | string | null;
  [extra: string]: unknown;
}

export interface ParametrosPreco {
  modoPreco?: ModoPreco | string;
  margem?: number;
  imposto?: number;
  contingencia?: number;
  meses?: number;
  pedidosMes?: number;
  gmvMes?: number;
  feeGmv?: number;
  [extra: string]: unknown;
}

/** O mínimo que o cálculo lê de um orçamento. */
export interface OrcamentoCalculavel {
  status?: string;
  cambio?: number | string | null;
  params?: ParametrosPreco | null;
  itens?: ItemOrcamento[] | null;
}

export type BaseHoras = Record<Natureza, number>;

export interface TotaisNatureza {
  custo: number;
  custoCont: number;
  preco: number;
  horas: number;
  fator: number;
}

export interface Linha {
  idx: number;
  item: ItemOrcamento;
  natureza: Natureza;
  /** null para itens em % do GMV */
  qtd: number | null;
  custo: number;
  baseHoras: number | null;
  preco: number;
}

export interface HorasPerfil {
  setup: number;
  mes: number;
  custo: number;
}

export interface Calculo {
  params: Required<Pick<ParametrosPreco, "margem" | "imposto" | "contingencia" | "modoPreco" | "meses">> &
    ParametrosPreco;
  cambio: number;
  linhas: Linha[];
  nat: Record<Natureza, TotaisNatureza>;
  horasPerfil: Record<string, HorasPerfil>;
  feeMes: number;
  baseHoras: BaseHoras;
  horasSetup: number;
  horasMensais: number;
  setup: number;
  mensal: number;
  tcv: number;
  custoTotal: number;
  impostoTotal: number;
  lucro: number;
  margemReal: number;
  markupEquiv: number;
  temRecorrente: boolean;
}

export interface Resumo {
  setup: number;
  mensal: number;
  tcv: number;
  custoTotal: number;
  margemReal: number;
  horas: number;
}

/** Número a partir de qualquer valor; o que não for número vira 0 (mesma regra do calc.js). */
const num = (v: unknown) => Number(v) || 0;

export const r2 = (n: unknown) => Math.round(num(n) * 100) / 100;

const naturezaDe = (n: unknown): Natureza => (NATUREZAS.includes(n as Natureza) ? (n as Natureza) : "setup");

/** Item cujas horas são % da soma das demais horas (ex.: GP dedicado ou compartilhado). */
export const ehPercHoras = (it: ItemOrcamento) => it.tipoCobranca === "hora" && it.qtdModo === "percHoras";

/**
 * Base de horas por natureza: soma das horas dos itens por hora com quantidade própria.
 * Itens em "% das horas" não entram na base (evita cálculo circular).
 */
export function baseHoras(itens: ItemOrcamento[] | null | undefined, params: ParametrosPreco): BaseHoras {
  const base: BaseHoras = { setup: 0, mensal: 0, variavel: 0 };
  (itens || []).forEach((it) => {
    if (it.tipoCobranca !== "hora" || ehPercHoras(it)) return;
    base[naturezaDe(it.natureza)] += qtdEfetiva(it, params);
  });
  return base;
}

/** Quantidade efetiva: fixa, proporcional a pedidos/mês ou % das horas (arredondada a 0,1 h). */
export function qtdEfetiva(item: ItemOrcamento, params: ParametrosPreco, base?: BaseHoras): number {
  if (ehPercHoras(item)) {
    // natureza desconhecida usa a base do setup (mesmo comportamento da v1.2.1)
    const b = base ? (base[item.natureza as Natureza] ?? base.setup) : 0;
    return Math.round(((b * num(item.percHoras)) / 100) * 10) / 10;
  }
  if (item.qtdModo === "porPedido") return num(item.fator) * num(params.pedidosMes);
  return num(item.qtd);
}

/** Custo do item em BRL. */
export function custoItem(item: ItemOrcamento, params: ParametrosPreco, cambio: unknown, base?: BaseHoras): number {
  const fx = item.moeda === "USD" ? num(cambio) : 1;
  if (item.tipoCobranca === "percentual") return (num(params.gmvMes) * num(item.custoUnit)) / 100;
  return qtdEfetiva(item, params, base) * num(item.custoUnit) * fx;
}

export function precoDe(custo: number, p: ParametrosPreco): number {
  const imposto = num(p.imposto);
  const margem = num(p.margem);
  if (p.modoPreco === "markup") {
    const den = 1 - imposto;
    return den > 0 ? (custo * (1 + margem)) / den : 0;
  }
  const den = 1 - margem - imposto;
  return den > 0 ? custo / den : 0;
}

const PARAMS_PADRAO = {
  margem: 0.3,
  imposto: 0,
  contingencia: 0,
  modoPreco: "margem",
  meses: 12,
  pedidosMes: 0,
  gmvMes: 0,
  feeGmv: 0,
};

/** Calcula o orçamento completo: totais por natureza, linhas, horas por perfil, TCV e margem real. */
export function calcular(orc: OrcamentoCalculavel): Calculo {
  const p = Object.assign({}, PARAMS_PADRAO, orc.params || {}) as Calculo["params"];
  const cambio = num(orc.cambio);
  const itens = orc.itens || [];

  const nat = {} as Record<Natureza, TotaisNatureza>;
  NATUREZAS.forEach((n) => (nat[n] = { custo: 0, custoCont: 0, preco: 0, horas: 0, fator: 0 }));

  const base = baseHoras(itens, p);
  const linhas: Linha[] = itens.map((it, idx) => {
    const q = it.tipoCobranca === "percentual" ? null : qtdEfetiva(it, p, base);
    const custo = custoItem(it, p, cambio, base);
    const n = naturezaDe(it.natureza);
    nat[n].custo += custo;
    if (it.tipoCobranca === "hora") nat[n].horas += q || 0;
    return { idx, item: it, natureza: n, qtd: q, custo, baseHoras: ehPercHoras(it) ? base[n] : null, preco: 0 };
  });

  const contingencia = num(p.contingencia);
  NATUREZAS.forEach((n) => {
    nat[n].custoCont = nat[n].custo * (1 + contingencia);
    nat[n].preco = precoDe(nat[n].custoCont, p);
    nat[n].fator = nat[n].custo > 0 ? nat[n].preco / nat[n].custo : 0;
  });
  // preço alocado por linha (visão do cliente)
  linhas.forEach((l) => {
    l.preco = l.custo * nat[l.natureza].fator;
  });

  // horas por perfil: implantação (setup) e operação (h/mês)
  const horasPerfil: Record<string, HorasPerfil> = {};
  linhas.forEach((l) => {
    if (l.item.tipoCobranca !== "hora") return;
    const k = l.item.perfilNome || "—";
    horasPerfil[k] = horasPerfil[k] || { setup: 0, mes: 0, custo: 0 };
    horasPerfil[k][l.natureza === "setup" ? "setup" : "mes"] += l.qtd || 0;
    horasPerfil[k].custo += l.custo;
  });

  const imposto = num(p.imposto);
  const feeMes = (num(p.gmvMes) * num(p.feeGmv)) / 100;
  const meses = num(p.meses);
  const setup = nat.setup.preco;
  const mensal = nat.mensal.preco + nat.variavel.preco + feeMes;
  const tcv = setup + mensal * meses;
  const custoTot = nat.setup.custo + (nat.mensal.custo + nat.variavel.custo) * meses;
  const impostoTot = tcv * imposto;
  const lucro = tcv - impostoTot - custoTot;
  const margemReal = tcv > 0 ? lucro / tcv : 0;
  const markupEquiv = custoTot > 0 ? (tcv - impostoTot) / custoTot - 1 : 0;
  const temRecorrente = nat.mensal.custo + nat.variavel.custo + feeMes > 0;

  return {
    params: p,
    cambio,
    linhas,
    nat,
    horasPerfil,
    feeMes,
    baseHoras: base,
    horasSetup: nat.setup.horas,
    horasMensais: nat.mensal.horas + nat.variavel.horas,
    setup: r2(setup),
    mensal: r2(mensal),
    tcv: r2(tcv),
    custoTotal: r2(custoTot),
    impostoTotal: r2(impostoTot),
    lucro: r2(lucro),
    margemReal,
    markupEquiv,
    temRecorrente,
  };
}

/** Resumo gravado junto do orçamento (para listas e painel). */
export function resumo(orc: OrcamentoCalculavel): Resumo {
  const c = calcular(orc);
  return {
    setup: c.setup,
    mensal: c.mensal,
    tcv: c.tcv,
    custoTotal: c.custoTotal,
    margemReal: Math.round(c.margemReal * 10000) / 10000,
    horas: c.horasSetup,
  };
}

export const STATUS = {
  rascunho: { label: "Rascunho", cor: "#7A7488" },
  em_aprovacao: { label: "Em aprovação", cor: "#FFAC48" },
  aprovado: { label: "Aprovado", cor: "#43BDDE" },
  enviado: { label: "Enviado", cor: "#7A6CFF" },
  aceito: { label: "Aceito", cor: "#32CC7E" },
  perdido: { label: "Perdido", cor: "#E52862" },
} as const;
export type Status = keyof typeof STATUS;

/** Transições permitidas. */
export const TRANSICOES: Record<Status, readonly Status[]> = {
  rascunho: ["em_aprovacao", "enviado"],
  em_aprovacao: ["aprovado", "rascunho"],
  aprovado: ["enviado", "rascunho"],
  enviado: ["aceito", "perdido", "rascunho"],
  aceito: [],
  perdido: ["rascunho"],
};

export const ehStatus = (s: unknown): s is Status => typeof s === "string" && Object.hasOwn(STATUS, s);

/** Valida a transição de status. Retorna null se estiver ok, ou a mensagem de erro. */
export function validarTransicao(
  orc: OrcamentoCalculavel,
  novo: string,
  settings?: { margemMinima?: number | string } | null,
): string | null {
  const atual = (orc.status || "rascunho") as Status;
  if (!ehStatus(novo)) return `Status inválido: ${novo}`;
  if (!(TRANSICOES[atual] || []).includes(novo))
    return `Não é possível ir de "${STATUS[atual].label}" para "${STATUS[novo].label}".`;
  if (novo === "enviado" && atual === "rascunho") {
    const m = calcular(orc).margemReal;
    const min = num(settings?.margemMinima);
    if (m < min)
      return `Margem real de ${(m * 100).toFixed(1)}% está abaixo da mínima de ${(min * 100).toFixed(1)}%. Envie para aprovação antes.`;
  }
  if (!(orc.itens || []).length && novo !== "rascunho") return "Adicione itens ao orçamento antes de mudar o status.";
  return null;
}
