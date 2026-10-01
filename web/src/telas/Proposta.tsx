/** Proposta: visão do cliente (sem custos nem margem), no padrão do PDF do Cronogramas. Imprime ou salva em PDF. */
import { NATUREZAS, type Natureza } from "@orcamentos/compartilhado/calc";
import { ArrowLeft, Printer } from "lucide-react";
import { useSessao } from "plataforma-kit/react";
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useBase } from "../dados";
import { brl, data, int, MODELOS, num } from "../formato";
import { visao } from "../visao";

const TITULO: Record<Natureza, string> = {
  setup: "Implantação · pagamento único",
  mensal: "Operação · mensalidade fixa",
  variavel: "Operação variável · estimativa mensal",
};

export function Proposta() {
  const { id } = useParams();
  const b = useBase().data!;
  const { pode } = useSessao();
  const navegar = useNavigate();
  const o = b.orcamentos.find((x) => x.id === id);
  useEffect(() => {
    if (o) document.title = `Proposta ${o.numero} · ${o.projeto}`;
  }, [o]);
  if (!o) return <Navigate to="/" replace />;
  const v = visao(o, pode("orcamentos.custos.ver"));
  const p = o.params;
  const s = b.settings;

  const secoes = NATUREZAS.map((n) => {
    const linhas = v.linhas.filter((l) => l.natureza === n);
    if (!linhas.length) return null;
    // itens com grupo (ex.: Squad Dev) aparecem somados numa linha só, como na v1.2.1
    type Linha = { nome: string; qtd: number; preco: number; un: string; gmv?: boolean };
    const rows: Linha[] = [];
    const grupos: Record<string, Linha> = {};
    linhas.forEach((l) => {
      const g = l.item.grupo;
      if (g) {
        if (!grupos[g]) rows.push((grupos[g] = { nome: g, qtd: 0, preco: 0, un: "h" }));
        grupos[g].qtd += l.qtd || 0;
        grupos[g].preco += l.preco;
      } else
        rows.push({
          nome: l.item.nome ?? "",
          qtd: l.qtd ?? 0,
          preco: l.preco,
          un: l.item.tipoCobranca === "hora" ? "h" : (l.item.unidade ?? ""),
          gmv: l.item.tipoCobranca === "percentual",
        });
    });
    return (
      <div key={n}>
        <h2>
          <span>{TITULO[n]}</span>
          <span className="num">{brl(v.nat[n].preco)}</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th style={{ textAlign: "right" }}>Quantidade</th>
              <th style={{ textAlign: "right" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.nome}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.gmv ? "sobre GMV" : `${int(r.qtd)} ${r.un}`}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="num">
                  {brl(r.preco)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });

  return (
    <div className="tela-pdf">
      <div className="barra-pdf">
        <button className="botao-icone" onClick={() => navegar(`/orcamentos/${o.id}`)} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <strong>Proposta</strong>
        <span className="dica-campo">Visão do cliente: sem custos nem margem.</span>
        <span className="espaco" />
        <button className="botao botao-primario" onClick={() => window.print()}>
          <Printer size={15} /> Imprimir ou salvar PDF
        </button>
      </div>
      <div className="rolagem-pdf">
        <div className="folha">
          <div className="cabecalho-pdf">
            <div>
              <span className="marca-pdf">
                <i style={{ background: "#2f6bdb", width: 16 }} />
                <i style={{ background: "#13968a", width: 20, marginLeft: 6 }} />
                <i style={{ background: "#e08a00", width: 12, marginLeft: 3 }} />
              </span>
              <h1>{o.projeto}</h1>
              <p>
                {o.cliente}, {MODELOS[o.modelo] ?? o.modelo}
                {o.responsavel ? `, Responsável: ${o.responsavel}` : ""}
              </p>
            </div>
            <p style={{ textAlign: "right" }}>
              <b style={{ color: "#18202e" }}>{s.empresa}</b>
              <br />
              {o.numero}
              <br />
              Emitida em {data(new Date().toISOString())}
              <br />
              Válida até {data(o.validade)}
            </p>
          </div>
          {secoes.some(Boolean) ? secoes : <p>Sem itens.</p>}
          {p.feeGmv ? (
            <>
              <h2>
                <span>Fee de performance · mensal</span>
                <span>{num(p.feeGmv, 1)}% do GMV</span>
              </h2>
              <p style={{ margin: 0 }}>
                Estimado em {brl(v.feeMes)} por mês, considerando GMV de {brl(p.gmvMes)}.
              </p>
            </>
          ) : null}
          <div className="totais-pdf">
            <div>
              <small>Setup (único)</small>
              <b>{brl(v.setup)}</b>
            </div>
            <div>
              <small>{v.temRecorrente ? "Mensalidade estimada" : "Horas de implantação"}</small>
              <b>{v.temRecorrente ? brl(v.mensal) : `${int(v.horasSetup)} h`}</b>
            </div>
            <div className="destaque">
              <small>{v.temRecorrente ? `Total em ${p.meses ?? 0} meses` : "Valor total"}</small>
              <b>{brl(v.tcv)}</b>
            </div>
          </div>
          {v.nat.variavel.quantidade > 0 && (
            <p style={{ marginTop: 12, fontSize: 11, color: "#8a93a5" }}>
              Valores variáveis estimados para {int(p.pedidosMes)} pedidos por mês. O faturamento considera o volume
              realizado.
            </p>
          )}
          {o.premissas && (
            <>
              <h2>
                <span>Premissas</span>
              </h2>
              <div className="premissas-pdf">{o.premissas}</div>
            </>
          )}
          <div className="rodape-pdf">
            {s.empresa} · {o.numero} · Valores em reais{p.imposto ? ", impostos inclusos" : ""}.
          </div>
        </div>
      </div>
    </div>
  );
}
