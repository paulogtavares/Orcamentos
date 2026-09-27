/**
 * Leitura e gravação das entidades no schema orcamentos, sempre no formato JSON da v1.2.1.
 * Usado pelas rotas, pelo importador do db.json e pelo backup: um caminho só para os três.
 * Todas as funções recebem a consulta (do banco ou de uma transação).
 */
import type { Consulta } from "../banco.js";
import {
  CAMPOS_HISTORICO,
  CAMPOS_ITEM,
  CAMPOS_ITEM_TEMPLATE,
  CAMPOS_ORCAMENTO,
  CAMPOS_PAPEL,
  CAMPOS_SERVICO,
  CAMPOS_TEMPLATE,
  CAMPOS_VERSAO,
  colunasInsert,
  deColunas,
  paraColunas,
  type Campo,
} from "./mapeamento.js";
import type { Json, Orcamento, PapelCusto, Parametros, Servico, Template } from "./tipos.js";

const PREFIXO_META = "meta:";

// ---------------------------------------------------------------- utilidades

/** INSERT … ON CONFLICT (id) DO UPDATE de uma entidade com colunas + extras (+ colunas adicionais). */
async function upsert(
  q: Consulta,
  tabela: string,
  campos: readonly Campo[],
  obj: Json,
  adicionais: { coluna: string; valor: unknown; atualizar?: boolean }[] = [],
  ignorar: readonly string[] = [],
) {
  const { valores, extras } = paraColunas(obj, campos, ignorar);
  const { nomes, marcadores } = colunasInsert(campos);
  const n = campos.length;
  const colsAd = adicionais.map((a) => a.coluna);
  const marcAd = adicionais.map((_, i) => `$${n + 2 + i}`);
  const atualizar = [
    ...campos.filter((c) => c.coluna !== "id").map((c) => `${c.coluna} = EXCLUDED.${c.coluna}`),
    "extras = EXCLUDED.extras",
    ...adicionais.filter((a) => a.atualizar).map((a) => `${a.coluna} = EXCLUDED.${a.coluna}`),
  ];
  await q(
    `INSERT INTO ${tabela} (${nomes}, extras${colsAd.map((c) => `, ${c}`).join("")})
     VALUES (${marcadores}, $${n + 1}::jsonb${marcAd.map((m) => `, ${m}`).join("")})
     ON CONFLICT (id) DO UPDATE SET ${atualizar.join(", ")}`,
    [...valores, JSON.stringify(extras), ...adicionais.map((a) => a.valor)],
  );
}

/** Insere filhos (itens, versões, histórico) de um pai, na ordem da lista. */
async function inserirFilhos(
  q: Consulta,
  tabela: string,
  chavePai: string,
  idPai: string,
  campos: readonly Campo[],
  lista: Json[],
  adicionais: (obj: Json, i: number) => Record<string, unknown> = () => ({}),
  ignorar: readonly string[] = [],
) {
  for (let i = 0; i < lista.length; i++) {
    const { valores, extras } = paraColunas(lista[i], campos, ignorar);
    const ad = adicionais(lista[i], i);
    const colsAd = Object.keys(ad);
    const { nomes, marcadores } = colunasInsert(campos, 1);
    const base = campos.length + 2;
    await q(
      `INSERT INTO ${tabela} (${chavePai}, ${nomes}, extras${colsAd.map((c) => `, ${c}`).join("")})
       VALUES ($1, ${marcadores}, $${base}::jsonb${colsAd.map((_, j) => `, $${base + 1 + j}`).join("")})`,
      [idPai, ...valores, JSON.stringify(extras), ...Object.values(ad)],
    );
  }
}

const proximaOrdem = async (q: Consulta, tabela: string, coluna = "ordem") =>
  (await q<{ n: number }>(`SELECT coalesce(max(${coluna}), -1)::bigint + 1 AS n FROM ${tabela}`)).rows[0].n;

// ---------------------------------------------------------------- parâmetros

export async function lerParametros(q: Consulta): Promise<Parametros> {
  const { rows } = await q<{ chave: string; valor: unknown }>(
    "SELECT chave, valor FROM parametros WHERE chave NOT LIKE 'meta:%' ORDER BY chave",
  );
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
}

