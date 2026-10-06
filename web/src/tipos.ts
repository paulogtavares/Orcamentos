/** Formato da API (o mesmo JSON da v1.2.1). Quem não vê custos recebe itens com "preco" e sem custo. */
import type { ItemOrcamento, ParametrosPreco, Resumo } from "@orcamentos/compartilhado/calc";

export type Item = ItemOrcamento & { uid: string; preco?: number };

export interface Parametros {
  empresa?: string;
  cambio: { usd: number; fonte?: string; dataCotacao?: string; atualizadoEm?: string };
  margemAlvo?: number;
  margemMinima?: number;
  impostoPadrao?: number;
  contingenciaPadrao?: number;
  modoPrecoPadrao?: "margem" | "markup";
  validadeDias?: number;
  gpDedicadoPct?: number;
  gpCompartilhadoPct?: number;
}

/** Papel de custo (no JSON e na API da v1: "perfil"). */
export interface PapelCusto {
  id: string;
  nome: string;
  categoria: string;
  moeda: "BRL" | "USD";
  custoHora: number;
  ativo?: boolean;
}

export interface Servico {
  id: string;
  nome: string;
  area: string;
  grupo?: string;
  tipoCobranca: "hora" | "unidade" | "fixo" | "percentual";
  natureza: "setup" | "mensal" | "variavel";
  /** papel de custo dos itens por hora */
  perfilId?: string | null;
  unidade?: string;
  custoUnit?: number;
  moeda?: "BRL" | "USD";
}

export interface ItemTemplate {
  servicoId: string;
  qtd?: number;
  qtdModo?: string;
  fator?: number;
  natureza?: string;
  alocacao?: string | null;
  percHoras?: number;
}

export interface Template {
  id: string;
  nome: string;
  modelo: string;
  descricao?: string;
  params: ParametrosPreco;
  itens: ItemTemplate[];
}

export interface Versao {
  v: number;
  data: string;
  resumo: Partial<Resumo>;
  snapshot: { itens: Item[]; params: ParametrosPreco; cambio: number };
}

export interface Evento {
  data: string;
  acao: string;
  por?: string;
}

export interface Orcamento {
  id: string;
  numero: string;
  cliente: string;
  projeto: string;
  modelo: string;
  responsavel: string;
  status: string;
  validade: string;
  templateId: string | null;
  /** cliente do cadastro (v2.1.0); ausente quando o orçamento ainda não foi ligado */
  clienteId?: string | null;
  cambio: number;
  params: ParametrosPreco;
  premissas: string;
  itens: Item[];
  versoes: Versao[];
  historico: Evento[];
  criadoEm: string;
  atualizadoEm: string;
  resumo: Partial<Resumo>;
}

export interface Cliente {
  id: string;
  nome: string;
  documento: string | null;
  situacao: "ativo" | "inativo";
  origem: "manual" | "cronogramas" | "ligacao";
  criadoEm?: string;
  atualizadoEm?: string;
  orcamentos?: number;
}

export interface Base {
  meta: { createdAt?: string; seq?: number };
  settings: Parametros;
  perfis: PapelCusto[];
  servicos: Servico[];
  templates: Template[];
  orcamentos: Orcamento[];
  /** v2.1.0 */
  clientes?: Cliente[];
}
