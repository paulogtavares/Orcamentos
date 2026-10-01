/**
 * Estrutura e migrações do banco, aplicadas pelo migrador do kit ao iniciar:
 *   - banco novo (sem orcamentos.parametros): identidade do kit (plataforma-kit/identidade.sql) e db/01_estrutura.sql;
 *   - migrações: db/migracoes/NN_nome.sql, cada uma uma única vez, registradas em orcamentos.migracoes.
 * Os arquivos .sql ficam fora do código (em db/) para quem opera poder lê-los; no pacote, a pasta
 * db/ vai ao lado do server.js.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scriptIdentidade } from "plataforma-kit/identidade";
import { migrar, type Script } from "plataforma-kit/migrador";
import { SCHEMA, type Conexao } from "./banco.js";

export const TABELA_REFERENCIA = `${SCHEMA}.parametros`;
const BASE = ["01_estrutura.sql"];

/** Pasta db/: ao lado do server.js no pacote, ou na raiz do repositório no desenvolvimento. */
export function pastaDb(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [process.env.ORCAMENTOS_DB_DIR, join(aqui, "db"), join(aqui, "..", "..", "db")];
  for (const c of candidatos) if (c && existsSync(join(c, "01_estrutura.sql"))) return c;
  throw new Error(`Pasta db/ não encontrada (procurado em: ${candidatos.filter(Boolean).join(", ")}).`);
}

export function lerScripts(pasta = pastaDb()) {
  const ler = (nome: string): Script => ({ nome, sql: readFileSync(join(pasta, nome), "utf8") });
  const dirMigracoes = join(pasta, "migracoes");
  const migracoes = existsSync(dirMigracoes)
    ? readdirSync(dirMigracoes)
        .filter((n) => /^\d{2,}_.+\.sql$/.test(n))
        .sort()
        .map((n) => ({ nome: n, sql: readFileSync(join(dirMigracoes, n), "utf8") }))
    : [];
  return { base: BASE.map(ler), migracoes };
}

/** Aplica estrutura (se o banco for novo) e migrações pendentes. Devolve o que foi aplicado. */
export async function prepararBanco(c: Conexao, log: (msg: string) => void) {
  const { base, migracoes } = lerScripts();
  const aplicados = await migrar(c.motor, {
    schema: SCHEMA,
    tabelaReferencia: TABELA_REFERENCIA,
    identidade: scriptIdentidade(),
    base,
    migracoes,
    log,
  });
  return { aplicados, bancoNovo: aplicados.includes("01_estrutura.sql") };
}
