/** Sobe o servidor da v1.2.1 (legado/) numa pasta temporária, para gerar um db.json real. */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function servidorV1(porta: number) {
  const pasta = mkdtempSync(join(tmpdir(), "orc-v1-"));
  const proc = spawn(process.execPath, [join(import.meta.dirname, "..", "..", "legado", "server.js")], {
    env: { ...process.env, PORT: String(porta), DATA_DIR: pasta, APP_USER: "", APP_PASS: "" },
    stdio: "ignore",
  });
  const req = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: r.status, corpo: (await r.json()) as any };
  };
  for (let i = 0; i < 100; i++) {
    try {
      await req("GET", "/api/status");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    req,
    pasta,
    lerDb: () => JSON.parse(readFileSync(join(pasta, "db.json"), "utf8")),
    parar: () => {
      proc.kill();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

/** Uso variado da v1.2.1: templates, edição, fluxo de status, versões, duplicação, cadastros. */
export async function popularV1(v1: Awaited<ReturnType<typeof servidorV1>>) {
  const { req } = v1;
  await req("PUT", "/api/settings", { margemMinima: 0.22, cambio: { usd: 5.37, fonte: "manual" } });
  const pf = (
    await req("POST", "/api/perfis", { nome: "Arquiteto", categoria: "Geral", moeda: "USD", custoHora: 31.5 })
  ).corpo;
  const sv = (
    await req("POST", "/api/servicos", {
      nome: "Arquitetura",
      area: "Tecnologia",
      grupo: "",
      tipoCobranca: "hora",
      natureza: "setup",
      perfilId: pf.id,
      unidade: "hora",
    })
  ).corpo;
  await req("POST", "/api/servicos", {
    nome: "Seguro",
    area: "Operação",
    grupo: "",
    tipoCobranca: "fixo",
    natureza: "mensal",
    custoUnit: 199.9,
    moeda: "BRL",
    unidade: "mês",
    perfilId: null,
  });
  const ids: string[] = [];
  for (const [cliente, templateId] of [
    ["H Stern", "tp_lume"],
    ["Loja Y", "tp_full"],
    ["CD Sul", "tp_ful"],
    ["Em branco", ""],
  ]) {
    const o = (
      await req("POST", "/api/orcamentos", {
        cliente,
        projeto: `Projeto ${cliente}`,
        responsavel: "Paulo",
        templateId,
        modelo: "projeto",
      })
    ).corpo;
    ids.push(o.id);
  }
  // edição com item novo, câmbio, parâmetros e item em USD
  await req("POST", `/api/orcamentos/${ids[0]}/item`, { servicoId: sv.id, qtd: 1 });
  let o = (await req("GET", `/api/orcamentos/${ids[0]}`)).corpo;
  o.itens[o.itens.length - 1].qtd = 37.5;
  o.params.contingencia = 0.07;
  o.premissas = "Premissa A\nPremissa B";
  await req("PUT", `/api/orcamentos/${ids[0]}`, o);
  // fluxo até aceito (com aprovação) e versão congelada no envio
  for (const s of ["em_aprovacao", "aprovado", "enviado", "aceito"])
    await req("POST", `/api/orcamentos/${ids[0]}/status`, {
      status: s,
      comentario: s === "aprovado" ? "ok diretoria" : "",
      por: "Paulo",
    });
  // outro: versão manual, atualizar custos após mudar a tabela, perdido
  await req("POST", `/api/orcamentos/${ids[1]}/versao`);
  await req("PUT", "/api/perfis/pf_sac", { custoHora: 141 });
  await req("PUT", "/api/settings", { gpDedicadoPct: 22 });
  await req("POST", `/api/orcamentos/${ids[1]}/atualizar-custos`);
  await req("POST", `/api/orcamentos/${ids[1]}/status`, { status: "enviado", por: "" });
  await req("POST", `/api/orcamentos/${ids[1]}/status`, { status: "perdido", comentario: "preço", por: "Ana" });
  await req("POST", `/api/orcamentos/${ids[2]}/duplicar`);
  o = (await req("GET", `/api/orcamentos/${ids[3]}`)).corpo;
  await req("POST", `/api/orcamentos/${ids[3]}/item`, { servicoId: "sv_gw", qtd: 1 });
  await req("POST", `/api/templates`, {
    nome: "Do H Stern",
    modelo: "projeto",
    descricao: "x",
    params: { margem: 0.3 },
    itens: [{ servicoId: "sv_gp", qtd: 0, qtdModo: "percHoras", percHoras: 25, alocacao: "dedicado" }],
  });
}
