/** Aba Templates: lista com valor de referência e editor em janela. */
import { calcular, NATUREZAS } from "@orcamentos/compartilhado/calc";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal, useAvisos, useSessao } from "plataforma-kit/react";
import { useState } from "react";
import { cliente } from "../api";
import { BarraMargem, Vazio } from "../componentes";
import { useAlteracao, useBase } from "../dados";
import { ALOCACAO, brl, MODELOS, NAT, pct } from "../formato";
import type { Base, ItemTemplate, Template } from "../tipos";
import { NovoOrcamento } from "./NovoOrcamento";
import { Pagina } from "./Pagina";

const pctAlocacao = (b: Base, a?: string | null) =>
  a === "dedicado" ? b.settings.gpDedicadoPct : a === "compartilhado" ? b.settings.gpCompartilhadoPct : null;

/** Simula o template com a tabela de custos e o dólar vigentes (mesma regra da v1.2.1). */
function simular(b: Base, t: Template) {
  return calcular({
    cambio: b.settings.cambio.usd,
    params: t.params,
    itens: t.itens
      .map((ti) => {
        const sv = b.servicos.find((s) => s.id === ti.servicoId);
        if (!sv) return null;
        const papel = b.perfis.find((p) => p.id === sv.perfilId);
        const perc = pctAlocacao(b, ti.alocacao);
        return {
          ...ti,
          percHoras: perc != null ? perc : ti.percHoras,
          tipoCobranca: sv.tipoCobranca,
          natureza: ti.natureza || sv.natureza,
          moeda: papel ? papel.moeda : sv.moeda || "BRL",
          custoUnit: papel ? papel.custoHora : sv.custoUnit,
          perfilNome: papel?.nome,
        };
      })
      .filter((x) => x !== null),
  });
}

