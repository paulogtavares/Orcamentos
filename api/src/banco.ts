/**
 * Acesso ao banco, no formato que o plataforma-kit espera (Banco, BancoComTransacao, MotorMigracao):
 *   - DATABASE_URL definida → PostgreSQL (pool do pg);
 *   - sem DATABASE_URL      → PGlite (PostgreSQL embutido) na pasta DADOS_DIR/banco;
 *   - memoria: true         → PGlite em memória (testes).
 * Toda conexão usa search_path = orcamentos, public, e o schema é criado antes do migrador:
 * assim nada do módulo (nem a tabela migracoes) cai em public.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import type { MotorMigracao } from "plataforma-kit/migrador";
import type { Banco, BancoComTransacao, Resultado } from "plataforma-kit/tipos";

export const SCHEMA = "orcamentos";
const SEARCH_PATH = `${SCHEMA}, public`;

export interface Conexao {
  banco: BancoComTransacao;
  motor: MotorMigracao;
  /** "postgres" ou "embutido" (aparece no /api/status) */
  tipo: "postgres" | "embutido";
  /** onde estão os dados, para o log (sem senha) */
  descricao: string;
  fechar(): Promise<void>;
}

export interface OpcoesBanco {
  databaseUrl?: string;
  dadosDir?: string;
  memoria?: boolean;
}

const INFORMAR_USUARIO = "SELECT set_config('app.usuario_id', $1, true)";

export async function abrirBanco(o: OpcoesBanco): Promise<Conexao> {
  const conexao = o.databaseUrl && !o.memoria ? await abrirPostgres(o.databaseUrl) : await abrirEmbutido(o);
  await conexao.motor.exec(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  return conexao;
}

// ---------------------------------------------------------------- PostgreSQL

async function abrirPostgres(url: string): Promise<Conexao> {
  const { default: driver } = await import("pg");
  const pool = new driver.Pool({
    connectionString: url,
    options: `-c search_path=${SEARCH_PATH.replace(" ", "")}`,
    max: 10,
  });
  pool.on("error", (e) => console.error("[banco] conexão perdida:", e.message));

  const query = async <T = any>(sql: string, params?: unknown[]): Promise<Resultado<T>> => {
    const r = await pool.query(sql, params as any[]);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  };

  async function emTransacao<T>(usuarioId: string | null, fn: (c: pg.PoolClient) => Promise<T>) {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      if (usuarioId) await cliente.query(INFORMAR_USUARIO, [usuarioId]);
      const r = await fn(cliente);
      await cliente.query("COMMIT");
      return r;
    } catch (e) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  }

  const consultaDo =
    (c: pg.PoolClient) =>
    async <T = any>(sql: string, params?: unknown[]): Promise<Resultado<T>> => {
      const r = await c.query(sql, params as any[]);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    };

  let host = "postgres";
  try {
    const u = new URL(url);
    host = `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {}

  return {
    tipo: "postgres",
    descricao: `PostgreSQL ${host} (schema ${SCHEMA})`,
    banco: {
      query,
      tx: (usuarioId, fn) => emTransacao(usuarioId, (c) => fn({ query: consultaDo(c) })),
    },
    motor: {
      query,
      exec: async (sql) => void (await pool.query(sql)),
      tx: (fn) =>
        emTransacao(null, (c) => fn({ query: consultaDo(c), exec: async (sql) => void (await c.query(sql)) })),
    },
    fechar: () => pool.end(),
  };
}

// ---------------------------------------------------------------- PGlite (embutido)

async function abrirEmbutido(o: OpcoesBanco): Promise<Conexao> {
  const { PGlite } = await import("@electric-sql/pglite");
  let pasta: string | undefined;
  if (!o.memoria) {
    if (!o.dadosDir) throw new Error("Sem DATABASE_URL, informe DADOS_DIR (pasta dos dados locais).");
    pasta = join(o.dadosDir, "banco");
    mkdirSync(pasta, { recursive: true });
  }
  const db = await PGlite.create(pasta);
  await db.exec(`SET search_path TO ${SEARCH_PATH}`);

  // o PGlite tem uma conexão só: as transações ficam em fila para não se misturarem
  let fila: Promise<unknown> = Promise.resolve();
  const enfileirar = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = fila.then(fn, fn);
    fila = r.catch(() => {});
    return r;
  };

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const consultaDo =
    (c: Tx | typeof db) =>
    async <T = any>(sql: string, params?: unknown[]): Promise<Resultado<T>> => {
      const r = await c.query<T>(sql, params as any[]);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    };

  const query = <T = any>(sql: string, params?: unknown[]) => enfileirar(() => consultaDo(db)<T>(sql, params));
  const emTransacao = <T>(usuarioId: string | null, fn: (t: Tx) => Promise<T>) =>
    enfileirar(() =>
      db.transaction(async (t) => {
        if (usuarioId) await t.query(INFORMAR_USUARIO, [usuarioId]);
        return fn(t);
      }),
    );

  return {
    tipo: "embutido",
    descricao: pasta ? `PGlite em ${pasta} (schema ${SCHEMA})` : `PGlite em memória (schema ${SCHEMA})`,
    banco: {
      query,
      tx: (usuarioId, fn) => emTransacao(usuarioId, (t) => fn({ query: consultaDo(t) })),
    },
    motor: {
      query,
      exec: (sql) => enfileirar(async () => void (await db.exec(sql))),
      tx: (fn) => emTransacao(null, (t) => fn({ query: consultaDo(t), exec: async (sql) => void (await t.exec(sql)) })),
    },
    fechar: () => enfileirar(() => db.close()),
  };
}

/** Consulta de uma transação ou do banco direto (as funções do módulo aceitam as duas). */
export type Consulta = Banco["query"];
