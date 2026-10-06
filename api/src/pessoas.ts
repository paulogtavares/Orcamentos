/**
 * Pessoas do módulo ao iniciar:
 *   - primeiro administrador por ADMIN_EMAIL e ADMIN_SENHA, só quando não há administrador com senha
 *     (troca a senha no primeiro acesso, como no Cronogramas);
 *   - usuários de teste (um por perfil de trabalho) só com o modo de teste ligado (MODO_TESTE=1,
 *     que o kit ignora em nuvem);
 *   - sem modo de teste, a auditoria do kit bloqueia em produção quem ainda entra com a senha de teste.
 */
import { auditarUsuariosDeTeste } from "plataforma-kit/usuariosTeste";
import { gerarHashSenha, validarForcaSenha } from "plataforma-kit/seguranca";
import type { Banco } from "plataforma-kit/tipos";
import type { Permissao } from "./permissoes.js";

export const SENHA_TESTE = "teste123";

/** Perfis de trabalho de exemplo (e os usuários de teste de cada um). */
export const PERFIS_TESTE: { perfil: string; email: string; nome: string; permissoes: Permissao[] }[] = [
  {
    perfil: "Comercial",
    email: "comercial@teste.local",
    nome: "Carla Comercial",
    permissoes: ["orcamentos.ver", "orcamentos.editar"],
  },
  {
    perfil: "Aprovação",
    email: "aprovacao@teste.local",
    nome: "Artur Aprovador",
    permissoes: ["orcamentos.ver", "orcamentos.aprovar", "orcamentos.custos.ver"],
  },
  {
    perfil: "Financeiro",
    email: "financeiro@teste.local",
    nome: "Fernanda Financeiro",
    permissoes: [
      "orcamentos.ver",
      "orcamentos.editar",
      "orcamentos.custos.ver",
      "orcamentos.custos.gerenciar",
      "orcamentos.templates.gerenciar",
      "orcamentos.clientes.gerenciar",
    ],
  },
];
const ADMIN_TESTE = { email: "admin@teste.local", nome: "Administradora de teste" };
export const EMAILS_TESTE = [ADMIN_TESTE.email, ...PERFIS_TESTE.map((p) => p.email)];

export async function garantirAdministrador(
  banco: Banco,
  o: { email?: string; senha?: string; log: (m: string) => void },
) {
  const { rows } = await banco.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM usuarios WHERE administrador AND ativo AND senha_hash IS NOT NULL",
  );
  if (rows[0].n > 0) return false;
  const email = o.email?.trim().toLowerCase();
  if (!email || !o.senha) {
    o.log("[aviso] Nenhum administrador com senha. Defina ADMIN_EMAIL e ADMIN_SENHA para criar o primeiro.");
    return false;
  }
  const fraca = validarForcaSenha(o.senha);
  if (fraca) throw new Error(`ADMIN_SENHA recusada: ${fraca}`);
  const hash = await gerarHashSenha(o.senha);
  const r = await banco.query(
    `UPDATE usuarios SET administrador = true, tipo = 'interno', ativo = true, senha_hash = $2, precisa_trocar_senha = true
      WHERE lower(email) = $1`,
    [email, hash],
  );
  if (!r.rowCount)
    await banco.query(
      `INSERT INTO usuarios (nome, email, tipo, administrador, senha_hash, precisa_trocar_senha)
       VALUES ($1, $2, 'interno', true, $3, true)`,
      [email.split("@")[0], email, hash],
    );
  o.log(`[acesso] administrador ${email} ${r.rowCount ? "reativado com a senha de ADMIN_SENHA" : "criado"}`);
  return true;
}

/** Cria (se faltarem) os perfis e usuários de teste. Só é chamada com o modo de teste ligado. */
export async function garantirUsuariosDeTeste(banco: Banco) {
  const hash = await gerarHashSenha(SENHA_TESTE);
  const lista = [{ ...ADMIN_TESTE, perfil: "Administrador", permissoes: null as Permissao[] | null }, ...PERFIS_TESTE];
  for (const u of lista) {
    let perfilId: string | null = null;
    if (u.permissoes) {
      const p = await banco.query<{ id: string }>("SELECT id FROM perfis WHERE nome = $1", [u.perfil]);
      perfilId =
        p.rows[0]?.id ??
        (
          await banco.query<{ id: string }>("INSERT INTO perfis (nome, permissoes) VALUES ($1, $2) RETURNING id", [
            u.perfil,
            u.permissoes,
          ])
        ).rows[0].id;
    }
    await banco.query(
      `INSERT INTO usuarios (nome, email, administrador, perfil_id, senha_hash, precisa_trocar_senha)
       SELECT $1, $2, $3, $4, $5, false WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE lower(email) = $2)`,
      [u.nome, u.email, !u.permissoes, perfilId, hash],
    );
  }
  return {
    senha: SENHA_TESTE,
    emails: lista.map((u) => ({ email: u.email, perfil: u.perfil })),
  };
}

/** Início: administrador, usuários de teste ou auditoria. Devolve o acesso de teste (se ligado). */
export async function prepararPessoas(
  banco: Banco,
  o: {
    modoTeste: boolean;
    producao: boolean;
    /** "portal": usuários e perfis vêm do portal; nada de usuário local */
    modo?: string;
    adminEmail?: string;
    adminSenha?: string;
    log: (m: string) => void;
  },
) {
  if (o.modo === "portal") {
    // Um usuário local com o e-mail de um usuário do portal faria o kit recusar o login dele (409):
    // no modo portal o Orçamentos não cria administrador local nem usuários de teste.
    const ignoradas = [
      o.adminEmail && "ADMIN_EMAIL",
      o.adminSenha && "ADMIN_SENHA",
      o.modoTeste && "MODO_TESTE",
    ].filter(Boolean);
    o.log(
      `[acesso] AUTH_MODO=portal: usuários e perfis vêm do portal${ignoradas.length ? `; ignoradas: ${ignoradas.join(", ")}` : ""}`,
    );
    await auditarUsuariosDeTeste({ banco, emails: EMAILS_TESTE, senha: SENHA_TESTE, producao: o.producao, log: o.log });
    return undefined;
  }
  let acessoTeste: Awaited<ReturnType<typeof garantirUsuariosDeTeste>> | undefined;
  if (o.modoTeste) {
    acessoTeste = await garantirUsuariosDeTeste(banco);
    o.log(`[acesso] MODO_TESTE=1: usuários de teste liberados (senha ${SENHA_TESTE}). Nunca use em nuvem.`);
  } else {
    await auditarUsuariosDeTeste({ banco, emails: EMAILS_TESTE, senha: SENHA_TESTE, producao: o.producao, log: o.log });
  }
  await garantirAdministrador(banco, { email: o.adminEmail, senha: o.adminSenha, log: o.log });
  return acessoTeste;
}
