/** Ambiente do Orçamentos, com as regras comuns do kit (lerAmbiente). */
import { lerAmbiente } from "plataforma-kit/ambiente";

export const MODULO = "orcamentos";
export const PORTA_PADRAO = 3333;

export function lerAmbienteOrcamentos(env: NodeJS.ProcessEnv = process.env) {
  const a = lerAmbiente({ modulo: MODULO, cookiePadrao: "orc_sessao", nomesAntigosDados: ["DATA_DIR"] }, env);
  const avisos = [...a.avisos];
  // v1.2.1: login básico opcional; na v2 o acesso é pelo login do kit
  if (env.APP_USER || env.APP_PASS)
    avisos.push(
      "APP_USER/APP_PASS ignoradas: o login básico foi substituído pelo login da plataforma. Apague as variáveis.",
    );
  if (a.producao && !env.DATABASE_URL?.trim())
    throw new Error(
      "NODE_ENV=production exige DATABASE_URL (PostgreSQL). Sem ela os dados não sobreviveriam a um novo deploy.",
    );
  return { ...a, avisos, porta: a.porta ?? PORTA_PADRAO, databaseUrl: env.DATABASE_URL?.trim() || undefined };
}
export type Ambiente = ReturnType<typeof lerAmbienteOrcamentos>;
