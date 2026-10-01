/** Aba Orçamentos: resumo, filtros e tabela (cartões no celular). */
import { STATUS } from "@orcamentos/compartilhado/calc";
import { Search, Plus } from "lucide-react";
import { useSessao } from "plataforma-kit/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { BarraMargem, Selo, Vazio } from "../componentes";
import { useBase } from "../dados";
import { brl, data, hoje, MODELOS, pct } from "../formato";
import { NovoOrcamento } from "./NovoOrcamento";
import { Pagina } from "./Pagina";

const filtro = { status: "todos", modelo: "todos", q: "" }; // mantido entre visitas, como na v1

export function Lista() {
  const b = useBase().data!;
  const { pode } = useSessao();
  const navegar = useNavigate();
  const [f, setF] = useState(filtro);
  const [novo, setNovo] = useState<string | null>(null);
  const mudar = (x: Partial<typeof filtro>) => setF(Object.assign(filtro, x) && { ...filtro });
  const veCustos = pode("orcamentos.custos.ver");
  const podeEditar = pode("orcamentos.editar");
  const min = b.settings.margemMinima ?? 0;

  const os = b.orcamentos;
  const soma = (l: typeof os) => l.reduce((s, o) => s + (o.resumo?.tcv || 0), 0);
  const abertos = os.filter((o) => ["rascunho", "em_aprovacao", "aprovado", "enviado"].includes(o.status));
  const aceitos = os.filter((o) => o.status === "aceito");
  const perdidos = os.filter((o) => o.status === "perdido");
  const validos = os.filter((o) => o.status !== "perdido" && (o.resumo?.tcv ?? 0) > 0);
  const margem = soma(validos)
    ? validos.reduce((s, o) => s + (o.resumo.margemReal ?? 0) * (o.resumo.tcv ?? 0), 0) / soma(validos)
    : 0;
  const conv = aceitos.length + perdidos.length ? aceitos.length / (aceitos.length + perdidos.length) : null;
  const aprov = os.filter((o) => o.status === "em_aprovacao").length;

  const q = f.q.toLowerCase();
  const lista = os.filter(
    (o) =>
      (f.status === "todos" || o.status === f.status) &&
      (f.modelo === "todos" || o.modelo === f.modelo) &&
      (!q || `${o.numero} ${o.cliente} ${o.projeto} ${o.responsavel}`.toLowerCase().includes(q)),
  );

  const botaoNovo = podeEditar && (
    <button className="botao botao-primario" onClick={() => setNovo("")}>
      <Plus size={15} /> Novo orçamento
    </button>
  );

  return (
    <Pagina
      acoes={
        <>
          <button className="botao" onClick={() => navegar("/templates")}>
            Ver templates
          </button>
          {botaoNovo}
        </>
      }
      busca={
        <label className="busca">
          <Search size={15} />
          <input
            className="entrada"
            placeholder="Buscar por cliente, projeto, número ou responsável"
            value={f.q}
            onChange={(e) => mudar({ q: e.target.value })}
          />
        </label>
      }
    >
      {os.length > 0 && (
        <div className="faixa-resumo metricas">
          <div className="metrica">
            <span className="rotulo">Em aberto</span>
            <span className="v">
              {brl(soma(abertos))} <small>{abertos.length} orçamentos</small>
            </span>
          </div>
          <div className="metrica">
            <span className="rotulo">Aceitos</span>
            <span className="v">
              {brl(soma(aceitos))} <small>{aceitos.length}</small>
            </span>
          </div>
          {veCustos && (
            <div className="metrica">
              <span className="rotulo">Margem média</span>
              <span className="v">
                <BarraMargem margem={margem} minima={min} larga />
                {pct(margem)}
              </span>
            </div>
          )}
          <div className="metrica">
            <span className="rotulo">Aguardando aprovação</span>
            <span className={`v ${aprov ? "atraso" : ""}`}>{aprov}</span>
          </div>
          <div className="metrica">
            <span className="rotulo">Conversão</span>
            <span className="v">
              {conv === null ? "—" : pct(conv, 0)}{" "}
              <small>
                {aceitos.length} aceitos, {perdidos.length} perdidos
              </small>
            </span>
          </div>
        </div>
      )}
      <div className="barra-lista">
        <div className="segmentado" role="group" aria-label="Filtrar por status">
          <button aria-pressed={f.status === "todos"} onClick={() => mudar({ status: "todos" })}>
            Todos
          </button>
          {Object.entries(STATUS).map(([k, s]) => (
            <button key={k} aria-pressed={f.status === k} onClick={() => mudar({ status: k })}>
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="entrada"
          style={{ width: "auto" }}
          value={f.modelo}
          onChange={(e) => mudar({ modelo: e.target.value })}
          aria-label="Modelo"
        >
          <option value="todos">Todos os modelos</option>
          {Object.entries(MODELOS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div id="tabela-orc">
        {!os.length ? (
          <Vazio
            titulo="Nenhum orçamento ainda"
            texto="Comece por um template: a tabela de custos e as horas já vêm preenchidas."
          >
            {botaoNovo}
          </Vazio>
        ) : !lista.length ? (
          <Vazio titulo="Nada encontrado" texto="Nenhum orçamento com esses filtros." />
        ) : (
          <div className="tabela rolagem">
            <table>
              <thead>
                <tr>
                  <th>Orçamento</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th className="dir">Setup</th>
                  <th className="dir">Mensalidade</th>
                  <th className="dir">Valor do contrato</th>
                  {veCustos && <th>Margem</th>}
                  <th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => {
                  const r = o.resumo || {};
                  const baixa = !!o.itens?.length && (r.margemReal ?? 0) < min;
                  const vencido = !!o.validade && o.validade < hoje() && !["aceito", "perdido"].includes(o.status);
                  return (
                    <tr key={o.id} className="clicavel" onClick={() => navegar(`/orcamentos/${o.id}`)}>
                      <td>
                        <div className="forte">{o.projeto}</div>
                        <div className="secundario">
                          {o.numero} · {MODELOS[o.modelo] ?? o.modelo}
                        </div>
                      </td>
                      <td data-rot="Cliente">{o.cliente}</td>
                      <td data-rot="Status">
                        <Selo status={o.status} />
                      </td>
                      <td className="valor" data-rot="Setup">
                        {brl(r.setup)}
                      </td>
                      <td className="valor" data-rot="Mensalidade">
                        {r.mensal ? brl(r.mensal) : <span className="secundario">—</span>}
                      </td>
                      <td className="valor forte" data-rot="Valor do contrato">
                        {brl(r.tcv)}
                      </td>
                      {veCustos && (
                        <td data-rot="Margem">
                          <div className="linha-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <BarraMargem margem={r.margemReal ?? 0} baixa={baixa} />
                            <span className={`num ${baixa ? "atraso forte" : ""}`}>{pct(r.margemReal)}</span>
                          </div>
                        </td>
                      )}
                      <td className={vencido ? "atraso" : ""} style={{ whiteSpace: "nowrap" }} data-rot="Validade">
                        {data(o.validade)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {novo !== null && <NovoOrcamento templateId={novo} aoFechar={() => setNovo(null)} />}
    </Pagina>
  );
}
