/**
 * Ligar orçamentos ao cadastro (v2.1.0). Os orçamentos da v1 têm o cliente como texto livre: os textos chegam
 * agrupados por nome normalizado, com a sugestão do cadastro e o aviso de grupos parecidos (possíveis duplicados).
 * Nada é ligado antes da revisão; escolher o mesmo destino para dois grupos junta os dois.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { useAvisos } from "plataforma-kit/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cliente } from "../api";
import { Carregando, Vazio } from "../componentes";
import { CHAVE_BASE, useBase } from "../dados";

interface Grupo {
  chave: string;
  textos: { texto: string; orcamentos: number }[];
  orcamentos: number;
  sugestao: { id: string; nome: string } | null;
  parecidosCadastro: { id: string; nome: string }[];
  parecidosGrupos: string[];
}
/** "": não ligar agora; "novo": criar cliente com o nome digitado; senão, o id do cliente do cadastro */
type Escolha = { destino: string; nomeNovo: string };

export function Ligacao() {
  const b = useBase().data!;
  const navegar = useNavigate();
  const avisos = useAvisos();
  const qc = useQueryClient();
  const previa = useQuery({
    queryKey: ["ligacao"],
    queryFn: () => cliente.get<{ grupos: Grupo[]; semLigacao: number }>("/api/clientes/ligacao"),
  });
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [enviando, setEnviando] = useState(false);

  if (!previa.data) return <Carregando />;
  const grupos = previa.data.grupos;
  const ativos = (b.clientes ?? []).filter((c) => c.situacao === "ativo");
  const nomeDoGrupo = (g: Grupo) => [...g.textos].sort((x, y) => y.orcamentos - x.orcamentos)[0].texto.trim();
  const escolhaDe = (g: Grupo): Escolha =>
    escolhas[g.chave] ?? { destino: g.sugestao?.id ?? "", nomeNovo: nomeDoGrupo(g) };
  const mudar = (g: Grupo, x: Partial<Escolha>) => setEscolhas({ ...escolhas, [g.chave]: { ...escolhaDe(g), ...x } });

  const prontos = grupos.filter((g) => escolhaDe(g).destino);
  const orcamentosProntos = prontos.reduce((t, g) => t + g.orcamentos, 0);
  const novosVazios = prontos.some((g) => escolhaDe(g).destino === "novo" && !escolhaDe(g).nomeNovo.trim());

  function todosComoNovos() {
    const novas: Record<string, Escolha> = {};
    for (const g of grupos) novas[g.chave] = { ...escolhaDe(g), destino: escolhaDe(g).destino || "novo" };
    setEscolhas(novas);
  }

  async function confirmar() {
    // grupos que vão para o MESMO cliente novo (mesmo nome) viram um só, para não criar o cliente duas vezes
    const novos = new Map<string, string[]>();
    const existentes: { textos: string[]; destino: { clienteId: string } }[] = [];
    for (const g of prontos) {
      const e = escolhaDe(g);
      const textos = g.textos.map((t) => t.texto);
      if (e.destino === "novo") {
        const k = e.nomeNovo.trim();
        novos.set(k, [...(novos.get(k) ?? []), ...textos]);
      } else existentes.push({ textos, destino: { clienteId: e.destino } });
    }
    const corpo = {
      grupos: [...existentes, ...[...novos].map(([nome, textos]) => ({ textos, destino: { novo: { nome } } }))],
    };
    const ok = await avisos.confirmar({
      titulo: "Ligar orçamentos ao cadastro",
      texto: `${orcamentosProntos} orçamento(s) serão ligados${novos.size ? `, criando ${novos.size} cliente(s) novo(s)` : ""}. Orçamentos ainda não enviados passam a mostrar o nome do cadastro.`,
      acao: "Ligar",
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const r = await cliente.post<{ ligados: number; criados: number }>("/api/clientes/ligacao", corpo);
      avisos.avisar(`${r.ligados} orçamento(s) ligados${r.criados ? `, ${r.criados} cliente(s) criados` : ""}`);
      await qc.invalidateQueries({ queryKey: CHAVE_BASE });
      await previa.refetch();
      setEscolhas({});
    } catch (e) {
      avisos.erro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <div className="linha-inline" style={{ gap: 8 }}>
          <button className="botao-icone" onClick={() => navegar("/clientes")} aria-label="Voltar para clientes">
            <ArrowLeft size={18} />
          </button>
          <h1 className="titulo-pagina">Ligar orçamentos ao cadastro</h1>
        </div>
        <div className="linha-inline">
          {grupos.length > 0 && (
            <button className="botao" onClick={todosComoNovos}>
              Sem destino → cliente novo
            </button>
          )}
          <button
            className="botao botao-primario"
            disabled={!prontos.length || novosVazios || enviando}
            onClick={confirmar}
          >
            <Check size={15} /> Ligar {orcamentosProntos || ""} orçamento(s)
          </button>
        </div>
      </div>
      <p className="texto-apoio" style={{ marginBottom: 12 }}>
        Os nomes de cliente escritos à mão estão agrupados (sem acentos, pontuação e sufixos como Ltda ou S.A.). Escolha
        para onde cada grupo vai: um cliente do cadastro, um cliente novo ou nada por enquanto. Grupos marcados como
        parecidos podem ser o mesmo cliente: escolha o mesmo destino para juntá-los.
      </p>
      {!grupos.length ? (
        <Vazio titulo="Nada para ligar" texto="Todos os orçamentos com nome de cliente já estão ligados ao cadastro." />
      ) : (
        <div className="tabela rolagem">
          <table>
            <thead>
              <tr>
                <th>Como está nos orçamentos</th>
                <th className="dir">Orçamentos</th>
                <th>Ligar a</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const e = escolhaDe(g);
                return (
                  <tr key={g.chave}>
                    <td style={{ minWidth: 240 }}>
                      {g.textos.map((t) => (
                        <div key={t.texto}>
                          <span className="forte">{t.texto}</span> <span className="secundario">· {t.orcamentos}</span>
                        </div>
                      ))}
                      {g.parecidosGrupos.length > 0 && (
                        <div className="dica-campo atraso" style={{ marginTop: 4 }}>
                          Parecido com:{" "}
                          {g.parecidosGrupos.map((k) => nomeDoGrupo(grupos.find((x) => x.chave === k)!)).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="valor">{g.orcamentos}</td>
                    <td style={{ minWidth: 300 }}>
                      <select
                        className="entrada"
                        value={e.destino}
                        onChange={(ev) => mudar(g, { destino: ev.target.value })}
                        aria-label={`Destino de ${nomeDoGrupo(g)}`}
                      >
                        <option value="">Não ligar agora</option>
                        <option value="novo">Cliente novo…</option>
                        {g.sugestao && <option value={g.sugestao.id}>Sugerido: {g.sugestao.nome}</option>}
                        {g.parecidosCadastro.length > 0 && (
                          <optgroup label="Parecidos no cadastro">
                            {g.parecidosCadastro.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Todos os clientes ativos">
                          {ativos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {e.destino === "novo" && (
                        <input
                          className="entrada"
                          style={{ marginTop: 6 }}
                          value={e.nomeNovo}
                          onChange={(ev) => mudar(g, { nomeNovo: ev.target.value })}
                          aria-label={`Nome do cliente novo para ${nomeDoGrupo(g)}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
