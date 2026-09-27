/**
 * Regras de negócio dos orçamentos, portadas do server.js da v1.2.1 sem mudar o comportamento:
 * congelamento do custo no item, criação a partir de template, edição, status, versões,
 * duplicação e "Atualizar custos". Funções puras: recebem o que precisam e devolvem o orçamento
 * alterado; quem grava no banco são as rotas.
 */
import { randomBytes } from "node:crypto";
import { resumo, STATUS, validarTransicao, type ItemOrcamento, type Status } from "@orcamentos/compartilhado/calc";
import { ErroApi } from "plataforma-kit/erros";
import type { Json, Orcamento, PapelCusto, Parametros, Servico, Template } from "./dados/tipos.js";

/** Mesmo formato de id da v1.2.1 (prefixo_tempo+aleatório), com aleatoriedade criptográfica. */
export const novoId = (prefixo: string) =>
  `${prefixo}_${Date.now().toString(36)}${randomBytes(3).toString("hex").slice(0, 4)}`;
export const agora = () => new Date().toISOString();

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface Contexto {
  settings: Parametros;
  papel: (id: string | null | undefined) => PapelCusto | undefined;
}

/** Congela o custo do serviço no item: mudar a tabela depois não altera orçamentos existentes. */
export function snapshotItem(ctx: Contexto, sv: Servico, over: Json = {}): ItemOrcamento {
  const pf = sv.tipoCobranca === "hora" ? ctx.papel(sv.perfilId) : undefined;
  return {
    uid: novoId("it"),
    servicoId: sv.id,
    nome: sv.nome,
    area: sv.area,
    grupo: sv.grupo || "",
    tipoCobranca: sv.tipoCobranca,
    natureza: over.natureza || sv.natureza,
    unidade: sv.unidade,
    perfilId: pf?.id || null,
    perfilNome: pf?.nome || null,
    moeda: pf ? pf.moeda : sv.moeda || "BRL",
    custoUnit: pf ? pf.custoHora : sv.custoUnit,
    qtd: over.qtd ?? 1,
    qtdModo: over.qtdModo || "fixa",
    fator: over.fator ?? 0,
    alocacao: over.alocacao || null,
    percHoras:
      over.alocacao === "dedicado"
        ? ctx.settings.gpDedicadoPct
        : over.alocacao === "compartilhado"
          ? ctx.settings.gpCompartilhadoPct
          : (over.percHoras ?? 0),
  };
}

export interface DadosNovoOrcamento {
  cliente?: string;
  projeto?: string;
  modelo?: string;
  responsavel?: string;
  templateId?: string | null;
}

export function novoOrcamento(
  ctx: Contexto,
  b: DadosNovoOrcamento,
  numero: string,
  tp: Template | null,
  servicos: Servico[],
  autor?: string,
): Orcamento {
  const s = ctx.settings;
  const itens: ItemOrcamento[] = [];
  if (tp)
    tp.itens.forEach((ti) => {
      const sv = servicos.find((x) => x.id === ti.servicoId);
      if (sv) itens.push(snapshotItem(ctx, sv, ti));
    });
  const validade = new Date(Date.now() + (Number(s.validadeDias) || 30) * 864e5).toISOString().slice(0, 10);
  const orc: Orcamento = {
    id: novoId("orc"),
    numero,
    cliente: b.cliente || "Novo cliente",
    projeto: b.projeto || tp?.nome || "Novo orçamento",
    modelo: b.modelo || tp?.modelo || "projeto",
    responsavel: b.responsavel || "",
    status: "rascunho",
    validade,
    templateId: tp?.id || null,
    cambio: Number(s.cambio?.usd) || 0,
    params: Object.assign(
      {
        modoPreco: s.modoPrecoPadrao,
        margem: s.margemAlvo,
        imposto: s.impostoPadrao,
        contingencia: s.contingenciaPadrao,
        meses: 12,
        pedidosMes: 0,
        gmvMes: 0,
        feeGmv: 0,
      },
      tp?.params || {},
    ),
    premissas: "",
    itens,
    versoes: [],
    historico: [evento(tp ? `Criado a partir do template "${tp.nome}"` : "Criado em branco", autor)],
    criadoEm: agora(),
    atualizadoEm: agora(),
    resumo: undefined as never,
  };
  orc.resumo = resumo(orc);
  return orc;
}

/** Evento de histórico; "por" é o nome de quem fez (usuário logado). */
export const evento = (acao: string, por?: string) => ({ data: agora(), acao, ...(por ? { por } : {}) });

const bloqueado = (o: Orcamento) => ["enviado", "aceito"].includes(o.status);

