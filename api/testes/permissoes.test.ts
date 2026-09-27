/** Etapa 4: permissões validadas no servidor, custos escondidos pela API, autor gravado, pessoas ao iniciar. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { garantirAdministrador, prepararPessoas, SENHA_TESTE } from "../src/pessoas.js";
import { bancoVazio, criarUsuario, semLog, servidorDeTeste } from "./apoio.js";

let s: Awaited<ReturnType<typeof servidorDeTeste>>;
const cli: Record<string, Awaited<ReturnType<typeof s.entrar>>["req"]> = {};
let orcId = "";

beforeAll(async () => {
  s = await servidorDeTeste();
  await criarUsuario(s.conexao, "adm@x.com", { administrador: true, nome: "Adm" });
  await criarUsuario(s.conexao, "com@x.com", { nome: "Carla", permissoes: ["orcamentos.ver", "orcamentos.editar"] });
  await criarUsuario(s.conexao, "apr@x.com", {
    nome: "Artur",
    permissoes: ["orcamentos.ver", "orcamentos.aprovar", "orcamentos.custos.ver"],
  });
  await criarUsuario(s.conexao, "fin@x.com", {
    nome: "Fê",
    permissoes: ["orcamentos.ver", "orcamentos.custos.ver", "orcamentos.custos.gerenciar"],
  });
  await criarUsuario(s.conexao, "nada@x.com", { nome: "Nada", permissoes: [] });
  for (const [k, e] of Object.entries({
    adm: "adm@x.com",
    com: "com@x.com",
    apr: "apr@x.com",
    fin: "fin@x.com",
    nada: "nada@x.com",
  }))
    cli[k] = (await s.entrar(e)).req;
  orcId = (await cli.adm("POST", "/api/orcamentos", { cliente: "H Stern", templateId: "tp_lume" })).corpo.id;
});
afterAll(() => s.fechar());

describe("permissões por rota", () => {
  it("sem orcamentos.ver não lista nada", async () => {
    expect((await cli.nada("GET", "/api/orcamentos")).status).toBe(403);
    expect((await cli.nada("GET", "/api/db")).status).toBe(403);
  });
  it("comercial edita orçamento mas não mexe em custos, templates nem backup", async () => {
    expect((await cli.com("POST", "/api/orcamentos", { cliente: "C" })).status).toBe(201);
    expect((await cli.com("PUT", "/api/perfis/pf_pm", { custoHora: 1 })).status).toBe(403);
    expect((await cli.com("PUT", "/api/settings", { margemMinima: 0 })).status).toBe(403);
    expect((await cli.com("POST", "/api/templates", { nome: "T" })).status).toBe(403);
    expect((await cli.com("GET", "/api/backup")).status).toBe(403);
    expect((await cli.com("POST", "/api/restore", {})).status).toBe(403);
  });
  it("financeiro gerencia custos mas não edita orçamento", async () => {
    expect((await cli.fin("PUT", "/api/perfis/pf_pm", { custoHora: 23 })).status).toBe(200);
    expect((await cli.fin("PUT", `/api/orcamentos/${orcId}`, { cliente: "X" })).status).toBe(403);
  });
  it("só quem aprova aprova ou devolve; quem edita envia para aprovação", async () => {
    expect((await cli.com("POST", `/api/orcamentos/${orcId}/status`, { status: "em_aprovacao" })).status).toBe(200);
    const r = await cli.com("POST", `/api/orcamentos/${orcId}/status`, { status: "aprovado" });
    expect(r.status).toBe(403);
    expect(r.corpo.erro).toMatch(/Só quem aprova/);
    const ok = await cli.apr("POST", `/api/orcamentos/${orcId}/status`, { status: "aprovado", comentario: "ok" });
    expect(ok.status).toBe(200);
    // histórico e aprovação gravam o usuário logado (nome na tela, id no banco)
    expect(ok.corpo.historico.at(-1)).toMatchObject({ por: "Artur", acao: 'Em aprovação → Aprovado · "ok"' });
    const h = await s.conexao.banco.query<{ email: string }>(
      `SELECT u.email FROM orcamento_historico h JOIN usuarios u ON u.id = h.usuario_id WHERE h.orcamento_id = $1 ORDER BY h.ordem DESC LIMIT 1`,
      [orcId],
    );
    expect(h.rows[0].email).toBe("apr@x.com");
    expect((await cli.apr("PUT", `/api/orcamentos/${orcId}`, { cliente: "Y" })).status).toBe(403);
  });
});

describe("custos escondidos para quem não tem orcamentos.custos.ver", () => {
  it("a API não entrega custo, margem nem política de preço; entrega o preço por linha", async () => {
    const o = (await cli.com("GET", `/api/orcamentos/${orcId}`)).corpo;
    const texto = JSON.stringify(o);
    for (const proibido of ["custoUnit", "custoTotal", "margemReal", '"margem"', "contingencia", "custoHora"])
      expect(texto).not.toContain(proibido);
    expect(o.resumo.tcv).toBeGreaterThan(0);
    const soma = o.itens.reduce((t: number, i: any) => t + i.preco, 0);
    expect(Math.abs(soma - o.resumo.setup)).toBeLessThan(0.1);
    const db = (await cli.com("GET", "/api/db")).corpo;
    expect(db.perfis).toEqual([]);
    expect(JSON.stringify(db)).not.toMatch(/custoUnit|custoHora|custoTotal|margemReal|margemAlvo|margemMinima/);
    expect((await cli.com("GET", "/api/perfis")).status).toBe(403);
    expect(JSON.stringify((await cli.com("GET", "/api/servicos")).corpo)).not.toContain("custoUnit");
    // quem vê custos continua recebendo tudo
    expect(JSON.stringify((await cli.apr("GET", `/api/orcamentos/${orcId}`)).corpo)).toContain("custoUnit");
  });

  it("editar sem ver custos não apaga nem altera custos, margem ou câmbio gravados", async () => {
    const novo = (await cli.adm("POST", "/api/orcamentos", { cliente: "Z", templateId: "tp_lume" })).corpo;
    const visto = (await cli.com("GET", `/api/orcamentos/${novo.id}`)).corpo;
    visto.itens[0].qtd = 50;
    visto.itens[0].custoUnit = 0.01; // tentativa de mudar custo
    const r = await cli.com("PUT", `/api/orcamentos/${novo.id}`, {
      itens: visto.itens,
      params: { ...visto.params, margem: 0.9 },
      cambio: 1,
      premissas: "editado",
    });
    expect(r.status).toBe(200);
    const completo = (await cli.adm("GET", `/api/orcamentos/${novo.id}`)).corpo;
    expect(completo.itens.map((i: any) => i.custoUnit)).toEqual(novo.itens.map((i: any) => i.custoUnit));
    expect(completo.itens[0].qtd).toBe(50);
    expect(completo.params.margem).toBe(novo.params.margem);
    expect(completo.cambio).toBe(novo.cambio);
    expect(completo.premissas).toBe("editado");
    expect(completo.itens.some((i: any) => "preco" in i)).toBe(false);
    // item novo sem ver custos só pelo catálogo
    const r2 = await cli.com("PUT", `/api/orcamentos/${novo.id}`, {
      itens: [...visto.itens, { nome: "x", custoUnit: 1 }],
    });
    expect(r2.status).toBe(400);
    expect((await cli.com("POST", `/api/orcamentos/${novo.id}/item`, { servicoId: "sv_sac", qtd: 2 })).status).toBe(
      200,
    );
  });
});

describe("pessoas ao iniciar", () => {
  it("ADMIN_EMAIL/ADMIN_SENHA criam o primeiro administrador; senha fraca é recusada; com administrador, nada muda", async () => {
    const c = await bancoVazio();
    try {
      await expect(garantirAdministrador(c.banco, { email: "p@x.com", senha: "123", log: semLog })).rejects.toThrow(
        /ADMIN_SENHA/,
      );
      expect(await garantirAdministrador(c.banco, { email: "P@x.com", senha: "UmaSenha#Forte9", log: semLog })).toBe(
        true,
      );
      expect(
        await garantirAdministrador(c.banco, { email: "outro@x.com", senha: "UmaSenha#Forte9", log: semLog }),
      ).toBe(false);
      const r = await c.banco.query("SELECT email, administrador FROM usuarios");
      expect(r.rows).toEqual([{ email: "p@x.com", administrador: true }]);
    } finally {
      await c.fechar();
    }
  });

  it("usuários de teste só com o modo de teste; sem ele, em produção, quem entra com a senha de teste é bloqueado", async () => {
    const c = await bancoVazio();
    try {
      expect(await prepararPessoas(c.banco, { modoTeste: false, producao: false, log: semLog })).toBeUndefined();
      expect((await c.banco.query("SELECT 1 FROM usuarios")).rowCount).toBe(0);
      const acesso = await prepararPessoas(c.banco, { modoTeste: true, producao: false, log: semLog });
      expect(acesso?.senha).toBe(SENHA_TESTE);
      expect(acesso?.emails).toHaveLength(4);
      await prepararPessoas(c.banco, { modoTeste: true, producao: false, log: semLog }); // idempotente
      expect((await c.banco.query("SELECT 1 FROM usuarios")).rowCount).toBe(4);
      await prepararPessoas(c.banco, { modoTeste: false, producao: true, log: semLog });
      const r = await c.banco.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM usuarios WHERE senha_hash IS NOT NULL",
      );
      expect(r.rows[0].n).toBe(0);
    } finally {
      await c.fechar();
    }
  });
});