export async function gravarParametros(q: Consulta, valores: Json) {
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined || chave.startsWith(PREFIXO_META)) continue;
    await q(
      `INSERT INTO parametros (chave, valor) VALUES ($1, $2::jsonb)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
      [chave, JSON.stringify(valor)],
    );
  }
}

export async function lerMeta(q: Consulta): Promise<{ createdAt?: string; seq: number }> {
  const criado = await q<{ valor: string }>("SELECT valor FROM parametros WHERE chave = 'meta:createdAt'");
  const seq = await q<{ n: number }>(
    "SELECT (CASE WHEN is_called THEN last_value ELSE 0 END)::int AS n FROM orcamento_numero_seq",
  );
  return { ...(criado.rows[0] ? { createdAt: criado.rows[0].valor } : {}), seq: seq.rows[0].n };
}

export async function gravarMeta(q: Consulta, meta: { createdAt?: string; seq?: number }, substituir = false) {
  if (meta.createdAt)
    await q(
      `INSERT INTO parametros (chave, valor) VALUES ('meta:createdAt', $1::jsonb)
       ON CONFLICT (chave) DO ${substituir ? "UPDATE SET valor = EXCLUDED.valor" : "NOTHING"}`,
      [JSON.stringify(meta.createdAt)],
    );
  // o contador nunca volta atrás (a não ser numa restauração): números já emitidos não se repetem
  const seq = Math.max(0, Math.trunc(Number(meta.seq) || 0));
  const atual = substituir ? 0 : (await lerMeta(q)).seq;
  const alvo = Math.max(seq, atual);
  if (alvo > 0) await q("SELECT setval('orcamento_numero_seq', $1, true)", [alvo]);
  else await q("SELECT setval('orcamento_numero_seq', 1, false)");
}

/** Próximo número de orçamento (ORC-AAAA-NNNN), pela sequência do banco. */
export async function proximoNumero(q: Consulta) {
  const { rows } = await q<{ n: number }>("SELECT nextval('orcamento_numero_seq')::int AS n");
  return `ORC-${new Date().getFullYear()}-${String(rows[0].n).padStart(4, "0")}`;
}

// ---------------------------------------------------------------- papéis de custo e serviços

export async function listarPapeis(q: Consulta): Promise<PapelCusto[]> {
  const { rows } = await q("SELECT * FROM papeis_custo ORDER BY ordem, id");
  return rows.map((r) => deColunas(r, CAMPOS_PAPEL) as PapelCusto);
}

export async function lerPapel(q: Consulta, id: string): Promise<PapelCusto | null> {
  const { rows } = await q("SELECT * FROM papeis_custo WHERE id = $1", [id]);
  return rows[0] ? (deColunas(rows[0], CAMPOS_PAPEL) as PapelCusto) : null;
}

export async function gravarPapel(q: Consulta, p: Json, ordem?: number) {
  const o = ordem ?? (await lerOrdem(q, "papeis_custo", p.id));
  await upsert(q, "papeis_custo", CAMPOS_PAPEL, p, [{ coluna: "ordem", valor: o, atualizar: ordem !== undefined }]);
}

/** Serviço no formato da v1 (um papel inexistente guardado em extras volta como perfilId). */
function servicoDe(linha: Json): Servico {
  const { perfilIdSemPapel, ...s } = deColunas(linha, CAMPOS_SERVICO);
  return (perfilIdSemPapel !== undefined ? { ...s, perfilId: perfilIdSemPapel } : s) as Servico;
}

export async function listarServicos(q: Consulta): Promise<Servico[]> {
  const { rows } = await q("SELECT * FROM servicos ORDER BY ordem, id");
  return rows.map(servicoDe);
}

export async function lerServico(q: Consulta, id: string): Promise<Servico | null> {
  const { rows } = await q("SELECT * FROM servicos WHERE id = $1", [id]);
  return rows[0] ? servicoDe(rows[0]) : null;
}

export async function gravarServico(q: Consulta, s: Json, ordem?: number) {
  const o = ordem ?? (await lerOrdem(q, "servicos", s.id));
  // papel de custo que não existe (a v1 permitia): guarda o id em extras em vez de quebrar a chave estrangeira
  let obj = s;
  if (s.perfilId && !(await lerPapel(q, s.perfilId))) {
    const { perfilId, ...resto } = s;
    obj = { ...resto, perfilIdSemPapel: perfilId };
  }
  await upsert(q, "servicos", CAMPOS_SERVICO, obj, [{ coluna: "ordem", valor: o, atualizar: ordem !== undefined }]);
}

/** Ordem atual de um registro, ou a próxima livre se ele ainda não existe. */
async function lerOrdem(q: Consulta, tabela: string, id: string) {
  const { rows } = await q<{ ordem: number }>(`SELECT ordem FROM ${tabela} WHERE id = $1`, [id]);
  return rows[0]?.ordem ?? (await proximaOrdem(q, tabela));
}

// ---------------------------------------------------------------- templates

export async function listarTemplates(q: Consulta, id?: string): Promise<Template[]> {
  const filtro = id ? "WHERE id = $1" : "";
  const { rows } = await q(`SELECT * FROM templates ${filtro} ORDER BY ordem, id`, id ? [id] : []);
  const itens = await q(
    `SELECT * FROM template_itens ${id ? "WHERE template_id = $1" : ""} ORDER BY template_id, ordem`,
    id ? [id] : [],
  );
  const porTemplate = agrupar(itens.rows, "template_id");
  return rows.map((r) => ({
    ...deColunas(r, CAMPOS_TEMPLATE),
    itens: (porTemplate.get(r.id) ?? []).map((i) => deColunas(i, CAMPOS_ITEM_TEMPLATE)),
  })) as Template[];
}

export async function lerTemplate(q: Consulta, id: string) {
  return (await listarTemplates(q, id))[0] ?? null;
}

export async function gravarTemplate(q: Consulta, t: Json, ordem?: number) {
  const o = ordem ?? (await lerOrdem(q, "templates", t.id));
  await upsert(
    q,
    "templates",
    CAMPOS_TEMPLATE,
    t,
    [{ coluna: "ordem", valor: o, atualizar: ordem !== undefined }],
    ["itens"],
  );
  await q("DELETE FROM template_itens WHERE template_id = $1", [t.id]);
  const itens = Array.isArray(t.itens) ? t.itens : [];
  await inserirFilhos(q, "template_itens", "template_id", t.id, CAMPOS_ITEM_TEMPLATE, itens, (_, i) => ({ ordem: i }));
}

// ---------------------------------------------------------------- orçamentos

function agrupar<T extends Json>(linhas: T[], chave: string) {
  const m = new Map<string, T[]>();
  for (const l of linhas) {
    const k = l[chave];
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(l);
  }
  return m;
}

/** Orçamentos completos (itens, versões e histórico), do mais novo para o mais antigo, como na v1. */
export async function listarOrcamentos(q: Consulta, id?: string, bloquear = false): Promise<Orcamento[]> {
  const filtro = id ? "WHERE id = $1" : "";
  const filtroFilho = id ? "WHERE orcamento_id = $1" : "";
  const p = id ? [id] : [];
  const { rows } = await q(
    `SELECT * FROM orcamentos ${filtro} ORDER BY posicao DESC, id ${bloquear ? "FOR UPDATE" : ""}`,
    p,
  );
  if (!rows.length) return [];
  // em sequência: numa transação a conexão é uma só
  const itens = await q(`SELECT * FROM orcamento_itens ${filtroFilho} ORDER BY orcamento_id, ordem`, p);
  const versoes = await q(`SELECT * FROM orcamento_versoes ${filtroFilho} ORDER BY orcamento_id, v`, p);
  const historico = await q(`SELECT * FROM orcamento_historico ${filtroFilho} ORDER BY orcamento_id, ordem`, p);
  const [pi, pv, ph] = [itens, versoes, historico].map((r) => agrupar(r.rows, "orcamento_id"));
  return rows.map((r) => {
    const o = deColunas(r, CAMPOS_ORCAMENTO);
    // mesma ordem de chaves da v1: itens, versões e histórico antes das datas e do resumo
    const { criadoEm, atualizadoEm, resumo, ...inicio } = o;
    return {
      ...inicio,
      itens: (pi.get(r.id) ?? []).map((l) => deColunas(l, CAMPOS_ITEM)),
      versoes: (pv.get(r.id) ?? []).map((l) => deColunas(l, CAMPOS_VERSAO)),
      historico: (ph.get(r.id) ?? []).map((l) => deColunas(l, CAMPOS_HISTORICO)),
      criadoEm,
      atualizadoEm,
      resumo,
    } as Orcamento;
  });
}

export async function lerOrcamento(q: Consulta, id: string, bloquear = false) {
  return (await listarOrcamentos(q, id, bloquear))[0] ?? null;
}

export interface OpcoesGravacao {
  /** posição na lista (importação); sem ela, um orçamento novo vai para o topo */
  posicao?: number;
  /** usuário logado: autor de um orçamento novo e dos eventos de histórico e versões novos */
  usuarioId?: string | null;
}

/**
 * Grava o orçamento inteiro (linha principal + itens, versões e histórico).
 * Eventos de histórico e versões que já existiam mantêm o usuário que os gravou.
 */
export async function gravarOrcamento(q: Consulta, orc: Json, o: OpcoesGravacao = {}) {
  const existente = await q<{ posicao: number; criado_por: string | null }>(
    "SELECT posicao, criado_por FROM orcamentos WHERE id = $1",
    [orc.id],
  );
  const antes = existente.rows[0];
  const posicao = o.posicao ?? antes?.posicao ?? (await proximaOrdem(q, "orcamentos", "posicao"));
  const autores = new Map<string, string | null>();
  if (antes) {
    const h = await q<{ ordem: number; usuario_id: string | null }>(
      "SELECT ordem, usuario_id FROM orcamento_historico WHERE orcamento_id = $1",
      [orc.id],
    );
    h.rows.forEach((r) => autores.set(`h${r.ordem}`, r.usuario_id));
    const v = await q<{ v: number; usuario_id: string | null }>(
      "SELECT v, usuario_id FROM orcamento_versoes WHERE orcamento_id = $1",
      [orc.id],
    );
    v.rows.forEach((r) => autores.set(`v${r.v}`, r.usuario_id));
  }

  await upsert(
    q,
    "orcamentos",
    CAMPOS_ORCAMENTO,
    orc,
    [
      { coluna: "posicao", valor: posicao, atualizar: true },
      { coluna: "criado_por", valor: antes ? antes.criado_por : (o.usuarioId ?? null), atualizar: false },
    ],
    ["itens", "versoes", "historico"],
  );

  for (const t of ["orcamento_itens", "orcamento_versoes", "orcamento_historico"])
    await q(`DELETE FROM ${t} WHERE orcamento_id = $1`, [orc.id]);

  const itens: Json[] = Array.isArray(orc.itens) ? orc.itens : [];
  await inserirFilhos(q, "orcamento_itens", "orcamento_id", orc.id, CAMPOS_ITEM, itens, (_, i) => ({ ordem: i }));

  const versoes: Json[] = (Array.isArray(orc.versoes) ? orc.versoes : []).map((v: Json, i: number) =>
    Number.isInteger(v?.v) ? v : { ...v, v: i + 1 },
  );
  const quem = (chave: string) => (autores.has(chave) ? autores.get(chave) : (o.usuarioId ?? null));
  await inserirFilhos(q, "orcamento_versoes", "orcamento_id", orc.id, CAMPOS_VERSAO, versoes, (v) => ({
    usuario_id: quem(`v${v.v}`),
  }));

  const historico: Json[] = Array.isArray(orc.historico) ? orc.historico : [];
  await inserirFilhos(q, "orcamento_historico", "orcamento_id", orc.id, CAMPOS_HISTORICO, historico, (_, i) => ({
    ordem: i,
    usuario_id: quem(`h${i}`),
  }));
}

export async function excluirOrcamento(q: Consulta, id: string) {
  return (await q("DELETE FROM orcamentos WHERE id = $1", [id])).rowCount > 0;
}
