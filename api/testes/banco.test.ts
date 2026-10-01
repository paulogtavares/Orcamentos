/** Etapa 3: estrutura no schema orcamentos, migrador do kit, importador e backup. */
import { afterEach, describe, expect, it } from "vitest";
import { calcular } from "@orcamentos/compartilhado/calc";
import type { Conexao } from "../src/banco.js";
import { exportarBase, importarBase } from "../src/dados/importador.js";
import { sementeV1 } from "../src/dados/semente.js";
import { prepararBanco } from "../src/migracoes.js";
import { bancoComExemplo, bancoNovo, bancoVazio, semLog } from "./apoio.js";

let abertos: Conexao[] = [];
afterEach(async () => {
  for (const c of abertos) await c.fechar();
  abertos = [];
});
const guardar = <T extends Conexao>(c: T) => (abertos.push(c), c);

describe("estrutura", () => {
  it("nada do módulo fica em public (nem a tabela migracoes)", async () => {
    const c = guardar(await bancoVazio());
    const { rows } = await c.banco.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_class k JOIN pg_namespace s ON s.oid = k.relnamespace WHERE s.nspname = 'public' AND k.relkind IN ('r','S','v','i')",
    );
    expect(rows[0].n).toBe(0);
    const t = await c.banco.query<{ relname: string }>(
      "SELECT relname FROM pg_class k JOIN pg_namespace s ON s.oid = k.relnamespace WHERE s.nspname = 'orcamentos' AND k.relkind = 'r' ORDER BY 1",
    );
    expect(t.rows.map((r) => r.relname)).toEqual(
      expect.arrayContaining([
        "migracoes",
        "parametros",
        "papeis_custo",
        "servicos",
        "templates",
        "template_itens",
        "orcamentos",
        "orcamento_itens",
        "orcamento_versoes",
        "orcamento_historico",
        "usuarios",
        "perfis",
        "sessoes",
      ]),
    );
  });

  it("reiniciar não reaplica a estrutura nem as migrações", async () => {
    const c = guardar(await bancoNovo());
    const primeira = await prepararBanco(c, semLog);
    expect(primeira.bancoNovo).toBe(true);
    const segunda = await prepararBanco(c, semLog);
    expect(segunda).toEqual({ aplicados: [], bancoNovo: false });
  });
});

describe("carga inicial e backup", () => {
  it("carga de exemplo igual à da v1.2.1 e backup no mesmo formato", async () => {
    const c = guardar(await bancoComExemplo());
    const b = await exportarBase(c.banco.query);
    const s = sementeV1();
    expect(b.perfis).toEqual(s.perfis);
    expect(b.servicos).toEqual(s.servicos);
    expect(b.templates).toEqual(s.templates);
    const { cambio: _c1, ...p1 } = b.settings;
    const { cambio: _c2, ...p2 } = s.settings;
    expect(p1).toEqual(p2);
    expect(b.orcamentos).toEqual([]);
    expect(b.meta.seq).toBe(0);
  });

  it("importar duas vezes não duplica, e o backup devolve o que entrou (incluindo campos desconhecidos)", async () => {
    const c = guardar(await bancoVazio());
    const base = sementeV1();
    const orc: any = {
      id: "orc_1",
      numero: "ORC-2026-0007",
      cliente: "H Stern",
      projeto: "Lume",
      modelo: "projeto",
      responsavel: "Ana",
      status: "enviado",
      validade: "2026-10-27",
      templateId: "tp_lume",
      cambio: 5.01,
      params: { modoPreco: "markup", margem: 0.3, imposto: 0, contingencia: 0, meses: 0 },
      premissas: "",
      itens: [
        {
          uid: "it_a",
          servicoId: "sv_pm",
          nome: "PM",
          tipoCobranca: "hora",
          natureza: "setup",
          perfilId: "pf_pm",
          perfilNome: "Project Manager",
          moeda: "USD",
          custoUnit: "22",
          qtd: 40,
          qtdModo: "fixa",
          fator: 0,
          alocacao: null,
          percHoras: 0,
          campoNovo: { x: 1 },
        },
      ],
      versoes: [
        { v: 1, data: "2026-09-25T10:00:00.000Z", resumo: { tcv: 1 }, snapshot: { itens: [], params: {}, cambio: 5 } },
      ],
      historico: [
        { data: "2026-09-25T09:00:00.000Z", acao: "Criado em branco" },
        { data: "data-ruim", acao: "x", por: "" },
      ],
      criadoEm: "2026-09-25T09:00:00.000Z",
      atualizadoEm: "2026-09-25T10:00:00.000Z",
      resumo: { tcv: 1 },
      etiqueta: "legado",
    };
    base.orcamentos = [orc];
    base.meta.seq = 7;
    await c.banco.tx(null, (t) => importarBase(t.query, base));
    await c.banco.tx(null, (t) => importarBase(t.query, base));
    const b = await exportarBase(c.banco.query);
    expect(b.orcamentos).toHaveLength(1);
    expect(b.orcamentos[0]).toEqual(orc);
    expect(b.meta.seq).toBe(7);
    const n = await c.banco.query<{ n: number }>("SELECT count(*)::int AS n FROM orcamento_itens");
    expect(n.rows[0].n).toBe(1);
    // o número "22" em texto continua dando o mesmo cálculo
    expect(calcular(b.orcamentos[0]).custoTotal).toBe(calcular(orc).custoTotal);
  });

  it("restaurar (substituir) apaga o que não está no arquivo e volta o contador", async () => {
    const c = guardar(await bancoComExemplo());
    const base = sementeV1();
    base.perfis = base.perfis.slice(0, 2);
    base.servicos = [];
    base.templates = [];
    await c.banco.tx(null, (t) => importarBase(t.query, base, { substituir: true }));
    const b = await exportarBase(c.banco.query);
    expect(b.perfis).toHaveLength(2);
    expect(b.servicos).toHaveLength(0);
  });
});
