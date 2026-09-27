/**
 * Rotas da API: mesmas rotas e mesmas respostas de sucesso da v1.2.1. Diferenças:
 *   - erros no formato do kit { erro, codigo } (na v1: { error });
 *   - toda rota /api/* exige login (o kit autentica antes);
 *   - cada alteração roda numa transação, com o usuário logado informado ao banco.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErroApi, naoEncontrado, proibido } from "plataforma-kit/erros";
import { pode } from "plataforma-kit/permissoes";
import type { Conexao, Consulta } from "./banco.js";
import { exportarBase, importarBase, validarBase } from "./dados/importador.js";
import {
  excluirOrcamento,
  gravarOrcamento,
  gravarPapel,
  gravarParametros,
  gravarServico,
  gravarTemplate,
  lerOrcamento,
  lerPapel,
  lerParametros,
  lerServico,
  lerTemplate,
  listarOrcamentos,
  listarPapeis,
  listarServicos,
  listarTemplates,
  proximoNumero,
} from "./dados/repositorio.js";
import type { Json, Orcamento, Parametros } from "./dados/tipos.js";
import * as D from "./dominio.js";
import type { Permissao, Usuario } from "./permissoes.js";
import { buscarPtax } from "./ptax.js";
import * as V from "./validacao.js";
import { paraUsuario, protegerCustos } from "./visibilidade.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

export interface OpcoesRotas {
  conexao: Conexao;
  log: (msg: string) => void;
  /** troca a consulta à PTAX (testes) */
  ptax?: typeof buscarPtax;
}

const usuarioDe = (req: FastifyRequest) => req.usuario!;

/** preHandler: exige ao menos uma das permissões (administrador tem todas). Validado no servidor. */
const exigir =
  (...chaves: Permissao[]) =>
  async (req: FastifyRequest) => {
    if (!chaves.some((c) => pode(req.usuario, c))) throw proibido();
  };
const P = (...chaves: Permissao[]) => ({ preHandler: exigir(...chaves) });

/** Transições que são decisão de aprovação (as demais são edição). */
const TRANSICOES_DE_APROVACAO = new Set(["em_aprovacao>aprovado", "em_aprovacao>rascunho"]);
const nomeDe = (req: FastifyRequest) => req.usuario?.nome || req.usuario?.email || "";

