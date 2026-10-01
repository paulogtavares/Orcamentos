/** Itens do orçamento agrupados por natureza (Setup, Mensal, Variável), com edição na própria linha. */
import { calcular, ehPercHoras, NATUREZAS } from "@orcamentos/compartilhado/calc";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ChipNat, Vazio } from "../componentes";
import { ALOCACAO, int, NAT, num, simboloMoeda, type Nat } from "../formato";
import type { Item, Orcamento, Parametros } from "../tipos";
import type { Visao } from "../visao";

const recolhidos = new Set<string>(); // mantido entre aberturas, como na v1

interface Props {
  orc: Orcamento;
  v: Visao;
  settings: Parametros;
  travado: boolean;
  aoMudarItens: (itens: Item[]) => void;
  aoAdicionar: () => void;
}

export function Itens({ orc, v, settings, travado, aoMudarItens, aoAdicionar }: Props) {
  const [, redesenhar] = useState(0);
  const pctAlocacao = (a?: string | null) =>
    a === "dedicado" ? settings.gpDedicadoPct : a === "compartilhado" ? settings.gpCompartilhadoPct : null;

  if (!orc.itens.length)
    return (
      <Vazio
        titulo="Orçamento sem itens"
        texto="Adicione horas de papéis de custo, serviços de operação ou custos logísticos."
      >
        <button className="botao botao-primario" onClick={aoAdicionar} disabled={travado}>
          <Plus size={15} /> Adicionar item
        </button>
      </Vazio>
    );

  /** Mesmas regras de edição da v1.2.1 (troca de modo, alocação do GP, % personalizado). */
  function mudar(uid: string, k: string, valor: string, ehSelect: boolean) {
    const itens = orc.itens.map((i) => ({ ...i }));
    const it = itens.find((i) => i.uid === uid);
    if (!it) return;
    const qAntes = k === "qtdModo" ? calcular(orc).linhas.find((l) => l.item.uid === uid)?.qtd : null;
    (it as Record<string, unknown>)[k] = ehSelect ? valor : Number(valor);
    if (k === "qtdModo" && it.qtdModo === "porPedido" && !it.fator) it.fator = 1;
    if (k === "qtdModo" && it.qtdModo === "percHoras") {
      it.alocacao = it.alocacao || "dedicado";
      it.percHoras = pctAlocacao(it.alocacao) ?? it.percHoras ?? 0;
    }
    // ao voltar para horas fixas, mantém as horas que estavam calculadas
    if (k === "qtdModo" && it.qtdModo === "fixa" && it.tipoCobranca === "hora" && qAntes != null) it.qtd = qAntes;
    if (k === "alocacao" && pctAlocacao(it.alocacao) != null) it.percHoras = pctAlocacao(it.alocacao)!;
    if (k === "percHoras" && pctAlocacao(it.alocacao) !== it.percHoras) it.alocacao = "personalizado";
    aoMudarItens(itens);
  }
  const remover = (uid: string) => aoMudarItens(orc.itens.filter((i) => i.uid !== uid));

  const celula = (it: Item, k: keyof Item, largura: number, extra: Record<string, unknown> = {}) => (
    <input
      className="celula"
      style={{ width: largura }}
      type="number"
      min={0}
      value={String(it[k] ?? 0)}
      disabled={travado}
      onChange={(e) => mudar(it.uid, String(k), e.target.value, false)}
      {...extra}
    />
  );
  const escolha = (it: Item, k: keyof Item, opcoes: [string, string][], extra: Record<string, unknown> = {}) => (
    <select
      className="celula"
      value={String(it[k] ?? "")}
      disabled={travado}
      onChange={(e) => mudar(it.uid, String(k), e.target.value, true)}
      {...extra}
    >
      {opcoes.map(([valor, rotulo]) => (
        <option key={valor} value={valor}>
          {rotulo}
        </option>
      ))}
    </select>
  );
  const qtdCalculada = (l: Visao["linhas"][number]) =>
    l.baseHoras !== null
      ? l.baseHoras
        ? `= ${int(l.qtd)} h de ${int(l.baseHoras)} h`
        : "sem horas na base"
      : `= ${int(l.qtd)}`;

  function quantidade(l: Visao["linhas"][number]) {
    const it = l.item;
    if (it.tipoCobranca === "percentual") return <span className="secundario">sobre GMV/mês</span>;
    if (it.tipoCobranca === "hora") {
      const modo = escolha(
        it,
        "qtdModo",
        [
          ["fixa", "Horas"],
          ["percHoras", "% das horas"],
        ],
        { title: "Como calcular as horas" },
      );
      if (it.qtdModo !== "percHoras")
        return (
          <div className="linha-inline" style={{ gap: 4, flexWrap: "nowrap" }}>
            {modo}
            {celula(it, "qtd", 72, { "aria-label": "Horas" })}
          </div>
        );
      const opcoesAlocacao = Object.entries(ALOCACAO).map(([k, r]) => {
        const p = pctAlocacao(k);
        return [k, p != null ? `${r} ${num(p, 0)}%` : r] as [string, string];
      });
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="linha-inline" style={{ gap: 4, flexWrap: "nowrap" }}>
            {modo}
            {escolha({ ...it, alocacao: it.alocacao || "personalizado" }, "alocacao", opcoesAlocacao)}
          </div>
          <div className="linha-inline" style={{ gap: 4, flexWrap: "nowrap" }}>
            {celula(it, "percHoras", 64, { step: 0.5, "aria-label": "Percentual sobre as horas" })}
            <span className="secundario">%</span>
            <span className="secundario num" style={{ whiteSpace: "nowrap" }}>
              {qtdCalculada(l)}
            </span>
          </div>
        </div>
      );
    }
    if (it.tipoCobranca !== "unidade") return celula(it, "qtd", 80, { "aria-label": "Quantidade" });
    return (
      <div className="linha-inline" style={{ gap: 4, flexWrap: "nowrap" }}>
        {escolha({ ...it, qtdModo: it.qtdModo === "porPedido" ? "porPedido" : "fixa" }, "qtdModo", [
          ["fixa", "Fixa"],
          ["porPedido", "× pedidos"],
        ])}
        {it.qtdModo === "porPedido" ? (
          <>
            {celula(it, "fator", 58, { step: 0.1, title: "Quantidade por pedido" })}
            <span className="secundario num" style={{ whiteSpace: "nowrap" }}>
              {qtdCalculada(l)}
            </span>
          </>
        ) : (
          celula(it, "qtd", 80, { "aria-label": "Quantidade" })
        )}
      </div>
    );
  }

  function custoUnitario(it: Item) {
    const entrada = (largura: number) => (
      <input
        className="celula"
        style={{ width: largura }}
        type="number"
        step={0.01}
        value={String(it.custoUnit ?? 0)}
        disabled={travado}
        onChange={(e) => mudar(it.uid, "custoUnit", e.target.value, false)}
        aria-label="Custo unitário"
      />
    );
    return (
      <div className="linha-inline" style={{ gap: 2, justifyContent: "flex-end", flexWrap: "nowrap" }}>
        {it.tipoCobranca === "percentual" ? (
          <>
            {entrada(64)}
            <span className="secundario">%</span>
          </>
        ) : (
          <>
            <span className="secundario">{simboloMoeda(it.moeda)}</span>
            {entrada(76)}
          </>
        )}
      </div>
    );
  }

  const colunas = v.veCustos ? 7 : 5;
  return (
    <table className="tabela-itens">
      <thead>
        <tr>
          <th>Item</th>
          <th>Natureza</th>
          {v.veCustos && <th className="dir">Custo unit.</th>}
          <th>Quantidade</th>
          {v.veCustos && <th className="dir">Custo</th>}
          <th className="dir">Preço</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {NATUREZAS.flatMap((n) => {
          const linhas = v.linhas.filter((l) => l.natureza === n);
          if (!linhas.length) return [];
          const fechado = recolhidos.has(n);
          const alternar = () => {
            if (fechado) recolhidos.delete(n);
            else recolhidos.add(n);
            redesenhar((x) => x + 1);
          };
          const grupo = (
            <tr
              key={`g-${n}`}
              className={`nivel-1 ${fechado ? "recolhido" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={alternar}
            >
              <td colSpan={colunas - (v.veCustos ? 3 : 2)}>
                <span className="chevron">
                  <ChevronDown size={14} />
                </span>{" "}
                <ChipNat n={n} />{" "}
                <span className="secundario">
                  {NAT[n as Nat].longo}
                  {n !== "setup" ? ", valores por mês" : ""} · {linhas.length} {linhas.length > 1 ? "itens" : "item"}
                </span>
              </td>
              {v.veCustos && <td className="valor">{num(v.nat[n].custo)}</td>}
              <td className="valor">{num(v.nat[n].preco)}</td>
              <td />
            </tr>
          );
          if (fechado) return [grupo];
          return [
            grupo,
            ...linhas.map((l) => {
              const it = l.item;
              const nat = NAT[(it.natureza as Nat) in NAT ? (it.natureza as Nat) : "setup"];
              const sub =
                it.tipoCobranca === "hora"
                  ? (it.perfilNome && it.perfilNome !== it.nome ? `${it.perfilNome}, por hora` : "por hora") +
                    (ehPercHoras(it) ? `, % das horas de ${nat.nome.toLowerCase()}` : "")
                  : it.tipoCobranca === "percentual"
                    ? "% sobre GMV"
                    : `por ${it.unidade ?? ""}`;
              return (
                <tr key={it.uid}>
                  <td style={{ minWidth: 200, paddingLeft: 40 }}>
                    <div className="forte">{it.nome}</div>
                    <div className="secundario">
                      {it.grupo ? <span className="etiqueta">{it.grupo}</span> : null} {it.area}, {sub}
                    </div>
                  </td>
                  <td>
                    <select
                      className="celula"
                      style={{ color: nat.cor, fontWeight: 600 }}
                      value={String(it.natureza)}
                      disabled={travado}
                      onChange={(e) => mudar(it.uid, "natureza", e.target.value, true)}
                      aria-label="Natureza"
                    >
                      {NATUREZAS.map((k) => (
                        <option key={k} value={k}>
                          {NAT[k].nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  {v.veCustos && <td className="dir">{custoUnitario(it)}</td>}
                  <td>{quantidade(l)}</td>
                  {v.veCustos && <td className="valor">{num(l.custo)}</td>}
                  <td className="valor forte">{num(l.preco)}</td>
                  <td>
                    <button
                      className="botao-icone"
                      onClick={() => remover(it.uid)}
                      aria-label={`Remover ${it.nome}`}
                      disabled={travado}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            }),
          ];
        })}
      </tbody>
    </table>
  );
}
