/**
 * "Quem não tem orcamentos.custos.ver vê só preço" — também pela API.
 *
 * Para essas pessoas o servidor:
 *   - remove custos, margens e contingência (custoUnit, custoHora, custoTotal, margemReal, params.margem…);
 *   - acrescenta o preço já calculado em cada item (preco) e no resumo, já que a tela não tem como
 *     calcular preço sem custo;
 *   - numa edição, mantém os custos e a política de preço gravados (a tela dessa pessoa não os tem,
 *     então o que ela mandar nesses campos é ignorado).
 */
import { calcular, resumo as resumir, type ItemOrcamento } from "@orcamentos/compartilhado/calc";
import { ErroApi } from "plataforma-kit/erros";
import { pode } from "plataforma-kit/permissoes";
import type { BaseV1, Json, Orcamento, Parametros, Servico, Versao } from "./dados/tipos.js";
import type { Usuario } from "./permissoes.js";

export const veCustos = (u: Usuario | undefined) => pode(u, "orcamentos.custos.ver");

/** Campos do item que revelam custo. */
const CUSTO_ITEM = ["custoUnit"] as const;
/** Parâmetros de preço que, junto com o preço, revelam o custo. */
const POLITICA = ["margem", "contingencia", "modoPreco"] as const;
const SETTINGS_OCULTOS = ["margemAlvo", "margemMinima", "contingenciaPadrao", "modoPrecoPadrao"] as const;

const sem = <T extends Json>(o: T, chaves: readonly string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !chaves.includes(k))) as T;

const resumoPublico = (r: Json) => ({ setup: r?.setup, mensal: r?.mensal, tcv: r?.tcv, horas: r?.horas });

/** Itens com o preço de cada linha e sem custo. */
function itensComPreco(itens: ItemOrcamento[], params: Json, cambio: unknown) {
  const c = calcular({ itens, params, cambio: cambio as number });
  return itens.map((it, i) => ({ ...sem(it, CUSTO_ITEM), preco: Math.round(c.linhas[i].preco * 100) / 100 }));
}

export function orcamentoPublico(o: Orcamento): Orcamento {
  const versoes = o.versoes.map((v: Versao) => ({
    ...v,
    resumo: resumoPublico(v.resumo),
    snapshot: {
      ...v.snapshot,
      params: sem(v.snapshot?.params ?? {}, POLITICA),
      itens: itensComPreco(v.snapshot?.itens ?? [], v.snapshot?.params ?? {}, v.snapshot?.cambio),
    },
  }));
  return {
    ...o,
    params: sem(o.params ?? {}, POLITICA),
    itens: itensComPreco(o.itens, o.params ?? {}, o.cambio),
    versoes,
    resumo: resumoPublico(o.resumo ?? resumir(o)),
  } as unknown as Orcamento;
}

export const servicoPublico = (s: Servico) => sem(s, ["custoUnit"]) as Servico;
export const parametrosPublicos = (p: Parametros) => sem(p, SETTINGS_OCULTOS) as Parametros;

/** Aplica a visibilidade de custos a uma resposta, conforme o usuário. */
export function paraUsuario<T>(
  u: Usuario | undefined,
  valor: T,
  tipo: "orcamento" | "orcamentos" | "servicos" | "db",
): T {
  if (veCustos(u)) return valor;
  const v: any = valor;
  if (v == null) return valor;
  switch (tipo) {
    case "orcamento":
      return orcamentoPublico(v) as T;
    case "orcamentos":
      return v.map(orcamentoPublico) as T;
    case "servicos":
      return v.map(servicoPublico) as T;
    case "db": {
      const b = v as BaseV1;
      return {
        ...b,
        settings: parametrosPublicos(b.settings),
        perfis: [],
        servicos: b.servicos.map(servicoPublico),
        orcamentos: b.orcamentos.map(orcamentoPublico),
      } as T;
    }
  }
}

/**
 * Edição por quem não vê custos: custos dos itens e política de preço vêm do que está gravado.
 * Item novo só entra pela rota /item (que congela o custo da tabela), nunca pelo PUT.
 */
export function protegerCustos(u: Usuario | undefined, atual: Orcamento, b: Json): Json {
  if (veCustos(u)) return b;
  const r = { ...b };
  if (b.params) {
    const politica = Object.fromEntries(
      POLITICA.filter((k) => k in (atual.params ?? {})).map((k) => [k, (atual.params as Json)[k]]),
    );
    r.params = { ...sem(b.params, POLITICA), ...politica };
  }
  if (Array.isArray(b.itens)) {
    const porUid = new Map(atual.itens.map((it) => [it.uid, it]));
    r.itens = b.itens.map((it: Json) => {
      const antes = it.uid ? porUid.get(it.uid) : undefined;
      if (!antes) throw new ErroApi(400, "Sem acesso a custos, novos itens só podem ser adicionados pelo catálogo.");
      const { preco: _preco, ...resto } = it;
      return { ...sem(resto, [...CUSTO_ITEM, "moeda"]), custoUnit: antes.custoUnit, moeda: antes.moeda };
    });
  }
  if (b.cambio !== undefined) r.cambio = atual.cambio; // o dólar muda o custo em BRL
  return r;
}
