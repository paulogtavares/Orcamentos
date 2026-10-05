/**
 * Importação e exportação no formato do db.json da v1.2.1.
 *   - importarBase: grava tudo pelo repositório (upsert por id). Pode rodar mais de uma vez sem
 *     duplicar; com substituir = true (restauração), apaga os dados do módulo antes.
 *   - exportarBase: o banco inteiro no mesmo formato JSON (é o backup).
 *   - cargaInicial: num banco vazio, importa DADOS_DIR/db.json se existir; senão, a carga de exemplo.
 * O db.json nunca é alterado: o importador só lê.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Consulta, Conexao } from "../banco.js";
import {
  gravarMeta,
  gravarOrcamento,
  gravarPapel,
  gravarParametros,
  gravarServico,
  gravarTemplate,
  lerMeta,
  lerParametros,
  listarOrcamentos,
  listarPapeis,
  listarServicos,
  listarTemplates,
} from "./repositorio.js";
import { SETTINGS_GP, sementeV1 } from "./semente.js";
import type { BaseV1 } from "./tipos.js";
import { gravarCliente, listarClientes } from "../clientes.js";

const comId = z.object({ id: z.string().min(1, "Registro sem id no arquivo.") }).passthrough();

/** Formato mínimo de um db.json / backup (mesma checagem da v1.2.1, com mensagens melhores). */
export const esquemaBase = z
  .object({
    meta: z.object({ createdAt: z.string().optional(), seq: z.number().optional() }).passthrough().default({}),
    settings: z.object({}).passthrough(),
    perfis: z.array(comId),
    servicos: z.array(comId).default([]),
    templates: z.array(comId.extend({ itens: z.array(z.object({}).passthrough()).default([]) })).default([]),
    orcamentos: z.array(comId),
    // v2.1.0 (os backups da v1.2.1 e da v2.0.0 não têm)
    clientes: z.array(comId).optional(),
  })
  .passthrough();

export function validarBase(dados: unknown): BaseV1 {
  const r = esquemaBase.safeParse(dados);
  if (!r.success) {
    const e: any = new Error("Arquivo de backup inválido.");
    e.statusCode = 400;
    e.detalhes = r.error.issues;
    throw e;
  }
  return r.data as unknown as BaseV1;
}

export interface ResultadoImportacao {
  parametros: number;
  perfis: number;
  servicos: number;
  templates: number;
  orcamentos: number;
}

export async function importarBase(
  q: Consulta,
  base: BaseV1,
  o: { substituir?: boolean; log?: (m: string) => void } = {},
): Promise<ResultadoImportacao> {
  if (o.substituir) {
    for (const t of ["orcamentos", "templates", "servicos", "papeis_custo", "parametros", "clientes"])
      await q(`DELETE FROM ${t}`);
  }
  // bancos da v1.1.0 não tinham os percentuais de GP: mesma migração que a v1.2.1 fazia ao carregar
  const settings = { ...SETTINGS_GP, ...base.settings };
  for (const k of Object.keys(SETTINGS_GP) as (keyof typeof SETTINGS_GP)[])
    if (base.settings[k] === undefined) o.log?.(`[importação] parâmetro ${k} ausente: usado o padrão ${settings[k]}`);
  await gravarParametros(q, settings);
  await gravarMeta(q, base.meta ?? {}, !!o.substituir);

  for (const [i, p] of base.perfis.entries()) await gravarPapel(q, p, i);
  for (const [i, s] of base.servicos.entries()) await gravarServico(q, s, i);
  for (const [i, t] of base.templates.entries()) await gravarTemplate(q, t, i);
  for (const c of base.clientes ?? []) await gravarCliente(q, c);
  // orçamento ligado a um cliente que não veio no arquivo: fica sem ligação (o texto do cliente continua)
  const idsClientes = new Set((await q<{ id: string }>("SELECT id FROM clientes")).rows.map((r) => r.id));
  // a v1 guarda o mais novo primeiro: o primeiro da lista fica com a maior posição
  const n = base.orcamentos.length;
  for (const [i, orc] of base.orcamentos.entries()) {
    let o2 = orc;
    if (orc.clienteId && !idsClientes.has(String(orc.clienteId).toLowerCase())) {
      o.log?.(
        `[importação] ${orc.numero}: cliente ${orc.clienteId} não está no arquivo; orçamento importado sem ligação`,
      );
      const { clienteId: _x, ...resto } = orc;
      o2 = resto as typeof orc;
    }
    await gravarOrcamento(q, o2, { posicao: n - i });
  }

  return {
    parametros: Object.keys(settings).length,
    perfis: base.perfis.length,
    servicos: base.servicos.length,
    templates: base.templates.length,
    orcamentos: n,
  };
}

/** O banco inteiro no formato do db.json da v1.2.1 (backup). */
export async function exportarBase(q: Consulta): Promise<BaseV1> {
  return {
    meta: await lerMeta(q),
    settings: await lerParametros(q),
    perfis: await listarPapeis(q),
    servicos: await listarServicos(q),
    templates: await listarTemplates(q),
    orcamentos: await listarOrcamentos(q),
    clientes: (await listarClientes(q)).map(({ orcamentos: _n, ...c }) => c),
  };
}

/** Lê e valida um db.json do disco (sem alterar o arquivo). */
export function lerArquivoBase(caminho: string): BaseV1 {
  return validarBase(JSON.parse(readFileSync(caminho, "utf8")));
}

/**
 * Banco sem parâmetros (recém-criado): importa o db.json da v1.2.1 se ele estiver na pasta de dados;
 * senão, grava a carga de exemplo. Numa transação: se falhar, o banco continua vazio e tenta de novo
 * no próximo início.
 */
export async function cargaInicial(c: Conexao, o: { dadosDir?: string; log: (m: string) => void }) {
  const { rows } = await c.banco.query<{ n: number }>("SELECT count(*)::int AS n FROM parametros");
  if (rows[0].n > 0) return null;
  const arquivo = o.dadosDir ? join(o.dadosDir, "db.json") : null;
  if (arquivo && existsSync(arquivo)) {
    const base = lerArquivoBase(arquivo);
    const r = await c.banco.tx(null, (t) => importarBase(t.query, base, { log: o.log }));
    o.log(
      `[db] importado de ${arquivo}: ${r.orcamentos} orçamentos, ${r.servicos} serviços, ${r.perfis} papéis de custo, ${r.templates} templates (o arquivo não foi alterado)`,
    );
    return { origem: "db.json" as const, ...r };
  }
  const r = await c.banco.tx(null, (t) => importarBase(t.query, sementeV1()));
  o.log("[db] primeira execução: banco criado com dados de exemplo");
  return { origem: "exemplo" as const, ...r };
}
