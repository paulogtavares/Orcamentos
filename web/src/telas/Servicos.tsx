/** Aba Serviços: catálogo por área e editor em janela. */
import { NATUREZAS } from "@orcamentos/compartilhado/calc";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal, useAvisos, useSessao } from "plataforma-kit/react";
import { useState } from "react";
import { cliente } from "../api";
import { ChipNat } from "../componentes";
import { useAlteracao, useBase } from "../dados";
import { COBRANCA, NAT, num, simboloMoeda } from "../formato";
import type { Servico } from "../tipos";
import { Pagina } from "./Pagina";

export function Servicos() {
  const b = useBase().data!;
  const { pode } = useSessao();
  const gerenciar = pode("orcamentos.custos.gerenciar");
  const [editando, setEditando] = useState<Partial<Servico> | null>(null);
  const areas = [...new Set(b.servicos.map((s) => s.area))];
  const custo = (s: Servico) => {
    if (s.tipoCobranca === "hora") {
      const papel = b.perfis.find((p) => p.id === s.perfilId);
      return papel ? (
        `${simboloMoeda(papel.moeda)} ${num(papel.custoHora)}/h`
      ) : (
        <span className="atraso">papel de custo ausente</span>
      );
    }
    if (s.tipoCobranca === "percentual") return `${num(s.custoUnit)}% do GMV`;
    return `${simboloMoeda(s.moeda)} ${num(s.custoUnit)} por ${s.unidade ?? ""}`;
  };
  return (
    <Pagina
      acoes={
        gerenciar && (
          <button
            className="botao botao-primario"
            onClick={() =>
              setEditando({
                nome: "",
                area: "Tecnologia",
                grupo: "",
                tipoCobranca: "hora",
                natureza: "setup",
                perfilId: b.perfis[0]?.id,
                custoUnit: 0,
                unidade: "unidade",
                moeda: "BRL",
              })
            }
          >
            <Plus size={15} /> Novo serviço
          </button>
        )
      }
    >
      <p className="texto-apoio" style={{ marginBottom: 12 }}>
        Tudo o que pode entrar num orçamento. Itens por hora usam o custo do papel na tabela de custos.
      </p>
      <div className="tabela rolagem">
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Cobrança</th>
              <th>Natureza padrão</th>
              <th className="dir">Custo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {areas.flatMap((a) => {
              const servicos = b.servicos.filter((s) => s.area === a);
              return [
                <tr key={`a-${a}`} className="nivel-1">
                  <td colSpan={5}>
                    {a} <span className="secundario">· {servicos.length}</span>
                  </td>
                </tr>,
                ...servicos.map((s) => {
                  const papel = b.perfis.find((p) => p.id === s.perfilId);
                  return (
                    <tr
                      key={s.id}
                      className={gerenciar ? "clicavel" : ""}
                      onClick={() => gerenciar && setEditando({ ...s })}
                    >
                      <td style={{ paddingLeft: 28 }}>
                        <div className="forte">{s.nome}</div>
                        <div className="secundario">
                          {s.grupo ? <span className="etiqueta">{s.grupo}</span> : null} {papel?.nome ?? ""}
                        </div>
                      </td>
                      <td>{COBRANCA[s.tipoCobranca]}</td>
                      <td>
                        <ChipNat n={s.natureza} />
                      </td>
                      <td className="valor">{custo(s)}</td>
                      <td className="dir">{gerenciar && <Pencil size={15} className="apagado" aria-hidden />}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      {editando && <EditorServico inicial={editando} aoFechar={() => setEditando(null)} />}
    </Pagina>
  );
}

function EditorServico({ inicial, aoFechar }: { inicial: Partial<Servico>; aoFechar: () => void }) {
  const b = useBase().data!;
  const avisos = useAvisos();
  const [s, setS] = useState(inicial);
  const areas = [...new Set([...b.servicos.map((x) => x.area), "Tecnologia", "Operação", "Logística", "Gestão"])];
  const salvar = useAlteracao(
    (corpo: Partial<Servico>) =>
      s.id ? cliente.put(`/api/servicos/${s.id}`, corpo) : cliente.post("/api/servicos", corpo),
    "Serviço salvo",
  );
  const excluir = useAlteracao(() => cliente.delete(`/api/servicos/${s.id}`), "Serviço excluído");
  const t = s.tipoCobranca;

  function enviar() {
    const corpo: Partial<Servico> = {
      nome: (s.nome ?? "").trim(),
      area: (s.area ?? "").trim() || "Geral",
      grupo: (s.grupo ?? "").trim(),
      tipoCobranca: t,
      natureza: s.natureza,
    };
    if (!corpo.nome) return avisos.erro("Informe o nome do serviço.");
    if (t === "hora") Object.assign(corpo, { perfilId: s.perfilId, unidade: "hora" });
    else
      Object.assign(corpo, {
        custoUnit: Number(s.custoUnit) || 0,
        moeda: t === "percentual" ? "BRL" : s.moeda,
        unidade: t === "percentual" ? "% GMV" : (s.unidade ?? "").trim() || "unidade",
        perfilId: null,
      });
    salvar.mutate(corpo, { onSuccess: aoFechar });
  }
  async function confirmarExclusao() {
    if (
      await avisos.confirmar({
        titulo: "Excluir serviço",
        texto: "O serviço sai do catálogo. Orçamentos existentes mantêm os itens já adicionados.",
        acao: "Excluir",
        perigo: true,
      })
    )
      excluir.mutate(undefined, { onSuccess: aoFechar });
  }
  const texto = (k: "nome" | "grupo" | "unidade", rotulo: string, ph = "") => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada"
        placeholder={ph}
        value={s[k] ?? ""}
        onChange={(e) => setS({ ...s, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <Modal titulo={s.id ? "Editar serviço" : "Novo serviço"} aoFechar={aoFechar} largura={560}>
      {texto("nome", "Nome")}
      <div className="grade-campos" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="campo">
          <span className="rotulo-campo">Área</span>
          <input
            className="entrada"
            list="areas-servico"
            value={s.area ?? ""}
            onChange={(e) => setS({ ...s, area: e.target.value })}
          />
          <datalist id="areas-servico">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        {texto("grupo", "Grupo (opcional)", "Ex.: Squad Dev")}
        <label className="campo">
          <span className="rotulo-campo">Cobrança</span>
          <select
            className="entrada"
            value={t}
            onChange={(e) => setS({ ...s, tipoCobranca: e.target.value as Servico["tipoCobranca"] })}
          >
            {Object.entries(COBRANCA).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="rotulo-campo">Natureza padrão</span>
          <select
            className="entrada"
            value={s.natureza}
            onChange={(e) => setS({ ...s, natureza: e.target.value as Servico["natureza"] })}
          >
            {NATUREZAS.map((n) => (
              <option key={n} value={n}>
                {NAT[n].nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {t === "hora" ? (
        <label className="campo">
          <span className="rotulo-campo">Papel de custo (custo por hora)</span>
          <select
            className="entrada"
            value={s.perfilId ?? ""}
            onChange={(e) => setS({ ...s, perfilId: e.target.value })}
          >
            {b.perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}, {simboloMoeda(p.moeda)} {num(p.custoHora)}/h
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="grade-campos" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="campo">
            <span className="rotulo-campo">
              {t === "percentual" ? "Custo (% do GMV)" : t === "fixo" ? "Valor fixo" : "Custo unitário"}
            </span>
            <input
              className="entrada num"
              type="number"
              step={0.01}
              value={Number(s.custoUnit ?? 0)}
              onChange={(e) => setS({ ...s, custoUnit: Number(e.target.value) })}
            />
          </label>
          {t !== "percentual" && (
            <>
              <label className="campo">
                <span className="rotulo-campo">Moeda</span>
                <select
                  className="entrada"
                  value={s.moeda ?? "BRL"}
                  onChange={(e) => setS({ ...s, moeda: e.target.value as "BRL" | "USD" })}
                >
                  <option>BRL</option>
                  <option>USD</option>
                </select>
              </label>
              {texto("unidade", "Unidade", "pedido, item, pallet, mês")}
            </>
          )}
        </div>
      )}
      <div className="acoes-modal">
        {s.id && (
          <button className="botao botao-perigo-texto esquerda" onClick={confirmarExclusao}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="botao botao-primario" disabled={salvar.isPending} onClick={enviar}>
          Salvar serviço
        </button>
      </div>
    </Modal>
  );
}
