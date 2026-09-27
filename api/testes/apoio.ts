/** Banco em memória já preparado (estrutura + carga de exemplo), para os testes. */
import { abrirBanco, type Conexao } from "../src/banco.js";
import { cargaInicial } from "../src/dados/importador.js";
import { prepararBanco } from "../src/migracoes.js";

export const semLog = () => {};

export async function bancoVazio(): Promise<Conexao> {
  const c = await abrirBanco({ memoria: true });
  await prepararBanco(c, semLog);
  return c;
}

export async function bancoComExemplo(): Promise<Conexao> {
  const c = await bancoVazio();
  await cargaInicial(c, { log: semLog });
  return c;
}
