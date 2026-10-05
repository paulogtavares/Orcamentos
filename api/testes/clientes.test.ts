/** v2.1.0: cadastro de clientes, importação do Cronogramas, ligação dos orçamentos, rota interna e modo portal. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitirToken, emitirTokenServico } from "plataforma-kit/portal";
import { migrar } from "plataforma-kit/migrador";
import { scriptIdentidade } from "plataforma-kit/identidade";
import { normalizarNome, parecidos } from "../src/clientes.js";
import { lerScripts, prepararBanco, TABELA_REFERENCIA } from "../src/migracoes.js";
import { prepararPessoas } from "../src/pessoas.js";
import { SCHEMA } from "../src/banco.js";
import {
  bancoComExemplo,
  bancoNovo,
  bancoVazio,
  criarUsuario,
  SEGREDO_TESTE,
  semLog,
  servidorDeTeste,
} from "./apoio.js";

// ids "do Cronogramas"
const ID_HSTERN = "11111111-1111-4111-8111-111111111111";
const ID_LOJAY = "22222222-2222-4222-8222-222222222222";
const ID_NOVO = "33333333-3333-4333-8333-333333333333";

describe("normalização de nomes", () => {
  it("ignora acentos, caixa, pontuação e sufixos societários", () => {
    expect(normalizarNome("  H. Stern Comércio LTDA ")).toBe("h stern comercio");
    expect(normalizarNome("Loja  Y S/A")).toBe("loja y");
    expect(normalizarNome("LOJA Y s.a.")).toBe("loja y");
    expect(normalizarNome("Açaí & Cia")).toBe("acai");
  });
  it("aponta nomes parecidos sem confundir nomes diferentes", () => {
    expect(parecidos("loja y", "lojas y")).toBe(true);
    expect(parecidos("h stern", "h stern joias")).toBe(true);
    expect(parecidos("loja y", "loja z")).toBe(false); // diferem só numa palavra de uma letra
    expect(parecidos("acme", "acme")).toBe(false);
    expect(parecidos("infracommerce", "magazine")).toBe(false);
  });
});

describe("migração 02_clientes", () => {
  it("um banco da v2.0.0 recebe o cadastro de clientes sem perder nada, e reiniciar não reaplica", async () => {
    const c = await bancoNovo();
    try {
      // banco como a v2.0.0 deixou: só identidade + estrutura, sem a migração
      const { base } = lerScripts();
      await migrar(c.motor, {
        schema: SCHEMA,
        tabelaReferencia: TABELA_REFERENCIA,
        identidade: scriptIdentidade(),
        base,
        migracoes: [],
        log: semLog,
      });
      // orçamento gravado como a v2.0.0 gravava (sem a coluna cliente_id, que ainda não existe)
      await c.banco.query("INSERT INTO orcamentos (id, numero, cliente) VALUES ('orc_a', 'ORC-2026-0001', 'H Stern')");
      const r = await prepararBanco(c, semLog);
      expect(r).toEqual({ aplicados: ["02_clientes.sql"], bancoNovo: false });
      const o = await c.banco.query("SELECT cliente, cliente_id FROM orcamentos WHERE id = 'orc_a'");
      expect(o.rows[0]).toEqual({ cliente: "H Stern", cliente_id: null });
      expect((await prepararBanco(c, semLog)).aplicados).toEqual([]);
    } finally {
      await c.fechar();
    }
  });
});

describe("cadastro, permissões e orçamentos ligados", () => {
  let s: Awaited<ReturnType<typeof servidorDeTeste>>;
  const cli: Record<string, Awaited<ReturnType<typeof s.entrar>>["req"]> = {};
  beforeAll(async () => {
    s = await servidorDeTeste();
    await criarUsuario(s.conexao, "adm@x.com", { administrador: true, nome: "Adm" });
    await criarUsuario(s.conexao, "com@x.com", { nome: "Carla", permissoes: ["orcamentos.ver", "orcamentos.editar"] });
    await criarUsuario(s.conexao, "cad@x.com", {
      nome: "Cadu",
      permissoes: ["orcamentos.ver", "orcamentos.clientes.gerenciar"],
    });
    await criarUsuario(s.conexao, "ler@x.com", { nome: "Lia", permissoes: ["orcamentos.ver"] });
    for (const [k, e] of Object.entries({ adm: "adm@x.com", com: "com@x.com", cad: "cad@x.com", ler: "ler@x.com" }))
      cli[k] = (await s.entrar(e)).req;
  });
  afterAll(() => s.fechar());

  it("quem gerencia cadastra; quem edita orçamentos só lista; quem só vê orçamentos não acessa", async () => {
    const r = await cli.cad("POST", "/api/clientes", { nome: "H Stern", documento: "12.345.678/0001-90" });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      nome: "H Stern",
      documento: "12345678000190",
      situacao: "ativo",
      origem: "manual",
    });
    expect((await cli.com("GET", "/api/clientes")).status).toBe(200);
    expect((await cli.com("POST", "/api/clientes", { nome: "X" })).status).toBe(403);
    expect((await cli.ler("GET", "/api/clientes")).status).toBe(403);
    expect((await cli.cad("POST", "/api/clientes", { nome: "Y", documento: "123" })).status).toBe(400);
    const dup = await cli.cad("POST", "/api/clientes", { nome: "Outro", documento: "12345678000190" });
    expect(dup.status).toBe(400); // documento único: o kit traduz a restrição para a mensagem do módulo
    expect(dup.corpo.erro).toBe("Já existe um cliente com esse documento.");
  });

  it("orçamento ligado ao cadastro: o nome vem do cadastro; renomear só muda orçamentos não enviados; excluir exige não ter orçamentos", async () => {
    const c = (await cli.cad("POST", "/api/clientes", { nome: "Loja Y" })).corpo;
    const o1 = (
      await cli.com("POST", "/api/orcamentos", { cliente: "texto qualquer", clienteId: c.id, templateId: "tp_ful" })
    ).corpo;
    expect(o1).toMatchObject({ cliente: "Loja Y", clienteId: c.id });
    const o2 = (await cli.com("POST", "/api/orcamentos", { clienteId: c.id, templateId: "tp_ful" })).corpo;
    await cli.adm("POST", `/api/orcamentos/${o2.id}/status`, { status: "enviado" });
    await cli.cad("PUT", `/api/clientes/${c.id}`, { nome: "Loja Y Comércio" });
    expect((await cli.com("GET", `/api/orcamentos/${o1.id}`)).corpo.cliente).toBe("Loja Y Comércio");
    expect((await cli.com("GET", `/api/orcamentos/${o2.id}`)).corpo.cliente).toBe("Loja Y"); // a proposta enviada não muda
    const del = await cli.cad("DELETE", `/api/clientes/${c.id}`);
    expect(del.status).toBe(409);
    expect(del.corpo.erro).toMatch(/Inative-o/);
    // desligar mantém o texto; ligar a um id que não existe é recusado
    const sem = (await cli.com("PUT", `/api/orcamentos/${o1.id}`, { clienteId: null })).corpo;
    expect(sem).toMatchObject({ cliente: "Loja Y Comércio", clienteId: null });
    expect((await cli.com("PUT", `/api/orcamentos/${o1.id}`, { clienteId: ID_NOVO })).status).toBe(400);
    expect((await cli.com("POST", "/api/orcamentos", { clienteId: "nao-e-uuid" })).status).toBe(400);
  });

  it("o backup leva o cadastro e a ligação, e a restauração volta igual", async () => {
    const antes = (await cli.adm("GET", "/api/backup")).corpo;
    expect(antes.clientes.length).toBeGreaterThan(0);
    expect(antes.orcamentos.some((o: any) => o.clienteId)).toBe(true);
    expect((await cli.adm("POST", "/api/restore", antes)).status).toBe(200);
    const depois = (await cli.adm("GET", "/api/backup")).corpo;
    expect(depois.clientes).toEqual(antes.clientes);
    expect(depois.orcamentos).toEqual(antes.orcamentos);
  });
});

describe("importação do Cronogramas", () => {
  let s: Awaited<ReturnType<typeof servidorDeTeste>>;
  let adm: Awaited<ReturnType<typeof s.entrar>>["req"];
  beforeAll(async () => {
    s = await servidorDeTeste();
    await criarUsuario(s.conexao, "adm@x.com", { administrador: true, nome: "Adm" });
    adm = (await s.entrar("adm@x.com")).req;
  });
  afterAll(() => s.fechar());

  it("prévia, união com clientes locais (por documento e por nome), ids do Cronogramas e reimportação sem mudanças", async () => {
    // clientes criados à mão antes da importação, com orçamentos ligados
    const local1 = (await adm("POST", "/api/clientes", { nome: "H. Stern Ltda", documento: "12345678000190" })).corpo;
    const local2 = (await adm("POST", "/api/clientes", { nome: "LOJA Y S/A" })).corpo;
    const o1 = (await adm("POST", "/api/orcamentos", { clienteId: local1.id, templateId: "tp_lume" })).corpo;
    const o2 = (await adm("POST", "/api/orcamentos", { clienteId: local2.id, templateId: "tp_ful" })).corpo;
    const arquivo = JSON.stringify([
      { id: ID_HSTERN, nome: "H Stern", cnpj: "12.345.678/0001-90", ativo: true },
      { id: ID_LOJAY, nome: "Loja Y", situacao: "ativo" },
      { id: ID_NOVO, nome: "Cliente Novo", documento: "abc", status: "inativo" },
      { id: "nao-e-uuid", nome: "Ruim" },
      { id: ID_NOVO, nome: "Repetido" },
    ]);
    const previa = (await adm("POST", "/api/clientes/importacao", { conteudo: arquivo, arquivo: "clientes.json" }))
      .corpo;
    expect(previa.resumo).toEqual({ criar: 1, atualizar: 0, igual: 0, unir: 2 });
    expect(previa.itens.find((i: any) => i.linha.id === ID_HSTERN).unirCom).toMatchObject({
      id: local1.id,
      motivo: "documento",
      orcamentos: 1,
    });
    expect(previa.itens.find((i: any) => i.linha.id === ID_LOJAY).unirCom).toMatchObject({
      id: local2.id,
      motivo: "nome",
    });
    expect(previa.erros).toHaveLength(3); // documento inválido, id inválido, id repetido
    // a prévia não grava nada
    expect((await adm("GET", "/api/clientes")).corpo.map((c: any) => c.id).sort()).toEqual(
      [local1.id, local2.id].sort(),
    );

    const r = (
      await adm("POST", "/api/clientes/importacao", { conteudo: arquivo, arquivo: "clientes.json", confirmar: true })
    ).corpo;
    expect(r.resumo).toEqual({ criar: 1, atualizar: 0, igual: 0, unir: 2 });
    const lista = (await adm("GET", "/api/clientes")).corpo;
    expect(lista.map((c: any) => c.id).sort()).toEqual([ID_HSTERN, ID_LOJAY, ID_NOVO].sort());
    expect(lista.find((c: any) => c.id === ID_HSTERN)).toMatchObject({
      nome: "H Stern",
      documento: "12345678000190",
      origem: "cronogramas",
      orcamentos: 1,
    });
    expect(lista.find((c: any) => c.id === ID_NOVO)).toMatchObject({ situacao: "inativo", documento: null });
    // os orçamentos dos clientes locais passaram para os ids do Cronogramas, com o nome do cadastro
    expect((await adm("GET", `/api/orcamentos/${o1.id}`)).corpo).toMatchObject({
      clienteId: ID_HSTERN,
      cliente: "H Stern",
    });
    expect((await adm("GET", `/api/orcamentos/${o2.id}`)).corpo).toMatchObject({
      clienteId: ID_LOJAY,
      cliente: "Loja Y",
    });

    // reimportar o mesmo arquivo não muda nada; um CSV com nome novo só atualiza
    const de_novo = (await adm("POST", "/api/clientes/importacao", { conteudo: arquivo })).corpo;
    expect(de_novo.resumo).toEqual({ criar: 0, atualizar: 0, igual: 3, unir: 0 });
    const csv = `id;nome;documento;situação\n${ID_LOJAY};"Loja Y; Matriz";;ativo\n`;
    const p2 = (await adm("POST", "/api/clientes/importacao", { conteudo: csv })).corpo;
    expect(p2.resumo).toEqual({ criar: 0, atualizar: 1, igual: 0, unir: 0 });
    expect(p2.itens[0].mudancas).toEqual(['nome: "Loja Y" → "Loja Y; Matriz"']);
  });

  it("usuários externos podem apontar para os clientes importados (chave estrangeira do módulo)", async () => {
    await s.conexao.banco.query(
      "INSERT INTO usuarios (nome, email, tipo, cliente_id) VALUES ('Externo', 'ext@cliente.com', 'externo', $1)",
      [ID_HSTERN],
    );
    await expect(
      s.conexao.banco.query(
        "INSERT INTO usuarios (nome, email, tipo, cliente_id) VALUES ('X', 'x@c.com', 'externo', $1)",
        ["44444444-4444-4444-8444-444444444444"],
      ),
    ).rejects.toThrow();
  });

  it("arquivo sem nenhum cliente válido é recusado com a explicação", async () => {
    const r = await adm("POST", "/api/clientes/importacao", { conteudo: '[{"nome":"Sem id"}]' });
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(/id ausente ou inválido/);
  });
});

describe("ligação dos orçamentos ao cadastro", () => {
  it("agrupa os textos, sugere o cliente, avisa de parecidos e liga só o que foi revisado", async () => {
    const s = await servidorDeTeste();
    try {
      await criarUsuario(s.conexao, "adm@x.com", { administrador: true });
      const adm = (await s.entrar("adm@x.com")).req;
      const hstern = (await adm("POST", "/api/clientes", { nome: "H Stern" })).corpo;
      const criar = async (cliente: string, status?: string) => {
        const o = (await adm("POST", "/api/orcamentos", { cliente, templateId: "tp_ful" })).corpo;
        if (status) await adm("POST", `/api/orcamentos/${o.id}/status`, { status });
        return o.id as string;
      };
      const a = await criar("H Stern");
      const b = await criar("H. STERN LTDA", "enviado");
      const c = await criar("Loja Y");
      const d = await criar("Loja  Y S/A");
      const e = await criar("Lojas Y");
      const previa = (await adm("GET", "/api/clientes/ligacao")).corpo;
      const g = Object.fromEntries(previa.grupos.map((x: any) => [x.chave, x]));
      expect(g["h stern"].textos.map((t: any) => t.texto).sort()).toEqual(["H Stern", "H. STERN LTDA"]);
      expect(g["h stern"].sugestao).toEqual({ id: hstern.id, nome: "H Stern" });
      expect(g["loja y"].orcamentos).toBe(2);
      expect(g["loja y"].parecidosGrupos).toEqual(["lojas y"]); // possível duplicado para revisar
      expect(g["lojas y"].sugestao).toBeNull();

      // revisão: H Stern → cadastro; Loja Y e Lojas Y → um cliente novo (eram o mesmo); nada mais
      const r = await adm("POST", "/api/clientes/ligacao", {
        grupos: [
          { textos: g["h stern"].textos.map((t: any) => t.texto), destino: { clienteId: hstern.id } },
          {
            textos: [...g["loja y"].textos.map((t: any) => t.texto), "Lojas Y"],
            destino: { novo: { nome: "Loja Y" } },
          },
        ],
      });
      expect(r.corpo).toEqual({ ligados: 5, criados: 1 });
      const ver = async (id: string) => (await adm("GET", `/api/orcamentos/${id}`)).corpo;
      expect(await ver(a)).toMatchObject({ clienteId: hstern.id, cliente: "H Stern" });
      expect(await ver(b)).toMatchObject({ clienteId: hstern.id, cliente: "H. STERN LTDA" }); // enviado: mantém o nome da proposta
      const novo = (await ver(c)).clienteId;
      expect((await ver(d)).clienteId).toBe(novo);
      expect((await ver(e)).clienteId).toBe(novo);
      expect((await ver(e)).cliente).toBe("Loja Y");
      expect((await adm("GET", "/api/clientes/ligacao")).corpo.grupos).toEqual([]);
    } finally {
      await s.fechar();
    }
  });
});

describe("rota interna de clientes (token de serviço, kit 1.5.0)", () => {
  let s: Awaited<ReturnType<typeof servidorDeTeste>>;
  const servico = (permissoes: string[], destino = "orcamentos") =>
    emitirTokenServico({ origem: "cronogramas", destino, permissoes }, { segredo: SEGREDO_TESTE });
  const chamar = async (token?: string, url = "/api/interno/clientes") => {
    const r = await s.app.inject({ url, headers: token ? { "x-plataforma-token": token } : {} });
    return { status: r.statusCode, corpo: JSON.parse(r.body) };
  };
  beforeAll(async () => {
    s = await servidorDeTeste();
    await criarUsuario(s.conexao, "adm@x.com", { administrador: true });
    const adm = (await s.entrar("adm@x.com")).req;
    await adm("POST", "/api/clientes", { nome: "H Stern", documento: "12345678000190" });
    await adm("POST", "/api/clientes", { nome: "Loja Y", situacao: "inativo" });
  });
  afterAll(() => s.fechar());

  it("aceita o token de serviço com orcamentos.clientes.ler e devolve o cadastro", async () => {
    const r = await chamar(await servico(["orcamentos.clientes.ler"]));
    expect(r.status).toBe(200);
    expect(r.corpo.completo).toBe(true);
    expect(r.corpo.clientes.map((c: any) => [c.nome, c.documento, c.situacao])).toEqual([
      ["H Stern", "12345678000190", "ativo"],
      ["Loja Y", null, "inativo"],
    ]);
    // incremental: só os alterados depois da data
    const futuro = new Date(Date.now() + 60_000).toISOString();
    const inc = await chamar(
      await servico(["orcamentos.clientes.ler"]),
      `/api/interno/clientes?desde=${encodeURIComponent(futuro)}`,
    );
    expect(inc.corpo).toMatchObject({ completo: false, clientes: [] });
  });

  it("recusa sem token, com permissão errada, com token de usuário, de outro módulo e sem cookie valer", async () => {
    expect((await chamar()).status).toBe(401);
    expect((await chamar(await servico(["orcamentos.ver"]))).status).toBe(403);
    expect((await chamar(await servico(["cronogramas.ler"], "cronogramas"))).status).toBe(401);
    const usuario = await emitirToken(
      { id: ID_NOVO, email: "u@x.com", tipo: "interno", permissoes: ["orcamentos.clientes.ler", "orcamentos.ver"] },
      "orcamentos",
      { segredo: SEGREDO_TESTE },
    );
    expect((await chamar(usuario)).status).toBe(401);
    // a sessão de um administrador logado não abre a rota interna
    const { cookie } = await s.entrar("adm@x.com");
    expect((await s.app.inject({ url: "/api/interno/clientes", headers: { cookie } })).statusCode).toBe(401);
  });

  it("sem SEGREDO_PLATAFORMA, nenhuma chamada entre módulos é aceita (503)", async () => {
    const sem = await servidorDeTeste({ segredo: null });
    try {
      const r = await sem.app.inject({
        url: "/api/interno/clientes",
        headers: { "x-plataforma-token": await servico(["orcamentos.clientes.ler"]) },
      });
      expect(r.statusCode).toBe(503);
    } finally {
      await sem.fechar();
    }
  });
});

describe("AUTH_MODO=portal", () => {
  it("o início não cria administrador local nem usuários de teste, mesmo com ADMIN_EMAIL e MODO_TESTE", async () => {
    const c = await bancoVazio();
    try {
      const avisos: string[] = [];
      const acesso = await prepararPessoas(c.banco, {
        modo: "portal",
        modoTeste: true,
        producao: true,
        adminEmail: "paulo@infracommerce.com",
        adminSenha: "UmaSenha#Forte9",
        log: (m) => avisos.push(m),
      });
      expect(acesso).toBeUndefined();
      expect((await c.banco.query("SELECT 1 FROM usuarios")).rowCount).toBe(0);
      expect(avisos.join("\n")).toMatch(
        /usuários e perfis vêm do portal; ignoradas: ADMIN_EMAIL, ADMIN_SENHA, MODO_TESTE/,
      );
    } finally {
      await c.fechar();
    }
  });

  it("por isso o login pelo portal funciona; um usuário local com o mesmo e-mail o bloquearia (409)", async () => {
    const s = await servidorDeTeste({ conexao: await bancoComExemplo(), modo: "portal" });
    try {
      const token = (id: string, email: string) =>
        emitirToken({ id, email, nome: "Paulo", tipo: "interno", permissoes: ["orcamentos.ver"] }, "orcamentos", {
          segredo: SEGREDO_TESTE,
        });
      const comToken = async (t: string) =>
        (await s.app.inject({ url: "/api/orcamentos", headers: { "x-plataforma-token": t } })).statusCode;
      // sem usuário local (o que o início garante no modo portal): entra
      expect(await comToken(await token(ID_HSTERN, "paulo@infracommerce.com"))).toBe(200);
      // o risco que o ajuste evita: um usuário local com o mesmo e-mail de outra pessoa do portal
      await criarUsuario(s.conexao, "ana@infracommerce.com", { administrador: true });
      expect(await comToken(await token(ID_LOJAY, "ana@infracommerce.com"))).toBe(409);
    } finally {
      await s.fechar();
    }
  });
});
