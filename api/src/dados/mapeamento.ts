/**
 * Mapeamento entre o formato JSON da v1.2.1 (db.json, API) e as colunas das tabelas.
 *
 * Sem perda: um valor que não cabe no tipo da coluna (ex.: número gravado como texto "12.5",
 * data inválida) e qualquer campo que a v2 não conhece vão para a coluna "extras" e voltam
 * iguais na leitura. Assim um db.json antigo passa pelo banco e sai no backup como entrou.
 */

export type Tipo = "texto" | "numero" | "logico" | "json" | "data" | "uuid";

export interface Campo {
  /** nome no JSON da v1 */
  json: string;
  /** nome da coluna */
  coluna: string;
  tipo: Tipo;
  /** na leitura, devolve a chave mesmo quando o valor é null (a v1 sempre tinha a chave) */
  sempre?: boolean;
  /** expressão SQL usada quando o valor falta (colunas NOT NULL) */
  padrao?: string;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cabe: Record<Tipo, (v: unknown) => boolean> = {
  texto: (v) => typeof v === "string",
  numero: (v) => typeof v === "number" && Number.isFinite(v),
  logico: (v) => typeof v === "boolean",
  json: (v) => v !== undefined,
  data: (v) => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v),
  uuid: (v) => typeof v === "string" && UUID.test(v),
};

/** Separa um objeto JSON em valores de coluna (na ordem dos campos) e extras. */
export function paraColunas(obj: Record<string, unknown>, campos: readonly Campo[], ignorar: readonly string[] = []) {
  const conhecidos = new Set([...campos.map((c) => c.json), ...ignorar]);
  const extras: Record<string, unknown> = {};
  const valores = campos.map((c) => {
    const v = obj[c.json];
    if (v === undefined) return null;
    if (v === null) {
      if (!c.sempre) extras[c.json] = null; // "null" explícito volta como null, não como ausente
      return null;
    }
    if (cabe[c.tipo](v)) return c.tipo === "json" ? JSON.stringify(v) : v;
    extras[c.json] = v; // não cabe no tipo da coluna: guarda como veio
    return null;
  });
  for (const [k, v] of Object.entries(obj)) if (!conhecidos.has(k) && v !== undefined) extras[k] = v;
  return { valores, extras };
}

/** Monta o objeto JSON a partir de uma linha do banco (colunas + extras). */
export function deColunas(linha: Record<string, any>, campos: readonly Campo[]) {
  const obj: Record<string, unknown> = {};
  for (const c of campos) {
    let v = linha[c.coluna];
    if (v instanceof Date) v = v.toISOString();
    if (v === null || v === undefined) {
      if (c.sempre) obj[c.json] = null;
      continue;
    }
    obj[c.json] = v;
  }
  const extras = linha.extras && typeof linha.extras === "object" ? linha.extras : {};
  return Object.assign(obj, extras);
}

/** tipo explícito de cada parâmetro (sem ele, coalesce($1, 0) faria o Postgres supor inteiro) */
const CAST: Record<Tipo, string> = {
  texto: "text",
  numero: "double precision",
  logico: "boolean",
  json: "jsonb",
  data: "timestamptz",
  uuid: "uuid",
};

/** Lista de colunas para INSERT: "a, b, c" e "$1, $2, $3" (com cast para jsonb onde precisa). */
export function colunasInsert(campos: readonly Campo[], deslocamento = 0) {
  return {
    nomes: campos.map((c) => c.coluna).join(", "),
    marcadores: campos
      .map((c, i) => {
        const m = `$${i + 1 + deslocamento}::${CAST[c.tipo]}`;
        return c.padrao ? `coalesce(${m}, ${c.padrao})` : m;
      })
      .join(", "),
  };
}

// ---------------------------------------------------------------- campos de cada entidade

export const CAMPOS_PAPEL: readonly Campo[] = [
  { json: "id", coluna: "id", tipo: "texto" },
  { json: "nome", coluna: "nome", tipo: "texto", padrao: "''" },
  { json: "categoria", coluna: "categoria", tipo: "texto", padrao: "'Geral'" },
  { json: "moeda", coluna: "moeda", tipo: "texto", padrao: "'BRL'" },
  { json: "custoHora", coluna: "custo_hora", tipo: "numero", padrao: "0" },
  { json: "ativo", coluna: "ativo", tipo: "logico", padrao: "true" },
];

export const CAMPOS_SERVICO: readonly Campo[] = [
  { json: "id", coluna: "id", tipo: "texto" },
  { json: "nome", coluna: "nome", tipo: "texto", padrao: "''" },
  { json: "area", coluna: "area", tipo: "texto", padrao: "'Geral'" },
  { json: "grupo", coluna: "grupo", tipo: "texto", padrao: "''" },
  { json: "tipoCobranca", coluna: "tipo_cobranca", tipo: "texto" },
  { json: "natureza", coluna: "natureza", tipo: "texto", padrao: "'setup'" },
  { json: "perfilId", coluna: "papel_id", tipo: "texto" },
  { json: "unidade", coluna: "unidade", tipo: "texto" },
  { json: "custoUnit", coluna: "custo_unit", tipo: "numero" },
  { json: "moeda", coluna: "moeda", tipo: "texto" },
];

