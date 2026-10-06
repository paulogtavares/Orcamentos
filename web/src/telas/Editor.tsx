/**
 * Editor de orçamento (layout da tela de cronograma, como na v1.2.1): cabeçalho com métricas, barra de
 * ferramentas com o fluxo de status, itens por natureza, premissas, dados, precificação e resumo.
 * Salva sozinho 700 ms depois da última alteração.
 */
import { STATUS, TRANSICOES, validarPrecificacao, type Status } from "@orcamentos/compartilhado/calc";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileDown, History, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { useAvisos, useSessao } from "plataforma-kit/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { cliente } from "../api";
import { BarraMargem, Selo, usePedirTexto } from "../componentes";
import { CHAVE_BASE, useBase } from "../dados";
import { brl, int, MODELOS, NAT, num, pct } from "../formato";
import type { Base, Cliente, Item, Orcamento } from "../tipos";
import { visao } from "../visao";
import { Catalogo } from "./Catalogo";
import { Historico } from "./Historico";
import { Itens } from "./Itens";

const ROTULO_TRANSICAO: Record<string, string> = {
  em_aprovacao: "Enviar para aprovação",
  aprovado: "Aprovar",
  enviado: "Marcar como enviado",
  aceito: "Cliente aceitou",
  perdido: "Perdido",
  rascunho: "Voltar para rascunho",
};
const PERGUNTA: Record<string, [string, string]> = {
  em_aprovacao: ["Enviar para aprovação", "Justificativa para a aprovação (opcional)"],
  aprovado: ["Aprovar orçamento", "Comentário da aprovação (opcional)"],
  perdido: ["Marcar como perdido", "Motivo da perda: preço, prazo, concorrente…"],
  rascunho: ["Voltar para rascunho", "Motivo da revisão (opcional)"],
};
const CAMPOS_SALVOS = [
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
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function Editor() {
  const { id } = useParams();
  const b = useBase().data!;
  const original = b.orcamentos.find((o) => o.id === id);
  const avisos = useAvisos();
  const navegar = useNavigate();
  useEffect(() => {
    if (!original) {
      avisos.erro("Orçamento não encontrado.");
      navegar("/", { replace: true });
    }
  }, [original, avisos, navegar]);
  return original ? <EditorOrcamento key={original.id} original={original} base={b} /> : null;
}

function EditorOrcamento({ original, base }: { original: Orcamento; base: Base }) {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const texto = usePedirTexto();
  const veCustos = pode("orcamentos.custos.ver");
  const podeEditar = pode("orcamentos.editar");
  const podeAprovar = pode("orcamentos.aprovar");

  const [orc, setOrc] = useState<Orcamento>(() => copia(original));
  const [situacao, setSituacao] = useState("");
  const [painel, setPainel] = useState(false);
  const [catalogo, setCatalogo] = useState(false);
  const [menu, setMenu] = useState(false);
  const atual = useRef(orc);
  atual.current = orc;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bloqueado = ["enviado", "aceito"].includes(orc.status);
  const travado = bloqueado || !podeEditar;
  const v = visao(orc, veCustos);
  const s = base.settings;
  const min = s.margemMinima ?? 0;
  const margem = v.calculo?.margemReal ?? 0;
  const baixa = veCustos && margem < min && orc.itens.length > 0;

  useEffect(() => {
    document.title = `${orc.projeto} · Orçamentos`;
  }, [orc.projeto]);

  /** Atualiza o orçamento no cache da base (lista e abas veem a versão nova sem recarregar tudo). */
  const guardarNaBase = useCallback(
    (o: Orcamento) =>
      qc.setQueryData<Base>(
        CHAVE_BASE,
        (bb) => bb && { ...bb, orcamentos: bb.orcamentos.map((x) => (x.id === o.id ? o : x)) },
      ),
    [qc],
  );

  const salvar = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const o = atual.current;
    const corpo = Object.fromEntries(CAMPOS_SALVOS.map((k) => [k, o[k]]));
    try {
      setSituacao("Salvando…");
      const r = await cliente.put<Orcamento>(`/api/orcamentos/${o.id}`, corpo);
      guardarNaBase(r);
      const mudouStatus = r.status !== o.status;
      setOrc((x) => {
        // mantém o que foi digitado durante o salvamento; do servidor vêm status, histórico, resumo e,
        // para quem não vê custos, o preço recalculado de cada item
        const precos = new Map(r.itens.map((i) => [i.uid, i.preco]));
        return {
          ...x,
          status: r.status,
          historico: r.historico,
          resumo: r.resumo,
          itens: veCustos ? x.itens : x.itens.map((i) => (precos.has(i.uid) ? { ...i, preco: precos.get(i.uid) } : i)),
        };
      });
      if (mudouStatus) avisos.avisar("Editado após aprovação: voltou para rascunho.");
      setSituacao(`Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (e) {
      setSituacao("Erro ao salvar");
      avisos.erro(e);
    }
  }, [avisos, guardarNaBase, veCustos]);

  const alterar = (mudanca: Partial<Orcamento>) => {
    if (travado) return;
    const novo = { ...atual.current, ...mudanca };
    setOrc(novo);
    atual.current = novo;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // com margem + imposto ≥ 100% o preço não existe: não salva até a precificação voltar a ser válida
    if (validarPrecificacao(novo.params)) {
      setSituacao("Não salvo: ajuste a precificação");
      return;
    }
    setSituacao("Alterações pendentes…");
    timer.current = setTimeout(salvar, 700);
  };
  const alterarParam = (k: string, valor: unknown) => alterar({ params: { ...orc.params, [k]: valor } });

  // salva o que estiver pendente ao sair da tela
  useEffect(
    () => () => {
      if (timer.current) void salvar();
    },
    [salvar],
  );
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (timer.current) {
        void salvar();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [salvar]);

  const substituir = (r: Orcamento) => {
    guardarNaBase(r);
    setOrc(copia(r));
  };

  async function mudarStatus(novo: string) {
    let comentario = "";
    if (PERGUNTA[novo]) {
      const r = await texto.pedir({ titulo: PERGUNTA[novo][0], rotulo: PERGUNTA[novo][1], acao: "Confirmar" });
      if (r === null) return;
      comentario = r;
    }
    try {
      if (timer.current) await salvar();
      const r = await cliente.post<Orcamento>(`/api/orcamentos/${orc.id}/status`, { status: novo, comentario });
      substituir(r);
      avisos.avisar(`Status: ${STATUS[novo as Status].label}`);
    } catch (e) {
      avisos.erro(e);
    }
  }

  async function acao(a: "duplicar" | "versao" | "atualizar-custos") {
    setMenu(false);
    try {
      if (timer.current) await salvar();
      const r = await cliente.post<Orcamento>(`/api/orcamentos/${orc.id}/${a}`);
      await qc.invalidateQueries({ queryKey: CHAVE_BASE });
      if (a === "duplicar") {
        avisos.avisar(`Cópia criada: ${r.numero}`);
        navegar(`/orcamentos/${r.id}`);
        return;
      }
      setOrc(copia(r));
      avisos.avisar(a === "versao" ? "Versão salva" : "Custos e dólar atualizados pela tabela vigente");
    } catch (e) {
      avisos.erro(e);
    }
  }

  async function adicionarItem(servicoId: string) {
    try {
      if (timer.current) await salvar();
      const r = await cliente.post<Orcamento>(`/api/orcamentos/${orc.id}/item`, { servicoId, qtd: 1 });
      substituir(r);
      setCatalogo(false);
      avisos.avisar("Item adicionado. Ajuste a quantidade.");
    } catch (e) {
      avisos.erro(e);
    }
  }

  async function excluir() {
    setMenu(false);
    const ok = await avisos.confirmar({
      titulo: "Excluir orçamento",
      texto: `${orc.numero} · ${orc.projeto} será excluído definitivamente, com todas as versões.`,
      acao: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    try {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      await cliente.delete(`/api/orcamentos/${orc.id}`);
      await qc.invalidateQueries({ queryKey: CHAVE_BASE });
      navegar("/");
      avisos.avisar("Orçamento excluído");
    } catch (e) {
      avisos.erro(e);
    }
  }

  async function salvarComoTemplate() {
    setMenu(false);
    const nome = await texto.pedir({
      titulo: "Salvar como template",
      rotulo: "Nome do template",
      inicial: orc.projeto,
      acao: "Salvar template",
      obrigatorio: true,
    });
    if (!nome) return;
    try {
      await cliente.post("/api/templates", {
        nome: nome.trim(),
        modelo: orc.modelo,
        descricao: `Criado a partir de ${orc.numero}`,
        params: orc.params,
        itens: orc.itens.map((i) => ({
          servicoId: i.servicoId,
          qtd: i.qtd,
          qtdModo: i.qtdModo,
          fator: i.fator,
          natureza: i.natureza,
          percHoras: i.percHoras,
          alocacao: i.alocacao,
        })),
      });
      await qc.invalidateQueries({ queryKey: CHAVE_BASE });
      avisos.avisar("Template salvo");
    } catch (e) {
      avisos.erro(e);
    }
  }

  function exportarCSV() {
    setMenu(false);
    const cab = [
      "Natureza",
      "Área",
      "Item",
      "Papel de custo / unidade",
      ...(veCustos ? ["Moeda", "Custo unitário"] : []),
      "Qtd efetiva",
      ...(veCustos ? ["Custo R$"] : []),
      "Preço R$",
    ];
    const linhas = v.linhas.map((l) => [
      NAT[l.natureza].nome,
      l.item.area ?? "",
      l.item.nome ?? "",
      l.item.perfilNome || l.item.unidade || "",
      ...(veCustos ? [l.item.moeda ?? "", num(l.item.custoUnit)] : []),
      l.qtd === null ? "" : num(l.qtd),
      ...(veCustos ? [num(l.custo)] : []),
      num(l.preco),
    ]);
    const csv =
      "\ufeff" + [cab, ...linhas].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${orc.numero}.csv`;
    a.click();
  }

  // transições que esta pessoa pode fazer (aprovar e devolver exigem orcamentos.aprovar)
  const transicoes = (TRANSICOES[orc.status as Status] ?? []).filter((n) =>
    orc.status === "em_aprovacao" && (n === "aprovado" || n === "rascunho") ? podeAprovar : podeEditar,
  );
  const p = orc.params;
  const campoPct = (k: string, rotulo: string, passo = 0.5) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada num"
        type="number"
        step={passo}
        value={+((Number((p as Record<string, unknown>)[k]) || 0) * 100).toFixed(2)}
        disabled={travado}
        onChange={(e) => alterarParam(k, Number(e.target.value) / 100)}
      />
    </label>
  );
  const campoNum = (k: string, rotulo: string, passo = 1) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada num"
        type="number"
        min={0}
        step={passo}
        value={Number((p as Record<string, unknown>)[k] ?? 0)}
        disabled={travado}
        onChange={(e) => alterarParam(k, Number(e.target.value))}
      />
    </label>
  );
  const campoTexto = (
    k: "projeto" | "cliente" | "responsavel" | "validade",
    rotulo: string,
    tipo = "text",
    estilo = {},
  ) => (
    <label className="campo" style={estilo}>
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada"
        type={tipo}
        value={orc[k] ?? ""}
        disabled={travado}
        onChange={(e) => alterar({ [k]: e.target.value })}
      />
    </label>
  );
  const erroPreco = validarPrecificacao(p);
  const horasPorPapel = Object.entries(v.horasPerfil).sort((a, b) => b[1].setup + b[1].mes - (a[1].setup + a[1].mes));

  return (
    <>
      <section className="cabecalho-projeto">
        <div className="titulo-projeto">
          <button
            className="botao-icone"
            onClick={() => navegar("/")}
            aria-label="Voltar para orçamentos"
            style={{ marginTop: 2 }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{orc.projeto}</h1>
            <p>
              {orc.cliente}, {MODELOS[orc.modelo] ?? orc.modelo}
              {orc.responsavel ? `, Responsável: ${orc.responsavel}` : ""}{" "}
              <span className="selo selo-codigo">{orc.numero}</span> <Selo status={orc.status} />{" "}
              <span className="salvando-editor" aria-live="polite">
                {situacao}
              </span>
            </p>
          </div>
        </div>
        <div className="lado-projeto">
          <div className="metricas">
            <div className="metrica">
              <span className="rotulo">Setup</span>
              <span className="v">{brl(v.setup)}</span>
            </div>
            {v.temRecorrente ? (
              <div className="metrica">
                <span className="rotulo">Mensalidade</span>
                <span className="v">{brl(v.mensal)}</span>
              </div>
            ) : (
              <div className="metrica">
                <span className="rotulo">Horas</span>
                <span className="v">{int(v.horasSetup)} h</span>
              </div>
            )}
            <div className="metrica">
              <span className="rotulo">{v.temRecorrente ? `Contrato, ${p.meses ?? 0} meses` : "Valor total"}</span>
              <span className="v">{brl(v.tcv)}</span>
            </div>
            {veCustos && (
              <div className="metrica">
                <span className="rotulo">Margem real</span>
                <span className={`v ${baixa ? "atraso" : ""}`}>
                  <BarraMargem margem={margem} minima={min} larga baixa={baixa} />
                  {pct(margem)}
                </span>
              </div>
            )}
          </div>
          <div className="linha-inline">
            <button className="botao" onClick={() => navegar(`/orcamentos/${orc.id}/proposta`)}>
              <FileDown size={15} /> Proposta
            </button>
            <button className="botao" onClick={() => setPainel(true)}>
              <History size={15} /> Histórico
            </button>
            {podeEditar && (
              <div className="menu-ancora">
                <button className="botao" onClick={() => setMenu(!menu)} aria-haspopup="true" aria-expanded={menu}>
                  <MoreHorizontal size={15} /> Mais
                </button>
                {menu && (
                  <div className="menu-lista menu-flutuante" onMouseLeave={() => setMenu(false)}>
                    <button onClick={() => acao("duplicar")}>Duplicar orçamento</button>
                    <button onClick={() => acao("versao")}>Salvar versão agora</button>
                    {pode("orcamentos.templates.gerenciar") && (
                      <button onClick={salvarComoTemplate}>Salvar como template</button>
                    )}
                    <button onClick={exportarCSV}>Exportar itens (CSV)</button>
                    <hr />
                    <button className="perigo" onClick={excluir}>
                      Excluir orçamento
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="barra-ferramentas">
        <button className="botao" onClick={() => setCatalogo(true)} disabled={travado}>
          <Plus size={15} /> Item
        </button>
        <button
          className="botao"
          onClick={() => acao("atualizar-custos")}
          disabled={travado}
          title="Reaplica a tabela de custos e o dólar vigentes"
        >
          <RefreshCw size={15} /> Atualizar custos
        </button>
        {transicoes.length > 0 && <span className="separador" />}
        {transicoes.map((n) => (
          <button
            key={n}
            className={`botao ${n === "aprovado" || n === "aceito" || (n === "enviado" && orc.status !== "rascunho") ? "botao-primario" : ""} ${n === "perdido" ? "botao-perigo-texto" : ""}`}
            onClick={() => mudarStatus(n)}
          >
            {ROTULO_TRANSICAO[n]}
          </button>
        ))}
        <span className="espaco" />
        <div className="legenda">
          {Object.values(NAT).map((n) => (
            <span key={n.nome}>
              <i style={{ background: n.cor }} />
              {n.nome}
            </span>
          ))}
        </div>
      </div>

      <div className="corpo-editor">
        <div>
          {bloqueado && (
            <div className="info-bloco">
              Orçamento {STATUS[orc.status as Status].label.toLowerCase()}: bloqueado para edição.
              {orc.status === "enviado"
                ? " Para revisar, use “Voltar para rascunho”. A versão enviada fica no histórico."
                : ""}
            </div>
          )}
          {!podeEditar && !bloqueado && (
            <div className="info-bloco">Somente leitura: seu perfil não edita orçamentos.</div>
          )}
          <div className="tabela rolagem">
            <Itens
              orc={orc}
              v={v}
              settings={s}
              travado={travado}
              aoMudarItens={(itens: Item[]) => alterar({ itens })}
              aoAdicionar={() => setCatalogo(true)}
            />
          </div>
          <div className="cartao" style={{ marginTop: 16 }}>
            <div className="cartao-cabecalho">
              <h2>Premissas e escopo</h2>
              <span className="secundario">aparecem na proposta</span>
            </div>
            <div className="cartao-corpo">
              <textarea
                className="entrada"
                rows={5}
                placeholder="Escopo, fora de escopo, SLAs, reajuste, forma de pagamento…"
                value={orc.premissas}
                disabled={travado}
                onChange={(e) => alterar({ premissas: e.target.value })}
              />
            </div>
          </div>
        </div>
        <aside className="lateral">
          <div className="cartao">
            <div className="cartao-cabecalho">
              <h2>Dados</h2>
            </div>
            <div className="cartao-corpo grade-campos" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {campoTexto("projeto", "Projeto", "text", { gridColumn: "1/-1" })}
              <CampoCliente orc={orc} clientes={base.clientes ?? []} travado={travado} aoMudar={(m) => alterar(m)} />
              <label className="campo">
                <span className="rotulo-campo">Modelo</span>
                <select
                  className="entrada"
                  value={orc.modelo}
                  disabled={travado}
                  onChange={(e) => alterar({ modelo: e.target.value })}
                >
                  {Object.entries(MODELOS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {campoTexto("responsavel", "Responsável")}
              {campoTexto("validade", "Validade", "date")}
            </div>
          </div>
          <div className="cartao">
            <div className="cartao-cabecalho">
              <h2>Precificação</h2>
            </div>
            <div className="cartao-corpo grade-campos" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {veCustos && (
                <>
                  <label className="campo">
                    <span className="rotulo-campo">Modo de preço</span>
                    <select
                      className="entrada"
                      value={String(p.modoPreco ?? "margem")}
                      disabled={travado}
                      onChange={(e) => alterarParam("modoPreco", e.target.value)}
                    >
                      <option value="margem">Margem</option>
                      <option value="markup">Markup</option>
                    </select>
                  </label>
                  {campoPct("margem", p.modoPreco === "markup" ? "Markup %" : "Margem alvo %")}
                </>
              )}
              {campoPct("imposto", "Impostos %", 0.01)}
              {erroPreco && (
                <div className="erro-bloco" role="alert" style={{ gridColumn: "1/-1", margin: 0 }}>
                  {erroPreco.charAt(0).toUpperCase() + erroPreco.slice(1)}. As alterações não são salvas até corrigir.
                </div>
              )}
              {veCustos && campoPct("contingencia", "Contingência %")}
              {veCustos && (
                <label className="campo">
                  <span className="rotulo-campo">Dólar (R$)</span>
                  <input
                    className="entrada num"
                    type="number"
                    step={0.0001}
                    value={orc.cambio ?? 0}
                    disabled={travado}
                    onChange={(e) => alterar({ cambio: Number(e.target.value) })}
                  />
                </label>
              )}
              {campoNum("meses", "Prazo (meses)")}
              {campoNum("pedidosMes", "Pedidos / mês", 100)}
              {campoNum("gmvMes", "GMV / mês (R$)", 1000)}
              {campoNum("feeGmv", "Fee sobre GMV %", 0.1)}
            </div>
          </div>
          <div className="cartao">
            <div className="cartao-cabecalho">
              <h2>Resumo</h2>
            </div>
            <div className="cartao-corpo">
              {baixa && (
                <div className="erro-bloco">
                  Margem abaixo da mínima de {pct(min, 0)}. Para enviar ao cliente, passe por aprovação.
                </div>
              )}
              {veCustos && p.modoPreco === "markup" && orc.itens.length > 0 && (
                <div className="aviso-bloco">
                  Markup de {pct(p.margem, 0)} sobre o custo equivale a {pct(margem)} de margem real sobre o preço.
                </div>
              )}
              {!veCustos && (
                <p className="dica-campo" style={{ marginBottom: 8 }}>
                  Preços recalculados pelo servidor a cada alteração salva.
                </p>
              )}
              <div className="linha-resumo">
                <span>Setup (único)</span>
                <span>{brl(v.setup)}</span>
              </div>
              {v.temRecorrente && (
                <>
                  <div className="linha-resumo">
                    <span>Mensalidade</span>
                    <span>{brl(v.mensal)}</span>
                  </div>
                  {v.feeMes > 0 && (
                    <div className="linha-resumo">
                      <span style={{ paddingLeft: 12 }}>inclui fee de {num(p.feeGmv, 1)}% do GMV</span>
                      <span>{brl(v.feeMes)}</span>
                    </div>
                  )}
                </>
              )}
              {v.calculo && (
                <>
                  <div className="linha-resumo">
                    <span>Custo total</span>
                    <span>{brl(v.calculo.custoTotal)}</span>
                  </div>
                  <div className="linha-resumo">
                    <span>Impostos</span>
                    <span>{brl(v.calculo.impostoTotal)}</span>
                  </div>
                  <div className="linha-resumo">
                    <span>Lucro</span>
                    <span className={baixa ? "atraso" : "ok"}>{brl(v.calculo.lucro)}</span>
                  </div>
                  <div className="linha-resumo">
                    <span>Markup equivalente</span>
                    <span>{pct(v.calculo.markupEquiv)}</span>
                  </div>
                </>
              )}
              <div className="linha-resumo total">
                <span>{v.temRecorrente ? `Valor do contrato (${p.meses ?? 0} meses)` : "Valor total"}</span>
                <span>{brl(v.tcv)}</span>
              </div>
              {horasPorPapel.length > 0 && (
                <>
                  <div className="rotulo-campo" style={{ margin: "16px 0 4px" }}>
                    Horas por papel de custo
                  </div>
                  {horasPorPapel.map(([k, h]) => (
                    <div className="linha-resumo" key={k}>
                      <span>{k}</span>
                      <span>
                        {h.setup ? `${int(h.setup)} h` : ""}
                        {h.setup && h.mes ? " + " : ""}
                        {h.mes ? `${int(h.mes)} h/mês` : ""}
                      </span>
                    </div>
                  ))}
                  <div className="linha-resumo total">
                    <span>Implantação{v.horasMensais ? " / operação" : ""}</span>
                    <span>
                      {int(v.horasSetup)} h{v.horasMensais ? ` / ${int(v.horasMensais)} h/mês` : ""}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
      {painel && <Historico orc={orc} veCustos={veCustos} aoFechar={() => setPainel(false)} />}
      {catalogo && (
        <Catalogo base={base} veCustos={veCustos} aoEscolher={adicionarItem} aoFechar={() => setCatalogo(false)} />
      )}
      {texto.elemento}
    </>
  );
}

/** Cliente do orçamento: do cadastro (v2.1.0) ou, enquanto não ligado, o texto livre da v1. */
function CampoCliente({
  orc,
  clientes,
  travado,
  aoMudar,
}: {
  orc: Orcamento;
  clientes: Cliente[];
  travado: boolean;
  aoMudar: (m: Partial<Orcamento>) => void;
}) {
  const opcoes = clientes.filter((c) => c.situacao === "ativo" || c.id === orc.clienteId);
  const ligado = !!orc.clienteId;
  return (
    <label className="campo">
      <span className="rotulo-campo">Cliente</span>
      {clientes.length > 0 && (
        <select
          className="entrada"
          value={orc.clienteId ?? ""}
          disabled={travado}
          aria-label="Cliente do cadastro"
          onChange={(e) => {
            const c = clientes.find((x) => x.id === e.target.value);
            aoMudar(c ? { clienteId: c.id, cliente: c.nome } : { clienteId: null });
          }}
        >
          <option value="">Sem ligação (texto livre)</option>
          {opcoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.situacao === "inativo" ? " (inativo)" : ""}
            </option>
          ))}
        </select>
      )}
      {!ligado && (
        <input
          className="entrada"
          style={clientes.length ? { marginTop: 4 } : undefined}
          value={orc.cliente ?? ""}
          disabled={travado}
          placeholder="Nome do cliente"
          aria-label="Nome do cliente (texto livre)"
          onChange={(e) => aoMudar({ cliente: e.target.value })}
        />
      )}
    </label>
  );
}