export async function rotasOrcamentos(app: FastifyInstance, o: OpcoesRotas) {
  const { conexao } = o;
  const consultar = conexao.banco.query;
  const emTx = <T>(req: FastifyRequest, fn: (q: Consulta) => Promise<T>) =>
    conexao.banco.tx(req.usuario?.id ?? null, (t) => fn(t.query));

  async function contexto(q: Consulta): Promise<D.Contexto> {
    const settings = await lerParametros(q);
    const papeis = await listarPapeis(q);
    return { settings, papel: (id) => papeis.find((p) => p.id === id) };
  }

  const id = (req: FastifyRequest) => V.idRota.parse(req.params).id;

  // ------------------------------------------------------------ tudo de uma vez e parâmetros

  app.get("/api/db", P("orcamentos.ver"), async (req) => paraUsuario(req.usuario, await exportarBase(consultar), "db"));

  app.put("/api/settings", P("orcamentos.custos.gerenciar"), async (req) => {
    const b = V.settings.parse(req.body);
    return emTx(req, async (q) => {
      const atual = await lerParametros(q);
      const { cambio, ...resto } = b;
      const novo: Parametros = { ...resto };
      if (cambio) novo.cambio = { ...(atual.cambio ?? { usd: 0 }), ...cambio } as Parametros["cambio"];
      await gravarParametros(q, novo);
      return lerParametros(q);
    });
  });

  app.post("/api/cambio/ptax", P("orcamentos.custos.gerenciar"), async (req) => {
    let r: Awaited<ReturnType<typeof buscarPtax>>;
    try {
      r = await (o.ptax ?? buscarPtax)();
    } catch (e: any) {
      throw new ErroApi(502, `Não foi possível consultar a PTAX: ${e.message}. Informe o câmbio manualmente.`);
    }
    const cambio = { usd: r.usd, fonte: "PTAX BCB", dataCotacao: r.dataCotacao, atualizadoEm: D.agora() };
    await emTx(req, (q) => gravarParametros(q, { cambio }));
    o.log(`[câmbio] PTAX ${r.usd}`);
    return cambio;
  });

  // ------------------------------------------------------------ papéis de custo (/api/perfis)

  app.get("/api/perfis", P("orcamentos.custos.ver"), async () => listarPapeis(consultar));
  app.get("/api/perfis/:id", P("orcamentos.custos.ver"), async (req) => (await lerPapel(consultar, id(req))) ?? null);
  app.post("/api/perfis", P("orcamentos.custos.gerenciar"), async (req, reply) => {
    const b = V.papel.parse({ categoria: "Geral", moeda: "BRL", custoHora: 0, ativo: true, ...(req.body as Json) });
    const novo = { ...b, id: D.novoId("pf") };
    await emTx(req, (q) => gravarPapel(q, novo));
    return reply.code(201).send(await lerPapel(consultar, novo.id));
  });
  app.put("/api/perfis/:id", P("orcamentos.custos.gerenciar"), async (req) => {
    const b = V.papel.partial().parse(req.body);
    return emTx(req, async (q) => {
      const atual = await lerPapel(q, id(req));
      if (!atual) throw naoEncontrado();
      await gravarPapel(q, { ...atual, ...b, id: atual.id });
      return lerPapel(q, atual.id);
    });
  });
  app.delete("/api/perfis/:id", P("orcamentos.custos.gerenciar"), async (req) =>
    emTx(req, async (q) => {
      if (!(await lerPapel(q, id(req)))) throw naoEncontrado();
      const uso = await q<{ n: number }>("SELECT count(*)::int AS n FROM servicos WHERE papel_id = $1", [id(req)]);
      if (uso.rows[0].n > 0)
        throw new ErroApi(409, "Este perfil é usado por serviços do catálogo. Desative-o em vez de excluir.");
      await q("DELETE FROM papeis_custo WHERE id = $1", [id(req)]);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ serviços

  async function validarServico(q: Consulta, s: Json) {
    if (s.tipoCobranca === "hora") {
      if (!s.perfilId || !(await lerPapel(q, s.perfilId)))
        throw new ErroApi(400, "Serviço por hora precisa de um perfil da tabela de custos.");
    }
  }

  app.get("/api/servicos", P("orcamentos.ver"), async (req) =>
    paraUsuario(req.usuario, await listarServicos(consultar), "servicos"),
  );
  app.get("/api/servicos/:id", P("orcamentos.ver"), async (req) => {
    const sv = await lerServico(consultar, id(req));
    return sv ? paraUsuario(req.usuario, [sv], "servicos")[0] : null;
  });
  app.post("/api/servicos", P("orcamentos.custos.gerenciar"), async (req, reply) => {
    const b = V.servico.partial().required({ nome: true, tipoCobranca: true, natureza: true }).parse(req.body);
    const novo = { area: "Geral", grupo: "", ...b, id: D.novoId("sv") };
    await emTx(req, async (q) => {
      await validarServico(q, novo);
      await gravarServico(q, novo);
    });
    return reply.code(201).send(await lerServico(consultar, novo.id));
  });
  app.put("/api/servicos/:id", P("orcamentos.custos.gerenciar"), async (req) => {
    const b = V.servico.partial().parse(req.body);
    return emTx(req, async (q) => {
      const atual = await lerServico(q, id(req));
      if (!atual) throw naoEncontrado();
      const novo = { ...atual, ...b, id: atual.id };
      await validarServico(q, novo);
      await gravarServico(q, novo);
      return lerServico(q, atual.id);
    });
  });
  app.delete("/api/servicos/:id", P("orcamentos.custos.gerenciar"), async (req) =>
    emTx(req, async (q) => {
      if (!(await lerServico(q, id(req)))) throw naoEncontrado();
      const uso = await q<{ n: number }>("SELECT count(*)::int AS n FROM template_itens WHERE servico_id = $1", [
        id(req),
      ]);
      if (uso.rows[0].n > 0)
        throw new ErroApi(409, "Este serviço está em um template. Remova-o do template antes de excluir.");
      await q("DELETE FROM servicos WHERE id = $1", [id(req)]);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ templates

  app.get("/api/templates", P("orcamentos.ver"), async () => listarTemplates(consultar));
  app.get("/api/templates/:id", P("orcamentos.ver"), async (req) => (await lerTemplate(consultar, id(req))) ?? null);
  app.post("/api/templates", P("orcamentos.templates.gerenciar"), async (req, reply) => {
    const b = V.template.partial().required({ nome: true }).parse(req.body);
    const novo = { modelo: "projeto", descricao: "", params: {}, itens: [], ...b, id: D.novoId("tp") };
    await emTx(req, (q) => gravarTemplate(q, novo));
    return reply.code(201).send(await lerTemplate(consultar, novo.id));
  });
  app.put("/api/templates/:id", P("orcamentos.templates.gerenciar"), async (req) => {
    const b = V.template.partial().parse(req.body);
    return emTx(req, async (q) => {
      const atual = await lerTemplate(q, id(req));
      if (!atual) throw naoEncontrado();
      await gravarTemplate(q, { ...atual, ...b, id: atual.id });
      return lerTemplate(q, atual.id);
    });
  });
  app.delete("/api/templates/:id", P("orcamentos.templates.gerenciar"), async (req) =>
    emTx(req, async (q) => {
      const r = await q("DELETE FROM templates WHERE id = $1", [id(req)]);
      if (!r.rowCount) throw naoEncontrado();
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ orçamentos

  app.get("/api/orcamentos", P("orcamentos.ver"), async (req) =>
    paraUsuario(req.usuario, await listarOrcamentos(consultar), "orcamentos"),
  );

  app.post("/api/orcamentos", P("orcamentos.editar"), async (req, reply) => {
    const b = V.novoOrcamento.parse(req.body);
    const orc = await emTx(req, async (q) => {
      const ctx = await contexto(q);
      const tp = b.templateId ? await lerTemplate(q, b.templateId) : null;
      const orc = D.novoOrcamento(ctx, b, await proximoNumero(q), tp, await listarServicos(q), nomeDe(req));
      await gravarOrcamento(q, orc, { usuarioId: usuarioDe(req).id });
      return orc;
    });
    o.log(`[orc] ${orc.numero} criado`);
    return reply.code(201).send(paraUsuario(req.usuario, await lerOrcamento(consultar, orc.id), "orcamento"));
  });

  app.get("/api/orcamentos/:id", P("orcamentos.ver"), async (req) => {
    const orc = await lerOrcamento(consultar, id(req));
    if (!orc) throw naoEncontrado("Orçamento");
    return paraUsuario(req.usuario, orc, "orcamento");
  });

  /** Lê o orçamento travado para alteração, aplica a regra e grava, tudo na mesma transação. */
  const alterar = (req: FastifyRequest, regra: (q: Consulta, orc: Orcamento) => Promise<Orcamento> | Orcamento) =>
    emTx(req, async (q) => {
      const orc = await lerOrcamento(q, id(req), true);
      if (!orc) throw naoEncontrado("Orçamento");
      const novo = await regra(q, orc);
      await gravarOrcamento(q, novo, { usuarioId: usuarioDe(req).id });
      return paraUsuario(req.usuario, await lerOrcamento(q, novo.id), "orcamento");
    });

  app.put("/api/orcamentos/:id", P("orcamentos.editar"), async (req) => {
    const b = V.edicaoOrcamento.parse(req.body);
    return alterar(req, (_q, orc) => D.editar(orc, protegerCustos(req.usuario, orc, b), nomeDe(req)));
  });

  app.delete("/api/orcamentos/:id", P("orcamentos.editar"), async (req) =>
    emTx(req, async (q) => {
      if (!(await excluirOrcamento(q, id(req)))) throw naoEncontrado("Orçamento");
      return { ok: true };
    }),
  );

  app.post("/api/orcamentos/:id/item", P("orcamentos.editar"), async (req) => {
    const b = V.novoItem.parse(req.body);
    return alterar(req, async (q, orc) => {
      D.exigirEditavel(orc);
      const sv = await lerServico(q, b.servicoId);
      if (!sv) throw naoEncontrado("Serviço");
      return D.adicionarItem(await contexto(q), orc, sv, b);
    });
  });

  app.post("/api/orcamentos/:id/atualizar-custos", P("orcamentos.editar"), async (req) =>
    alterar(req, async (q, orc) => D.atualizarCustos(await contexto(q), orc, await listarServicos(q), nomeDe(req))),
  );

  app.post("/api/orcamentos/:id/status", P("orcamentos.editar", "orcamentos.aprovar"), async (req) => {
    const b = V.mudancaStatus.parse(req.body);
    return alterar(req, async (q, orc) => {
      // aprovar ou devolver exige orcamentos.aprovar; as demais transições, orcamentos.editar
      const chave = TRANSICOES_DE_APROVACAO.has(`${orc.status}>${b.status}`)
        ? "orcamentos.aprovar"
        : "orcamentos.editar";
      if (!pode(req.usuario, chave))
        throw proibido(
          chave === "orcamentos.aprovar" ? "Só quem aprova orçamentos pode aprovar ou devolver." : undefined,
        );
      return D.mudarStatus(await contexto(q), orc, b.status, b.comentario, nomeDe(req));
    });
  });

  app.post("/api/orcamentos/:id/versao", P("orcamentos.editar"), async (req) =>
    alterar(req, (_q, orc) => D.salvarVersao(orc, nomeDe(req))),
  );

  app.post("/api/orcamentos/:id/duplicar", P("orcamentos.editar"), async (req, reply) => {
    const copia = await emTx(req, async (q) => {
      const orc = await lerOrcamento(q, id(req));
      if (!orc) throw naoEncontrado("Orçamento");
      const c = D.duplicar(orc, await proximoNumero(q), nomeDe(req));
      await gravarOrcamento(q, c, { usuarioId: usuarioDe(req).id });
      return c;
    });
    return reply.code(201).send(paraUsuario(req.usuario, await lerOrcamento(consultar, copia.id), "orcamento"));
  });

  // ------------------------------------------------------------ backup e restauração

  app.get("/api/backup", P("orcamentos.backup"), async (_req, reply) => {
    const dia = new Date().toISOString().slice(0, 10);
    reply.header("Content-Disposition", `attachment; filename="orcamentos-backup-${dia}.json"`);
    reply.header("Content-Type", "application/json; charset=utf-8");
    return JSON.stringify(await exportarBase(consultar), null, 2);
  });

  app.post("/api/restore", { bodyLimit: 50 * 1024 * 1024, ...P("orcamentos.backup") }, async (req) => {
    const base = validarBase(req.body);
    await emTx(req, async (q) => {
      // cópia da base atual antes de trocar (na v1: data/db-antes-restore-<data>.json)
      await q("INSERT INTO copias_seguranca (motivo, usuario_id, dados) VALUES ($1, $2, $3::jsonb)", [
        "antes de restaurar backup",
        usuarioDe(req).id,
        JSON.stringify(await exportarBase(q)),
      ]);
      await importarBase(q, base, { substituir: true });
    });
    o.log(`[db] restaurado a partir de backup por ${nomeDe(req)} (cópia anterior guardada em copias_seguranca)`);
    return { ok: true };
  });
}