export function exigirEditavel(o: Orcamento, mensagem = "Orçamento bloqueado para edição.") {
  if (bloqueado(o)) throw new ErroApi(409, mensagem);
}

export const CAMPOS_EDITAVEIS = [
  "cliente",
  "projeto",
  "modelo",
  "responsavel",
  "validade",
  "cambio",
  "params",
  "premissas",
  "itens",
] as const;

/** PUT /api/orcamentos/:id: mesma regra da v1.2.1 (editar após aprovação volta para rascunho). */
export function editar(o: Orcamento, b: Json, autor?: string): Orcamento {
  exigirEditavel(o, `Orçamento ${o.status}. Volte para rascunho para editar.`);
  for (const k of CAMPOS_EDITAVEIS) if (b[k] !== undefined) (o as Json)[k] = b[k];
  o.itens.forEach((it) => {
    if (!it.uid) it.uid = novoId("it");
  });
  if (o.status === "aprovado" || o.status === "em_aprovacao") {
    o.status = "rascunho";
    o.historico.push(evento("Editado após aprovação — voltou para rascunho", autor));
  }
  o.atualizadoEm = agora();
  o.resumo = resumo(o);
  return o;
}

export function adicionarItem(ctx: Contexto, o: Orcamento, sv: Servico, b: Json): Orcamento {
  exigirEditavel(o);
  o.itens.push(snapshotItem(ctx, sv, b));
  o.atualizadoEm = agora();
  o.resumo = resumo(o);
  return o;
}

/** Reaplica a tabela de custos, o dólar e os percentuais de GP vigentes. */
export function atualizarCustos(ctx: Contexto, o: Orcamento, servicos: Servico[], autor?: string): Orcamento {
  exigirEditavel(o);
  let n = 0;
  o.itens.forEach((it) => {
    const sv = servicos.find((s) => s.id === it.servicoId);
    if (!sv) return;
    const snap = snapshotItem(ctx, sv);
    if (snap.custoUnit !== it.custoUnit || snap.moeda !== it.moeda) n++;
    it.custoUnit = snap.custoUnit;
    it.moeda = snap.moeda;
    it.perfilNome = snap.perfilNome;
  });
  o.itens.forEach((it) => {
    if (it.qtdModo !== "percHoras") return;
    const novo =
      it.alocacao === "dedicado"
        ? ctx.settings.gpDedicadoPct
        : it.alocacao === "compartilhado"
          ? ctx.settings.gpCompartilhadoPct
          : null;
    if (novo != null && novo !== it.percHoras) {
      it.percHoras = novo;
      n++;
    }
  });
  o.cambio = Number(ctx.settings.cambio?.usd) || 0;
  o.historico.push(evento(`Custos e câmbio atualizados pela tabela vigente (${n} itens alterados)`, autor));
  o.atualizadoEm = agora();
  o.resumo = resumo(o);
  return o;
}

const congelar = (o: Orcamento) => ({
  v: o.versoes.length + 1,
  data: agora(),
  resumo: resumo(o),
  snapshot: copia({ itens: o.itens, params: o.params, cambio: o.cambio }),
});

/** Muda o status (valida transição e margem mínima); ao enviar, congela uma versão. */
export function mudarStatus(
  ctx: Contexto,
  o: Orcamento,
  novo: string,
  comentario: string | undefined,
  autor: string,
): Orcamento {
  const erro = validarTransicao(o, novo, ctx.settings);
  if (erro) throw new ErroApi(422, erro);
  const de = o.status as Status;
  o.status = novo;
  if (novo === "enviado") o.versoes.push(congelar(o));
  o.historico.push({
    data: agora(),
    acao: `${STATUS[de].label} → ${STATUS[novo as Status].label}${comentario ? ` · "${comentario}"` : ""}`,
    por: autor,
  });
  o.atualizadoEm = agora();
  return o;
}

export function salvarVersao(o: Orcamento, autor?: string): Orcamento {
  o.versoes.push(congelar(o));
  o.historico.push(evento(`Versão ${o.versoes.length} salva`, autor));
  return o;
}

export function duplicar(o: Orcamento, numero: string, autor?: string): Orcamento {
  const c = copia(o);
  Object.assign(c, {
    id: novoId("orc"),
    numero,
    status: "rascunho",
    versoes: [],
    criadoEm: agora(),
    atualizadoEm: agora(),
    projeto: `${o.projeto} (cópia)`,
    historico: [evento(`Duplicado de ${o.numero}`, autor)],
  });
  c.itens.forEach((it) => (it.uid = novoId("it")));
  return c;
}