export const CAMPOS_TEMPLATE: readonly Campo[] = [
  { json: "id", coluna: "id", tipo: "texto" },
  { json: "nome", coluna: "nome", tipo: "texto", padrao: "''" },
  { json: "modelo", coluna: "modelo", tipo: "texto", padrao: "'projeto'" },
  { json: "descricao", coluna: "descricao", tipo: "texto", padrao: "''" },
  { json: "params", coluna: "params", tipo: "json", padrao: "'{}'::jsonb" },
];

export const CAMPOS_ITEM_TEMPLATE: readonly Campo[] = [
  { json: "servicoId", coluna: "servico_id", tipo: "texto" },
  { json: "qtd", coluna: "qtd", tipo: "numero" },
  { json: "qtdModo", coluna: "qtd_modo", tipo: "texto" },
  { json: "fator", coluna: "fator", tipo: "numero" },
  { json: "natureza", coluna: "natureza", tipo: "texto" },
  { json: "alocacao", coluna: "alocacao", tipo: "texto" },
  { json: "percHoras", coluna: "perc_horas", tipo: "numero" },
];

export const CAMPOS_ORCAMENTO: readonly Campo[] = [
  { json: "id", coluna: "id", tipo: "texto" },
  { json: "numero", coluna: "numero", tipo: "texto" },
  { json: "cliente", coluna: "cliente", tipo: "texto", padrao: "''" },
  { json: "projeto", coluna: "projeto", tipo: "texto", padrao: "''" },
  { json: "modelo", coluna: "modelo", tipo: "texto", padrao: "'projeto'" },
  { json: "responsavel", coluna: "responsavel", tipo: "texto", padrao: "''" },
  { json: "status", coluna: "status", tipo: "texto", padrao: "'rascunho'" },
  { json: "validade", coluna: "validade", tipo: "texto" },
  { json: "templateId", coluna: "template_id", tipo: "texto", sempre: true },
  // v2.1.0: ligação ao cadastro de clientes (ausente quando não ligado, como nos orçamentos da v1)
  { json: "clienteId", coluna: "cliente_id", tipo: "uuid" },
  { json: "cambio", coluna: "cambio", tipo: "numero" },
  { json: "params", coluna: "params", tipo: "json", padrao: "'{}'::jsonb" },
  { json: "premissas", coluna: "premissas", tipo: "texto", padrao: "''" },
  { json: "resumo", coluna: "resumo", tipo: "json", padrao: "'{}'::jsonb" },
  { json: "criadoEm", coluna: "criado_em", tipo: "data", padrao: "now()" },
  { json: "atualizadoEm", coluna: "atualizado_em", tipo: "data", padrao: "now()" },
];

/** Item do orçamento: mesmos campos do snapshotItem da v1.2.1 (perfilId/perfilNome = papel de custo). */
export const CAMPOS_ITEM: readonly Campo[] = [
  { json: "uid", coluna: "uid", tipo: "texto" },
  { json: "servicoId", coluna: "servico_id", tipo: "texto" },
  { json: "nome", coluna: "nome", tipo: "texto" },
  { json: "area", coluna: "area", tipo: "texto" },
  { json: "grupo", coluna: "grupo", tipo: "texto" },
  { json: "tipoCobranca", coluna: "tipo_cobranca", tipo: "texto" },
  { json: "natureza", coluna: "natureza", tipo: "texto" },
  { json: "unidade", coluna: "unidade", tipo: "texto" },
  { json: "perfilId", coluna: "papel_id", tipo: "texto", sempre: true },
  { json: "perfilNome", coluna: "papel_nome", tipo: "texto", sempre: true },
  { json: "moeda", coluna: "moeda", tipo: "texto" },
  { json: "custoUnit", coluna: "custo_unit", tipo: "numero" },
  { json: "qtd", coluna: "qtd", tipo: "numero" },
  { json: "qtdModo", coluna: "qtd_modo", tipo: "texto" },
  { json: "fator", coluna: "fator", tipo: "numero" },
  { json: "alocacao", coluna: "alocacao", tipo: "texto", sempre: true },
  { json: "percHoras", coluna: "perc_horas", tipo: "numero" },
];

/** Cliente do cadastro mestre (v2.1.0). */
export const CAMPOS_CLIENTE: readonly Campo[] = [
  { json: "id", coluna: "id", tipo: "uuid" },
  { json: "nome", coluna: "nome", tipo: "texto" },
  { json: "documento", coluna: "documento", tipo: "texto", sempre: true },
  { json: "situacao", coluna: "situacao", tipo: "texto", padrao: "'ativo'" },
  { json: "origem", coluna: "origem", tipo: "texto", padrao: "'manual'" },
  { json: "criadoEm", coluna: "criado_em", tipo: "data", padrao: "now()" },
  { json: "atualizadoEm", coluna: "atualizado_em", tipo: "data", padrao: "now()" },
];

export const CAMPOS_VERSAO: readonly Campo[] = [
  { json: "v", coluna: "v", tipo: "numero" },
  { json: "data", coluna: "data", tipo: "data", padrao: "now()" },
  { json: "resumo", coluna: "resumo", tipo: "json", padrao: "'{}'::jsonb" },
  { json: "snapshot", coluna: "snapshot", tipo: "json", padrao: "'{}'::jsonb" },
];

export const CAMPOS_HISTORICO: readonly Campo[] = [
  { json: "data", coluna: "data", tipo: "data", padrao: "now()" },
  { json: "acao", coluna: "acao", tipo: "texto", padrao: "''" },
  { json: "por", coluna: "por", tipo: "texto" },
];