export function Templates() {
  const b = useBase().data!;
  const { pode } = useSessao();
  const avisos = useAvisos();
  const [editando, setEditando] = useState<Template | null>(null);
  const [usar, setUsar] = useState<string | null>(null);
  const gerenciar = pode("orcamentos.templates.gerenciar");
  const veCustos = pode("orcamentos.custos.ver");
  const excluir = useAlteracao((id: string) => cliente.delete(`/api/templates/${id}`), "Template excluído");
  const novo = (): Template => {
    const s = b.settings;
    return {
      id: "",
      nome: "",
      modelo: "projeto",
      descricao: "",
      params: {
        modoPreco: s.modoPrecoPadrao,
        margem: s.margemAlvo,
        imposto: s.impostoPadrao,
        contingencia: s.contingenciaPadrao,
        meses: 12,
        pedidosMes: 0,
        gmvMes: 0,
        feeGmv: 0,
      },
      itens: [],
    };
  };
  const botaoNovo = gerenciar && (
    <button className="botao botao-primario" onClick={() => setEditando(novo())}>
      <Plus size={15} /> Novo template
    </button>
  );
  async function confirmarExclusao(t: Template) {
    if (
      await avisos.confirmar({
        titulo: "Excluir template",
        texto: `“${t.nome}” será excluído. Orçamentos já criados a partir dele não mudam.`,
        acao: "Excluir",
        perigo: true,
      })
    )
      excluir.mutate(t.id);
  }

  return (
    <Pagina acoes={botaoNovo}>
      {!b.templates.length ? (
        <Vazio titulo="Nenhum template" texto="Crie um aqui ou use “Salvar como template” dentro de um orçamento.">
          {botaoNovo}
        </Vazio>
      ) : (
        <div className="tabela rolagem">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Modelo</th>
                <th className="dir">Itens</th>
                {veCustos && <th className="dir">Valor de referência</th>}
                {veCustos && <th>Margem real</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {b.templates.map((t) => {
                const c = veCustos ? simular(b, t) : null;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="forte">{t.nome}</div>
                      <div className="secundario">{t.descricao}</div>
                    </td>
                    <td>{MODELOS[t.modelo] ?? t.modelo}</td>
                    <td className="valor">{t.itens.length}</td>
                    {c && (
                      <td className="valor">
                        {brl(c.tcv)}
                        {c.temRecorrente && <div className="secundario">{t.params.meses} meses</div>}
                      </td>
                    )}
                    {c && (
                      <td>
                        <div className="linha-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
                          <BarraMargem margem={c.margemReal} />
                          <span className="num">{pct(c.margemReal)}</span>
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="linha-inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {gerenciar && (
                          <>
                            <button
                              className="botao-icone"
                              onClick={() => setEditando(JSON.parse(JSON.stringify(t)))}
                              aria-label={`Editar ${t.nome}`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="botao-icone"
                              onClick={() => confirmarExclusao(t)}
                              aria-label={`Excluir ${t.nome}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                        {pode("orcamentos.editar") && (
                          <button className="botao botao-pequeno" onClick={() => setUsar(t.id)}>
                            Usar template
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editando && <EditorTemplate inicial={editando} aoFechar={() => setEditando(null)} />}
      {usar && <NovoOrcamento templateId={usar} aoFechar={() => setUsar(null)} />}
    </Pagina>
  );
}

function EditorTemplate({ inicial, aoFechar }: { inicial: Template; aoFechar: () => void }) {
  const b = useBase().data!;
  const avisos = useAvisos();
  const [t, setT] = useState<Template>(inicial);
  const p = t.params as Record<string, number | string | undefined>;
  const salvar = useAlteracao(
    (x: Template) => (x.id ? cliente.put(`/api/templates/${x.id}`, x) : cliente.post("/api/templates", x)),
    "Template salvo",
  );
  const areas = [...new Set(b.servicos.map((s) => s.area))];
  const mudarParam = (k: string, v: unknown) => setT({ ...t, params: { ...t.params, [k]: v } });

  function mudarCampoItem(i: number, k: keyof ItemTemplate, valor: string, ehSelect: boolean) {
    const it: ItemTemplate = { ...t.itens[i], [k]: ehSelect ? valor : Number(valor) };
    if (k === "servicoId") {
      delete it.natureza;
      it.qtdModo = "fixa";
    }
    if (k === "qtdModo" && it.qtdModo === "percHoras") {
      it.alocacao = it.alocacao || "dedicado";
      it.percHoras = pctAlocacao(b, it.alocacao) ?? 0;
    }
    if (k === "alocacao" && pctAlocacao(b, it.alocacao) != null) it.percHoras = pctAlocacao(b, it.alocacao)!;
    setT((x) => ({ ...x, itens: x.itens.map((y, j) => (j === i ? it : y)) }));
  }

  const campoPct = (k: string, rotulo: string) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada num"
        type="number"
        value={+((Number(p[k]) || 0) * 100).toFixed(2)}
        onChange={(e) => mudarParam(k, Number(e.target.value) / 100)}
      />
    </label>
  );
  const campoNum = (k: string, rotulo: string) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada num"
        type="number"
        value={Number(p[k] ?? 0)}
        onChange={(e) => mudarParam(k, Number(e.target.value))}
      />
    </label>
  );

  function enviar() {
    if (!t.nome.trim()) return avisos.erro("Dê um nome ao template.");
    salvar.mutate({ ...t, nome: t.nome.trim() }, { onSuccess: aoFechar });
  }

  return (
    <Modal titulo={t.id ? "Editar template" : "Novo template"} aoFechar={aoFechar} largura={880}>
      <div className="grade-campos" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <label className="campo">
          <span className="rotulo-campo">Nome</span>
          <input className="entrada" value={t.nome} autoFocus onChange={(e) => setT({ ...t, nome: e.target.value })} />
        </label>
        <label className="campo">
          <span className="rotulo-campo">Modelo</span>
          <select className="entrada" value={t.modelo} onChange={(e) => setT({ ...t, modelo: e.target.value })}>
            {Object.entries(MODELOS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="campo">
        <span className="rotulo-campo">Descrição</span>
        <input
          className="entrada"
          value={t.descricao ?? ""}
          onChange={(e) => setT({ ...t, descricao: e.target.value })}
        />
      </label>
      <div className="grade-campos" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <label className="campo">
          <span className="rotulo-campo">Modo</span>
          <select
            className="entrada"
            value={String(p.modoPreco ?? "margem")}
            onChange={(e) => mudarParam("modoPreco", e.target.value)}
          >
            <option value="margem">Margem</option>
            <option value="markup">Markup</option>
          </select>
        </label>
        {campoPct("margem", "Margem / markup %")}
        {campoPct("imposto", "Impostos %")}
        {campoPct("contingencia", "Contingência %")}
        {campoNum("meses", "Meses")}
        {campoNum("pedidosMes", "Pedidos / mês")}
        {campoNum("gmvMes", "GMV / mês")}
        {campoNum("feeGmv", "Fee GMV %")}
      </div>
      <div className="rotulo-campo">Itens</div>
      <div className="tabela rolagem">
        <table className="tabela-itens">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Natureza</th>
              <th>Quantidade</th>
              <th className="dir">Qtd. / fator / %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.itens.length ? (
              t.itens.map((it, i) => {
                const sv = b.servicos.find((s) => s.id === it.servicoId);
                const chave = it.qtdModo === "porPedido" ? "fator" : it.qtdModo === "percHoras" ? "percHoras" : "qtd";
                return (
                  <tr key={i}>
                    <td>
                      <select
                        className="celula"
                        style={{ width: "100%", maxWidth: 280 }}
                        value={it.servicoId}
                        onChange={(e) => mudarCampoItem(i, "servicoId", e.target.value, true)}
                        aria-label="Serviço"
                      >
                        {areas.map((a) => (
                          <optgroup key={a} label={a}>
                            {b.servicos
                              .filter((s) => s.area === a)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nome}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="celula"
                        value={it.natureza || sv?.natureza}
                        onChange={(e) => mudarCampoItem(i, "natureza", e.target.value, true)}
                        aria-label="Natureza"
                      >
                        {NATUREZAS.map((n) => (
                          <option key={n} value={n}>
                            {NAT[n].nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="celula"
                        value={it.qtdModo || "fixa"}
                        disabled={!["unidade", "hora"].includes(sv?.tipoCobranca ?? "")}
                        onChange={(e) => mudarCampoItem(i, "qtdModo", e.target.value, true)}
                        aria-label="Modo de quantidade"
                      >
                        <option value="fixa">{sv?.tipoCobranca === "hora" ? "Horas" : "Fixa"}</option>
                        {sv?.tipoCobranca === "unidade" && <option value="porPedido">× pedidos</option>}
                        {sv?.tipoCobranca === "hora" && <option value="percHoras">% das horas</option>}
                      </select>
                      {it.qtdModo === "percHoras" && (
                        <select
                          className="celula"
                          value={it.alocacao || "personalizado"}
                          onChange={(e) => mudarCampoItem(i, "alocacao", e.target.value, true)}
                          aria-label="Alocação"
                        >
                          {Object.entries(ALOCACAO).map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="dir">
                      <input
                        className="celula"
                        style={{ width: 80 }}
                        type="number"
                        step={0.1}
                        value={Number(it[chave] ?? 0)}
                        onChange={(e) => mudarCampoItem(i, chave, e.target.value, false)}
                        aria-label="Quantidade, fator ou percentual"
                      />
                    </td>
                    <td>
                      <button
                        className="botao-icone"
                        onClick={() => setT({ ...t, itens: t.itens.filter((_, j) => j !== i) })}
                        aria-label="Remover linha"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="secundario" style={{ textAlign: "center", padding: 18 }}>
                  Nenhum item. Adicione linhas abaixo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <button
          className="botao botao-pequeno"
          disabled={!b.servicos.length}
          onClick={() =>
            setT({ ...t, itens: [...t.itens, { servicoId: b.servicos[0].id, qtd: 1, qtdModo: "fixa", fator: 0 }] })
          }
        >
          <Plus size={15} /> Adicionar linha
        </button>
      </div>
      <div className="acoes-modal">
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="botao botao-primario" disabled={salvar.isPending} onClick={enviar}>
          Salvar template
        </button>
      </div>
    </Modal>
  );
}
