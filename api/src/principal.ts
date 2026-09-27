/**
 * Início do servidor: lê o ambiente, abre o banco, aplica estrutura e migrações, faz a carga
 * inicial (db.json da v1.2.1 ou exemplo) e sobe o Fastify.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { lerAmbienteOrcamentos } from "./ambiente.js";
import { abrirBanco } from "./banco.js";
import { cargaInicial } from "./dados/importador.js";
import { prepararBanco } from "./migracoes.js";
import { criarServidor, lerManifesto } from "./servidor.js";
import { lerVersao } from "./versao.js";

const log = (msg: string) => console.log(new Date().toLocaleTimeString("pt-BR"), msg);
const aqui = dirname(fileURLToPath(import.meta.url));
/** no pacote, tudo fica ao lado do server.js; no desenvolvimento, na raiz do repositório */
const raiz = existsSync(join(aqui, "modulo.json")) ? aqui : join(aqui, "..", "..");

async function iniciar() {
  const amb = lerAmbienteOrcamentos();
  const { versao, data } = lerVersao();
  for (const e of amb.erros) console.error(`\n  !!! ${e}\n`);
  for (const a of amb.avisos) log(`[aviso] ${a}`);

  const dadosDir = amb.dadosDir ?? join(raiz, "dados");
  const conexao = await abrirBanco({ databaseUrl: amb.databaseUrl, dadosDir });
  const { aplicados } = await prepararBanco(conexao, log);
  if (aplicados.length) log(`[db] aplicado: ${aplicados.join(", ")}`);
  await cargaInicial(conexao, { dadosDir, log });

  const pastaFront = [raiz, join(raiz, "web", "dist")].find((p) => existsSync(join(p, "public", "index.html")));
  const app = await criarServidor({
    conexao,
    ambiente: amb,
    versao,
    data,
    pastaFront,
    manifesto: lerManifesto(join(raiz, "modulo.json")),
    log,
  });

  await app.listen({ port: amb.porta, host: amb.host });
  const endereco = `http://${amb.host === "0.0.0.0" ? "localhost" : amb.host}:${amb.porta}`;
  console.log(
    `\n  ============================================\n   Orçamentos  v${versao} · ${data}\n  ============================================\n`,
  );
  log(`Ambiente: ${amb.ambiente} · login ${amb.acesso.modo} · dados: ${conexao.descricao}`);
  if (!pastaFront) log("[aviso] tela não compilada (web/dist/public): só a API está disponível");
  log(`Pronto: ${endereco}`);

  const encerrar = async () => {
    await app.close();
    await conexao.fechar();
    process.exit(0);
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}

iniciar().catch((e) => {
  if (e?.code === "EADDRINUSE") console.error(`\n  A porta já está em uso (outro Orçamentos rodando?).\n`);
  else console.error("\n  Erro ao iniciar:", e?.message ?? e, "\n");
  process.exit(1);
});
