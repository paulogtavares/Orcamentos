/** Banco em memória já preparado (estrutura + carga de exemplo), para os testes. */
import { abrirBanco, type Conexao } from "../src/banco.js";
import { cargaInicial } from "../src/dados/importador.js";
import { prepararBanco } from "../src/migracoes.js";

export const semLog = () => {};

/**
 * Banco novo para um teste: PGlite em memória (padrão) ou, com TESTE_PG (conexão de administrador, ex.:
 * postgres://postgres@127.0.0.1:5433/postgres), um banco PostgreSQL recém-criado para o teste.
 */
export async function bancoNovo(): Promise<Conexao> {
  const admin = process.env.TESTE_PG;
  if (!admin) return abrirBanco({ memoria: true });
  const { default: pg } = await import("pg");
  const nome = `teste_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE ${nome}`);
  await c.end();
  const url = new URL(admin);
  url.pathname = `/${nome}`;
  const conexao = await abrirBanco({ databaseUrl: url.toString() });
  const fechar = conexao.fechar;
  conexao.fechar = async () => {
    await fechar();
    const d = new pg.Client({ connectionString: admin });
    await d.connect();
    await d.query(`DROP DATABASE IF EXISTS ${nome}`);
    await d.end();
  };
  return conexao;
}

export async function bancoVazio(): Promise<Conexao> {
  const c = await bancoNovo();
  await prepararBanco(c, semLog);
  return c;
}

export async function bancoComExemplo(): Promise<Conexao> {
  const c = await bancoVazio();
  await cargaInicial(c, { log: semLog });
  return c;
}

// ------------------------------------------------------------ servidor de teste (Fastify inject)
import { gerarHashSenha } from "plataforma-kit/seguranca";
import { criarServidor } from "../src/servidor.js";
import type { Permissao } from "../src/permissoes.js";

export const SENHA = "Senha123!";

/** Cria um usuário (com perfil próprio, se vierem permissões) direto no banco. */
export async function criarUsuario(
  c: Conexao,
  email: string,
  o: { administrador?: boolean; permissoes?: Permissao[]; nome?: string } = {},
) {
  let perfilId: string | null = null;
  if (o.permissoes) {
    const p = await c.banco.query<{ id: string }>(
      "INSERT INTO perfis (nome, permissoes) VALUES ($1, $2) RETURNING id",
      [`Perfil de ${email}`, o.permissoes],
    );
    perfilId = p.rows[0].id;
  }
  const r = await c.banco.query<{ id: string }>(
    "INSERT INTO usuarios (nome, email, administrador, perfil_id, senha_hash, precisa_trocar_senha) VALUES ($1, $2, $3, $4, $5, false) RETURNING id",
    [o.nome ?? email.split("@")[0], email, !!o.administrador, perfilId, await gerarHashSenha(SENHA)],
  );
  return r.rows[0].id;
}

export const SEGREDO_TESTE = "segredo-de-teste-da-plataforma-com-mais-de-32-caracteres";

export async function servidorDeTeste(
  o: {
    conexao?: Conexao;
    ptax?: () => Promise<{ usd: number; dataCotacao: string }>;
    /** "portal": entra só com X-Plataforma-Token assinado com SEGREDO_TESTE */
    modo?: "local" | "portal";
    /** segredo da plataforma (rotas de serviço); padrão: SEGREDO_TESTE */
    segredo?: string | null;
  } = {},
) {
  const conexao = o.conexao ?? (await bancoComExemplo());
  const app = await criarServidor({
    conexao,
    ambiente: {
      producao: false,
      modoTeste: false,
      acesso: {
        modo: o.modo ?? "local",
        nomeCookie: "orc_sessao",
        modulo: "orcamentos",
        ...(o.segredo === null ? {} : { segredoPlataforma: o.segredo ?? SEGREDO_TESTE }),
      },
    },
    versao: "2.0.0-teste",
    data: "2026-09-27",
    manifesto: { id: "orcamentos", nome: "Orçamentos", menu: [] },
    log: semLog,
    ptax: o.ptax,
  });
  await app.ready();

  /** Faz login e devolve um cliente com o cookie da sessão. */
  async function entrar(email: string) {
    const r = await app.inject({ method: "POST", url: "/api/auth/entrar", payload: { email, senha: SENHA } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    const cookie = String(r.headers["set-cookie"]).split(";")[0];
    const req = async (method: string, url: string, payload?: unknown) => {
      const x = await app.inject({ method: method as any, url, headers: { cookie }, payload: payload as any });
      return { status: x.statusCode, corpo: x.body ? JSON.parse(x.body) : null, headers: x.headers };
    };
    return { req, cookie };
  }
  return { app, conexao, entrar, fechar: async () => (await app.close(), await conexao.fechar()) };
}
