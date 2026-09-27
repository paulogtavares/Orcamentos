/**
 * Formato JSON da v1.2.1 (db.json, backup e respostas da API). A v2 mantém o mesmo formato
 * na API e no backup; no banco ele vira tabelas do schema orcamentos.
 */
import type { ItemOrcamento, ParametrosPreco, Resumo } from "@orcamentos/compartilhado/calc";

export type Json = Record<string, any>;

export interface Parametros extends Json {
  empresa?: string;
  cambio?: { usd: number; fonte?: string; dataCotacao?: string; atualizadoEm?: string; [k: string]: unknown };
  margemAlvo?: number;
  margemMinima?: number;
  impostoPadrao?: number;
  contingenciaPadrao?: number;
  modoPrecoPadrao?: string;
  validadeDias?: number;
  gpDedicadoPct?: number;
  gpCompartilhadoPct?: number;
}

/** Papel de custo (na v1.2.1 e na API: "perfil"). */
export interface PapelCusto extends Json {
  id: string;
  nome: string;
  categoria?: string;
  moeda: "BRL" | "USD" | string;
  custoHora: number;
  ativo?: boolean;
}

export interface Servico extends Json {
  id: string;
  nome: string;
  area?: string;
  grupo?: string;
  tipoCobranca: string;
  natureza: string;
  /** papel de custo (itens por hora) */
  perfilId?: string | null;
  unidade?: string;
  custoUnit?: number;
  moeda?: string;
}

export interface ItemTemplate extends Json {
  servicoId: string;
  qtd?: number;
  qtdModo?: string;
  fator?: number;
  natureza?: string;
  alocacao?: string | null;
  percHoras?: number;
}

export interface Template extends Json {
  id: string;
  nome: string;
  modelo?: string;
  descricao?: string;
  params?: ParametrosPreco;
  itens: ItemTemplate[];
}

export interface Versao extends Json {
  v: number;
  data: string;
  resumo: Resumo;
  snapshot: { itens: ItemOrcamento[]; params: ParametrosPreco; cambio: number };
}

export interface EventoHistorico extends Json {
  data: string;
  acao: string;
  por?: string;
}

export interface Orcamento extends Json {
  id: string;
  numero: string;
  cliente: string;
  projeto: string;
  modelo: string;
  responsavel: string;
  status: string;
  validade: string;
  templateId: string | null;
  cambio: number;
  params: ParametrosPreco;
  premissas: string;
  itens: ItemOrcamento[];
  versoes: Versao[];
  historico: EventoHistorico[];
  criadoEm: string;
  atualizadoEm: string;
  resumo: Resumo;
}

/** O db.json inteiro (também o formato do backup). */
export interface BaseV1 {
  meta: { createdAt?: string; seq?: number; [k: string]: unknown };
  settings: Parametros;
  perfis: PapelCusto[];
  servicos: Servico[];
  templates: Template[];
  orcamentos: Orcamento[];
}
