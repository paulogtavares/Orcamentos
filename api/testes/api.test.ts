/** API ponta a ponta (portado do test.js da v1.2.1, agora com login e PGlite em memória). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servidorDeTeste } from "./apoio.js";

const perto = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);
let s: Awaited<ReturnType<typeof servidorDeTeste>>;
let api: Awaited<ReturnType<typeof s.entrar>>["req"];

beforeAll(async () => {
  s = await servidorDeTeste({ ptax: async () => ({ usd: 5.4321, dataCotacao: "2026-09-25 13:00" }) });
  await criarUsuario(s.conexao, "ana@infracommerce.com", { administrador: true, nome: "Ana" });
  api = (await s.entrar("ana@infracommerce.com")).req;
});
afterAll(() => s.fechar());

describe("base do kit", () => {
  it("status, saúde e manifesto sem login; cabeçalhos de iframe do mesmo domínio; sem CORS aberto", async () => {
    const st = await s.app.inject({ url: "/api/status" });
    expect(st.statusCode).toBe(200);
    expect(JSON.parse(st.body)).toMatchObject({
      version: "2.0.0-teste",
      banco: "embutido",
      autenticacao: "local",
      ambiente: "local",
    });
    expect(st.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(st.headers["content-security-policy"]).toBe("frame-ancestors 'self'");
    expect(st.headers["access-control-allow-origin"]).toBeUndefined();
    expect((await s.app.inject({ url: "/api/saude" })).statusCode).toBe(200);
    const m = JSON.parse((await s.app.inject({ url: "/modulo.json" })).body);
    expect(m.permissoes.map((p: any) => p.chave)).toContain("orcamentos.custos.ver");
  });

  it("sem login a API responde 401 no formato { erro, codigo }", async () => {
    const r = await s.app.inject({ url: "/api/db" });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body)).toMatchObject({ erro: expect.any(String), codigo: expect.any(String) });
  });
});

describe("fluxo da v1.2.1", () => {
  it("carga com 3 templates, orçamento Lume, bloqueio de margem, aprovação, versão, bloqueio de edição e custo congelado", async () => {
    const db = (await api("GET", "/api/db")).corpo;
    expect(db.templates).toHaveLength(3);
    expect(db.servicos).toHaveLength(21);

    const orc = (await api("POST", "/api/orcamentos", { cliente: "H Stern", templateId: "tp_lume" })).corpo;
    perto(orc.resumo.tcv, 108150.64);
    expect(orc.numero).toMatch(/^ORC-\d{4}-0001$/);
    expect(orc.historico[0].por).toBe("Ana");

    await api("PUT", "/api/settings", { margemMinima: 0.25 });
    let r = await api("POST", `/api/orcamentos/${orc.id}/status`, { status: "enviado" });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/abaixo da mínima/);

    for (const st of ["em_aprovacao", "aprovado", "enviado", "aceito"]) {
      r = await api("POST", `/api/orcamentos/${orc.id}/status`, { status: st });
      expect(r.status, r.corpo?.erro).toBe(200);
    }
    expect(r.corpo.versoes).toHaveLength(1);
    expect(r.corpo.historico.at(-1).por).toBe("Ana");

    r = await api("PUT", `/api/orcamentos/${orc.id}`, { cliente: "X" });
    expect(r.status).toBe(409);

    await api("PUT", "/api/perfis/pf_design", { custoHora: 100 });
    perto((await api("GET", `/api/orcamentos/${orc.id}`)).corpo.resumo.tcv, 108150.64);
  });

  it("Fullcommerce: GP dedicado, atualizar custos reaplica o %, duplicar numera em sequência", async () => {
    const ful = (await api("POST", "/api/orcamentos", { cliente: "Loja Y", templateId: "tp_full" })).corpo;
    expect(ful.resumo.mensal).toBeGreaterThan(0);
    const gp = ful.itens.find((i: any) => i.servicoId === "sv_gp");
    expect([gp.alocacao, gp.percHoras]).toEqual(["dedicado", 25]);

    await api("PUT", "/api/settings", { gpDedicadoPct: 20 });
    const upd = (await api("POST", `/api/orcamentos/${ful.id}/atualizar-custos`)).corpo;
    expect(upd.itens.find((i: any) => i.servicoId === "sv_gp").percHoras).toBe(20);

    const dup = (await api("POST", `/api/orcamentos/${ful.id}/duplicar`)).corpo;
    expect(dup.numero).not.toBe(ful.numero);
    expect(dup.projeto).toMatch(/\(cópia\)$/);
    const lista = (await api("GET", "/api/orcamentos")).corpo;
    expect(lista[0].id).toBe(dup.id); // mais novo primeiro, como na v1
  });

  it("editar após aprovação volta para rascunho; item novo congela o custo do papel", async () => {
    const o = (await api("POST", "/api/orcamentos", { cliente: "Z", templateId: "tp_ful" })).corpo;
    await api("POST", `/api/orcamentos/${o.id}/status`, { status: "em_aprovacao" });
    const ed = (await api("PUT", `/api/orcamentos/${o.id}`, { premissas: "nova" })).corpo;
    expect(ed.status).toBe("rascunho");
    expect(ed.historico.at(-1).acao).toMatch(/voltou para rascunho/);
    const it = (await api("POST", `/api/orcamentos/${o.id}/item`, { servicoId: "sv_pm", qtd: 10 })).corpo.itens.at(-1);
    expect([it.moeda, it.custoUnit, it.perfilNome]).toEqual(["USD", 22, "Project Manager"]);
  });

  it("cadastros: validação, exclusão protegida e 404", async () => {
    let r = await api("POST", "/api/perfis", { nome: "Arquiteto" });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ categoria: "Geral", moeda: "BRL", custoHora: 0, ativo: true });
    r = await api("PUT", `/api/perfis/${r.corpo.id}`, { moeda: "EUR" });
    expect(r.status).toBe(400);
    expect((await api("DELETE", "/api/perfis/pf_pm")).status).toBe(409);
    expect((await api("DELETE", "/api/servicos/sv_pm")).status).toBe(409);
    expect((await api("POST", "/api/servicos", { nome: "X", tipoCobranca: "hora", natureza: "setup" })).status).toBe(
      400,
    );
    expect((await api("GET", "/api/orcamentos/orc_nao_existe")).status).toBe(404);
    const t = (await api("POST", "/api/templates", { nome: "Novo", itens: [{ servicoId: "sv_pm", qtd: 3 }] })).corpo;
    expect((await api("DELETE", `/api/templates/${t.id}`)).corpo).toEqual({ ok: true });
  });

  it("PTAX buscada pelo servidor", async () => {
    const r = await api("POST", "/api/cambio/ptax");
    expect(r.corpo).toMatchObject({ usd: 5.4321, fonte: "PTAX BCB" });
    expect((await api("GET", "/api/db")).corpo.settings.cambio.usd).toBe(5.4321);
  });

  it("backup e restauração no formato da v1.2.1, com cópia de segurança antes", async () => {
    const b = await api("GET", "/api/backup");
    expect(b.headers["content-disposition"]).toMatch(/orcamentos-backup-/);
    const antes = b.corpo;
    await api("POST", "/api/orcamentos", { cliente: "Depois do backup" });
    expect((await api("POST", "/api/restore", { lixo: true })).status).toBe(400);
    expect((await api("POST", "/api/restore", antes)).corpo).toEqual({ ok: true });
    const depois = (await api("GET", "/api/db")).corpo;
    expect(depois.orcamentos.map((o: any) => o.id)).toEqual(antes.orcamentos.map((o: any) => o.id));
    const c = await s.conexao.banco.query<{ n: number }>("SELECT count(*)::int AS n FROM copias_seguranca");
    expect(c.rows[0].n).toBe(1);
    // restaurar volta também o contador de numeração (igual à v1.2.1, que trocava o db.json inteiro)
    expect(depois.meta.seq).toBe(antes.meta.seq);
  });
});
