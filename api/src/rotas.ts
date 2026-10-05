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
import { validarPrecificacao } from "@orcamentos/compartilhado/calc";
import * as D from "./dominio.js";
import type { Permissao, Usuario } from "./permissoes.js";
import { buscarPtax } from "./ptax.js";
import * as V from "./validacao.js";
import { paraUsuario, protegerCustos } from "./visibilidade.js";
import * as C from "./clientes.js";
import { SERVICO_LER_CLIENTES } from "./permissoes.js";

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

/** Recusa (400) parâmetros de preço em que o preço não existe: margem + imposto ≥ 100% (ou imposto ≥ 100% no markup). */
function exigirPrecoValido(p: Json) {
  const erro = validarPrecificacao(p);
  if (erro) throw new ErroApi(400, erro.charAt(0).toUpperCase() + erro.slice(1) + ".");
}

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
      const final = { ...atual, ...resto };
      exigirPrecoValido({ modoPreco: final.modoPrecoPadrao, margem: final.margemAlvo, imposto: final.impostoPadrao });
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

  // ------------------------------------------------------------ papéis de custo
  // /api/papeis-custo é o nome da v2; /api/perfis continua igual ao da v1.2.1 (compatibilidade).
  // No JSON (backup, db.json) os campos seguem "perfis", "perfilId" e "perfilNome", como na v1.

  for (const r of ["/api/papeis-custo", "/api/perfis"]) {
    app.get(r, P("orcamentos.custos.ver"), async () => listarPapeis(consultar));
    app.get(`${r}/:id`, P("orcamentos.custos.ver"), async (req) => (await lerPapel(consultar, id(req))) ?? null);
    app.post(r, P("orcamentos.custos.gerenciar"), async (req, reply) => {
      const b = V.papel.parse({ categoria: "Geral", moeda: "BRL", custoHora: 0, ativo: true, ...(req.body as Json) });
      const novo = { ...b, id: D.novoId("pf") };
      await emTx(req, (q) => gravarPapel(q, novo));
      return reply.code(201).send(await lerPapel(consultar, novo.id));
    });
    app.put(`${r}/:id`, P("orcamentos.custos.gerenciar"), async (req) => {
      const b = V.papel.partial().parse(req.body);
      return emTx(req, async (q) => {
        const atual = await lerPapel(q, id(req));
        if (!atual) throw naoEncontrado("Papel de custo");
        await gravarPapel(q, { ...atual, ...b, id: atual.id });
        return lerPapel(q, atual.id);
      });
    });
    app.delete(`${r}/:id`, P("orcamentos.custos.gerenciar"), async (req) =>
      emTx(req, async (q) => {
        if (!(await lerPapel(q, id(req)))) throw naoEncontrado("Papel de custo");
        const uso = await q<{ n: number }>("SELECT count(*)::int AS n FROM servicos WHERE papel_id = $1", [id(req)]);
        if (uso.rows[0].n > 0)
          throw new ErroApi(409, "Este papel de custo é usado por serviços do catálogo. Desative-o em vez de excluir.");
        await q("DELETE FROM papeis_custo WHERE id = $1", [id(req)]);
        return { ok: true };
      }),
    );
  }

  // ------------------------------------------------------------ serviços

  async function validarServico(q: Consulta, s: Json) {
    if (s.tipoCobranca === "hora") {
      if (!s.perfilId || !(await lerPapel(q, s.perfilId)))
        throw new ErroApi(400, "Serviço por hora precisa de um papel de custo da tabela de custos.");
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
    exigirPrecoValido(novo.params);
    await emTx(req, (q) => gravarTemplate(q, novo));
    return reply.code(201).send(await lerTemplate(consultar, novo.id));
  });
  app.put("/api/templates/:id", P("orcamentos.templates.gerenciar"), async (req) => {
    const b = V.template.partial().parse(req.body);
    return emTx(req, async (q) => {
      const atual = await lerTemplate(q, id(req));
      if (!atual) throw naoEncontrado();
      if (b.params) exigirPrecoValido(b.params);
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
      if (b.clienteId) {
        const c = await C.lerCliente(q, b.clienteId);
        if (!c) throw new ErroApi(400, "Cliente não encontrado no cadastro.");
        b.cliente = c.nome;
      }
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
    return alterar(req, async (q, orc) => {
      const corpo = protegerCustos(req.usuario, orc, b);
      // ligar ao cadastro: o nome do cliente vira o texto do orçamento; desligar (null) mantém o texto
      if (corpo.clienteId) {
        const c = await C.lerCliente(q, corpo.clienteId);
        if (!c) throw new ErroApi(400, "Cliente não encontrado no cadastro.");
        corpo.cliente = c.nome;
      }
      if (corpo.params) exigirPrecoValido({ ...orc.params, ...corpo.params });
      return D.editar(orc, corpo, nomeDe(req));
    });
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

  // ------------------------------------------------------------ clientes (v2.1.0)

  // quem edita orçamentos também lista, para escolher o cliente
  app.get(
    "/api/clientes",
    P("orcamentos.clientes.ver", "orcamentos.clientes.gerenciar", "orcamentos.editar"),
    async () => C.listarClientes(consultar, true),
  );
  app.get(
    "/api/clientes/:id",
    P("orcamentos.clientes.ver", "orcamentos.clientes.gerenciar", "orcamentos.editar"),
    async (req) => {
      const c = await C.lerCliente(consultar, (req.params as { id: string }).id);
      if (!c) throw naoEncontrado("Cliente");
      return c;
    },
  );
  app.post("/api/clientes", P("orcamentos.clientes.gerenciar"), async (req, reply) => {
    const b = V.cliente.parse(req.body);
    const novo = await emTx(req, (q) => C.criarCliente(q, b, usuarioDe(req).id));
    return reply.code(201).send(await C.lerCliente(consultar, novo));
  });
  app.put("/api/clientes/:id", P("orcamentos.clientes.gerenciar"), async (req) => {
    const b = V.cliente.partial().parse(req.body);
    const idCliente = (req.params as { id: string }).id;
    await emTx(req, (q) => C.alterarCliente(q, idCliente, b));
    return C.lerCliente(consultar, idCliente);
  });
  app.delete("/api/clientes/:id", P("orcamentos.clientes.gerenciar"), async (req) => {
    await emTx(req, (q) => C.excluirCliente(q, (req.params as { id: string }).id));
    return { ok: true };
  });

  /** Importação do Cronogramas: sem "confirmar" devolve só a prévia; com "confirmar" grava (recalculando a prévia). */
  app.post(
    "/api/clientes/importacao",
    { bodyLimit: 12 * 1024 * 1024, ...P("orcamentos.clientes.gerenciar") },
    async (req) => {
      const b = V.importacaoClientes.parse(req.body);
      const { linhas, erros } = C.lerArquivoClientes(b.conteudo);
      if (!linhas.length) throw new ErroApi(400, erros[0] ?? "Nenhum cliente no arquivo.");
      if (!b.confirmar) return { ...(await C.previaImportacao(consultar, linhas)), erros };
      const resumo = await emTx(req, (q) =>
        C.aplicarImportacao(q, linhas, { usuarioId: usuarioDe(req).id, arquivo: b.arquivo, ignorados: erros.length }),
      );
      o.log(`[clientes] importação do Cronogramas por ${nomeDe(req)}: ${JSON.stringify(resumo)}`);
      return { resumo, erros };
    },
  );

  /** Ligação dos orçamentos ao cadastro: GET mostra os grupos para revisar; POST liga o que foi revisado. */
  app.get("/api/clientes/ligacao", P("orcamentos.clientes.gerenciar"), async () => C.previaLigacao(consultar));
  app.post("/api/clientes/ligacao", P("orcamentos.clientes.gerenciar"), async (req) => {
    const b = V.ligacao.parse(req.body);
    const r = await emTx(req, (q) => C.aplicarLigacao(q, b.grupos, usuarioDe(req).id));
    o.log(`[clientes] ligação de orçamentos por ${nomeDe(req)}: ${r.ligados} orçamentos, ${r.criados} clientes novos`);
    return r;
  });

  /**
   * Rota interna: outros módulos (ex.: o Cronogramas) leem o cadastro mestre. Aceita só token de serviço emitido pelo
   * portal com a permissão orcamentos.clientes.ler (o kit recusa token de usuário). ?desde=<data ISO> devolve só os
   * alterados depois dela; sem "desde", a lista completa é a verdade (clientes excluídos somem dela).
   */
  app.get("/api/interno/clientes", { config: { servico: SERVICO_LER_CLIENTES } }, async (req) => {
    const desde = (req.query as { desde?: string }).desde;
    if (desde !== undefined && Number.isNaN(Date.parse(desde)))
      throw new ErroApi(400, "Parâmetro desde inválido (use data ISO).");
    const { rows } = await consultar<{
      id: string;
      nome: string;
      documento: string | null;
      situacao: string;
      atualizado_em: Date;
    }>(
      `SELECT id, nome, documento, situacao, atualizado_em FROM clientes ${desde ? "WHERE atualizado_em > $1" : ""} ORDER BY lower(nome), id`,
      desde ? [desde] : [],
    );
    return {
      gerado_em: new Date().toISOString(),
      completo: !desde,
      clientes: rows.map((r) => ({ ...r, atualizado_em: new Date(r.atualizado_em).toISOString() })),
    };
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
