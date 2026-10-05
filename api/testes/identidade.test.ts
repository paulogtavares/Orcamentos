/** Etapa 4: identidade pelo SQL do kit (nada copiado do Cronogramas) e administração de usuários do kit. */
import { describe, expect, it } from "vitest";
import { descreverIdentidade, SQL_IDENTIDADE } from "plataforma-kit/identidade";
import { garantirAdministrador } from "../src/pessoas.js";
import { bancoNovo, bancoVazio, criarUsuario, semLog, servidorDeTeste } from "./apoio.js";

describe("identidade do kit", () => {
  it("as tabelas de identidade no schema orcamentos são idênticas às do identidade.sql do kit", async () => {
    const c = await bancoVazio();
    // referência no mesmo motor do teste (PGlite ou PostgreSQL): o catálogo muda entre versões do PostgreSQL
    const ref = await bancoNovo();
    try {
      await ref.motor.exec(SQL_IDENTIDADE);
      // a única diferença permitida é a chave do módulo usuarios.cliente_id → clientes (o identidade.sql do kit
      // deixa essa chave para a migração de cada módulo; no Orçamentos ela vem com o cadastro de clientes, v2.1.0)
      const modulo = await descreverIdentidade(c.banco);
      const kit = await descreverIdentidade(ref.banco);
      const chave = "usuarios.usuarios_cliente_id_fkey";
      expect(modulo.restricoes[chave]).toBe("FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL");
      delete modulo.restricoes[chave];
      expect(modulo).toEqual(kit);
      const m = await c.banco.query<{ nome: string }>("SELECT nome FROM migracoes ORDER BY nome");
      expect(m.rows.map((r) => r.nome)).toEqual(
        expect.arrayContaining(["01_estrutura.sql", "plataforma-kit/identidade.sql"]),
      );
    } finally {
      await c.fechar();
      await ref.fechar();
    }
  });

  it("primeiro administrador por ADMIN_EMAIL/ADMIN_SENHA troca a senha no primeiro acesso", async () => {
    const s = await servidorDeTeste();
    try {
      await garantirAdministrador(s.conexao.banco, { email: "paulo@x.com", senha: "UmaSenha#Forte9", log: semLog });
      const r = await s.app.inject({
        method: "POST",
        url: "/api/auth/entrar",
        payload: { email: "paulo@x.com", senha: "UmaSenha#Forte9" },
      });
      expect(r.statusCode).toBe(200);
      expect(JSON.parse(r.body).precisa_trocar_senha).toBe(true);
    } finally {
      await s.fechar();
    }
  });
});

describe("administração de usuários e perfis (rotas do kit)", () => {
  it("administrador cria perfil pelo catálogo e usuário com senha provisória; quem não é administrador recebe 403", async () => {
    const s = await servidorDeTeste();
    try {
      await criarUsuario(s.conexao, "adm@x.com", { administrador: true });
      await criarUsuario(s.conexao, "com@x.com", { permissoes: ["orcamentos.ver", "orcamentos.editar"] });
      const adm = (await s.entrar("adm@x.com")).req;
      const com = (await s.entrar("com@x.com")).req;
      const cat = (await adm("GET", "/api/admin/permissoes")).corpo;
      expect(JSON.stringify(cat)).toContain("orcamentos.custos.ver");
      const perfil = await adm("POST", "/api/admin/perfis", {
        nome: "Comercial",
        permissoes: ["orcamentos.ver", "orcamentos.editar"],
      });
      expect(perfil.status).toBeLessThan(300);
      const errado = await adm("POST", "/api/admin/perfis", { nome: "Errado", permissoes: ["cronogramas.ver"] });
      expect(errado.status).toBe(400);
      const u = await adm("POST", "/api/admin/usuarios", {
        nome: "Carla",
        email: "carla@x.com",
        perfil_id: perfil.corpo.id,
      });
      expect(u.status, JSON.stringify(u.corpo)).toBeLessThan(300);
      expect(JSON.stringify(u.corpo)).toMatch(/senha/i);
      expect((await com("GET", "/api/admin/usuarios")).status).toBe(403);
    } finally {
      await s.fechar();
    }
  });
});
