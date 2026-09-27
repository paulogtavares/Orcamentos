/**
 * Contrato: a mesma sequência de chamadas na v1.2.1 (legado/server.js) e na v2 produz os mesmos
 * orçamentos, campo a campo. Ignora só o que muda por natureza: ids, uids, datas e o autor ("por").
 * Cobre criação por template, item novo, edição, fluxo de status com aprovação, versão congelada,
 * versão manual, atualizar custos após mudar a tabela e o % de GP, perdido e duplicação.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servidorDeTeste } from "./apoio.js";
import { servidorV1 } from "./v1.js";

type Req = (m: string, u: string, c?: unknown) => Promise<{ status: number; corpo: any }>;

async function roteiro(req: Req) {
  const r: any[] = [];
  const ids: string[] = [];
  await req("PUT", "/api/settings", { margemMinima: 0.35, cambio: { usd: 5.37, fonte: "manual" } });
  for (const [cliente, templateId] of [
    ["H Stern", "tp_lume"],
    ["Loja Y", "tp_full"],
    ["CD Sul", "tp_ful"],
    ["Branco", ""],
  ])
    ids.push(
      (await req("POST", "/api/orcamentos", { cliente, projeto: `P ${cliente}`, responsavel: "Paulo", templateId }))
        .corpo.id,
    );
  await req("POST", `/api/orcamentos/${ids[0]}/item`, { servicoId: "sv_pm", qtd: 1 });
  const o = (await req("GET", `/api/orcamentos/${ids[0]}`)).corpo;
  o.itens[o.itens.length - 1].qtd = 37.5;
  o.params.contingencia = 0.07;
  o.premissas = "A\nB";
  r.push(
    await req("PUT", `/api/orcamentos/${ids[0]}`, {
      cliente: o.cliente,
      projeto: o.projeto,
      modelo: o.modelo,
      responsavel: o.responsavel,
      validade: o.validade,
      cambio: o.cambio,
      params: o.params,
      premissas: o.premissas,
      itens: o.itens,
    }),
  );
  r.push(await req("POST", `/api/orcamentos/${ids[0]}/status`, { status: "enviado" })); // bloqueado pela margem?
  for (const s of ["em_aprovacao", "aprovado", "enviado", "aceito", "rascunho"])
    r.push(
      await req("POST", `/api/orcamentos/${ids[0]}/status`, { status: s, comentario: s === "aprovado" ? "ok" : "" }),
    );
  r.push(await req("PUT", `/api/orcamentos/${ids[0]}`, { cliente: "X" }));
  r.push(await req("POST", `/api/orcamentos/${ids[1]}/versao`));
  await req("PUT", "/api/perfis/pf_sac", { custoHora: 141 });
  await req("PUT", "/api/settings", { gpDedicadoPct: 22 });
  r.push(await req("POST", `/api/orcamentos/${ids[1]}/atualizar-custos`));
  r.push(await req("POST", `/api/orcamentos/${ids[1]}/status`, { status: "enviado" }));
  r.push(await req("POST", `/api/orcamentos/${ids[1]}/status`, { status: "perdido", comentario: "preço" }));
  r.push(await req("POST", `/api/orcamentos/${ids[1]}/status`, { status: "aceito" }));
  r.push(await req("POST", `/api/orcamentos/${ids[2]}/duplicar`));
  r.push(await req("POST", `/api/orcamentos/${ids[3]}/status`, { status: "em_aprovacao" })); // sem itens
  const lista = (await req("GET", "/api/orcamentos")).corpo;
  return { respostas: r.map((x) => ({ status: x.status, corpo: x.corpo })), lista };
}

const DATA = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;
/** Troca ids, datas e autor por marcadores; mensagens de erro ficam só com o status. */
function normalizar(x: any, chave = ""): any {
  if (Array.isArray(x)) return x.map((v) => normalizar(v));
  if (x && typeof x === "object") {
    if ("error" in x || "erro" in x) return { erro: true };
    return Object.fromEntries(
      Object.entries(x)
        .filter(([k]) => k !== "por")
        .map(([k, v]) => [k, normalizar(v, k)]),
    );
  }
  if (typeof x === "string" && ["id", "uid"].includes(chave)) return "<id>";
  if (typeof x === "string" && DATA.test(x)) return "<data>";
  return x;
}

let v1: Awaited<ReturnType<typeof servidorV1>>;
let s: Awaited<ReturnType<typeof servidorDeTeste>>;
beforeAll(async () => {
  v1 = await servidorV1(3996);
  s = await servidorDeTeste();
  await criarUsuario(s.conexao, "ana@infracommerce.com", { administrador: true, nome: "Ana" });
}, 60_000);
afterAll(async () => {
  v1.parar();
  await s.fechar();
});

describe("contrato com a v1.2.1", () => {
  it("mesmas respostas (status e corpo) e mesma lista final de orçamentos", async () => {
    const a = await roteiro(v1.req);
    const { req } = await s.entrar("ana@infracommerce.com");
    const b = await roteiro(req);
    expect(normalizar(b.respostas.map((x) => x.status))).toEqual(a.respostas.map((x) => x.status));
    expect(normalizar(b.respostas)).toEqual(normalizar(a.respostas));
    expect(normalizar(b.lista)).toEqual(normalizar(a.lista));
    // o roteiro precisa exercitar de fato os casos de erro e produzir orçamentos com conteúdo
    expect(a.respostas.map((x) => x.status)).toEqual([
      200, 422, 200, 200, 200, 200, 422, 409, 200, 200, 200, 200, 422, 201, 422,
    ]);
    expect(a.lista).toHaveLength(5);
    expect(a.lista.flatMap((o: any) => o.versoes)).toHaveLength(3);
    expect(b.lista[4].itens.at(-1).qtd).toBe(37.5);
  });
});
