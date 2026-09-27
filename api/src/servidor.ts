/**
 * Monta o servidor Fastify do Orçamentos sobre a base do kit:
 *   prepararServidor (cabeçalhos de segurança e de iframe, /api/status, /api/saude, /modulo.json,
 *   login, erros { erro, codigo }) + rotas do módulo + servirFront (prefixo por X-Forwarded-Prefix).
 * Sem Access-Control-Allow-Origin: a tela é servida pelo próprio servidor (mesma origem).
 */
import Fastify from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { criarSessao } from "plataforma-kit/sessao";
import { prepararServidor, servirFront } from "plataforma-kit/servidor";
import type { Ambiente } from "./ambiente.js";
import { MODULO } from "./ambiente.js";
import type { Conexao } from "./banco.js";
import { catalogo } from "./permissoes.js";
import { rotasOrcamentos, type OpcoesRotas } from "./rotas.js";

export interface OpcoesServidor {
  conexao: Conexao;
  ambiente: Pick<Ambiente, "producao" | "acesso" | "modoTeste">;
  versao: string;
  data: string;
  /** pasta que contém public/ (front compilado); sem ela, só a API */
  pastaFront?: string;
  /** conteúdo fixo do modulo.json */
  manifesto?: Record<string, unknown>;
  acessoTeste?: { senha: string; emails: { email: string; perfil: string }[] };
  log: (msg: string) => void;
  ptax?: OpcoesRotas["ptax"];
}

export function lerManifesto(caminho: string) {
  return existsSync(caminho) ? (JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>) : undefined;
}

export async function criarServidor(o: OpcoesServidor) {
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024, trustProxy: o.ambiente.producao });
  const { acesso } = o.ambiente;
  const sessao = criarSessao({
    banco: o.conexao.banco,
    todasPermissoes: catalogo.todas,
    modo: acesso.modo,
    nomeCookie: acesso.nomeCookie,
    modulo: MODULO,
    segredoPlataforma: acesso.segredoPlataforma,
    log: o.log,
  });
  await prepararServidor(app, {
    sessao,
    banco: o.conexao.banco,
    producao: o.ambiente.producao,
    versao: o.versao,
    data: o.data,
    tipoBanco: () => o.conexao.tipo,
    permissoes: catalogo.lista,
    manifesto: o.manifesto,
    acessoTeste: o.acessoTeste,
    restricoes: {
      ux_orcamentos_numero: "Já existe um orçamento com esse número.",
      servicos_papel_id_fkey: "O perfil informado não existe na tabela de custos.",
    },
    textoValorNaoPermitido: "Valor não permitido pelas regras de orçamento.",
    log: o.log,
  });
  await app.register(rotasOrcamentos, { conexao: o.conexao, log: o.log, ptax: o.ptax });
  servirFront(app, o.pastaFront);
  return app;
}
