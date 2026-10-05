/** Aba Custos e parâmetros: papéis de custo, dólar e regras de preço. */
import { Plus, Trash2 } from "lucide-react";
import { useAvisos, useSessao } from "plataforma-kit/react";
import { validarPrecificacao } from "@orcamentos/compartilhado/calc";
import { useState } from "react";
import { cliente } from "../api";
import { usePedirTexto } from "../componentes";
import { useAlteracao, useBase } from "../dados";
import { brl, data } from "../formato";
import type { PapelCusto, Parametros } from "../tipos";
import { Pagina } from "./Pagina";

export function Custos() {
  const b = useBase().data!;
  const { pode } = useSessao();
  const avisos = useAvisos();
  const texto = usePedirTexto();
  const gerenciar = pode("orcamentos.custos.gerenciar");
  const s = b.settings;
  const fx = s.cambio.usd;

  const alterarPapel = useAlteracao(
    ({ id, ...corpo }: Partial<PapelCusto> & { id: string }) => cliente.put(`/api/papeis-custo/${id}`, corpo),
    "Tabela de custos atualizada",
  );
  const criarPapel = useAlteracao(
    (nome: string) => cliente.post("/api/papeis-custo", { nome, categoria: "Geral", moeda: "BRL", custoHora: 0 }),
    "Papel de custo criado. Informe o custo por hora.",
  );
  const excluirPapel = useAlteracao(
    (id: string) => cliente.delete(`/api/papeis-custo/${id}`),
    "Papel de custo excluído",
  );
  const salvarParametros = useAlteracao(
    (corpo: Partial<Parametros>) => cliente.put("/api/settings", corpo),
    "Parâmetros salvos",
  );
  const ptax = useAlteracao(
    () => cliente.post<{ usd: number }>("/api/cambio/ptax"),
    (r) => `PTAX: R$ ${r.usd.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}`,
  );

  const [dolar, setDolar] = useState(fx);
  const [regras, setRegras] = useState({
    margemAlvo: +((s.margemAlvo ?? 0) * 100).toFixed(2),
    margemMinima: +((s.margemMinima ?? 0) * 100).toFixed(2),
    impostoPadrao: +((s.impostoPadrao ?? 0) * 100).toFixed(2),
    contingenciaPadrao: +((s.contingenciaPadrao ?? 0) * 100).toFixed(2),
    modoPrecoPadrao: s.modoPrecoPadrao ?? "margem",
    validadeDias: s.validadeDias ?? 30,
    gpDedicadoPct: s.gpDedicadoPct ?? 25,
    gpCompartilhadoPct: s.gpCompartilhadoPct ?? 10,
    empresa: s.empresa ?? "",
  });

  async function novoPapel() {
    const nome = await texto.pedir({
      titulo: "Novo papel de custo",
      rotulo: "Nome do papel",
      acao: "Criar papel",
      obrigatorio: true,
    });
    if (nome) criarPapel.mutate(nome.trim());
  }
  async function confirmarExclusao(p: PapelCusto) {
    if (
      await avisos.confirmar({
        titulo: "Excluir papel de custo",
        texto: `${p.nome} sai da tabela de custos.`,
        acao: "Excluir",
        perigo: true,
      })
    )
      excluirPapel.mutate(p.id);
  }
  const erroPreco = validarPrecificacao({
    modoPreco: regras.modoPrecoPadrao,
    margem: regras.margemAlvo / 100,
    imposto: regras.impostoPadrao / 100,
  });
  const salvarRegras = () =>
    salvarParametros.mutate({
      margemAlvo: regras.margemAlvo / 100,
      margemMinima: regras.margemMinima / 100,
      impostoPadrao: regras.impostoPadrao / 100,
      contingenciaPadrao: regras.contingenciaPadrao / 100,
      modoPrecoPadrao: regras.modoPrecoPadrao as Parametros["modoPrecoPadrao"],
      validadeDias: Number(regras.validadeDias),
      gpDedicadoPct: Number(regras.gpDedicadoPct),
      gpCompartilhadoPct: Number(regras.gpCompartilhadoPct),
      empresa: regras.empresa,
    });
  const campoRegra = (k: keyof typeof regras, rotulo: string, passo = 1) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input
        className="entrada num"
        type="number"
        step={passo}
        disabled={!gerenciar}
        value={regras[k]}
        onChange={(e) => setRegras({ ...regras, [k]: Number(e.target.value) })}
      />
    </label>
  );
  const celulaPapel = (p: PapelCusto, k: "nome" | "categoria", estilo: React.CSSProperties) => (
    <input
      className="celula"
      style={estilo}
      defaultValue={p[k]}
      disabled={!gerenciar}
      aria-label={k === "nome" ? "Nome do papel" : "Categoria"}
      onBlur={(e) => e.target.value !== p[k] && alterarPapel.mutate({ id: p.id, [k]: e.target.value })}
    />
  );

  return (
    <Pagina
      acoes={
        gerenciar && (
          <button className="botao botao-primario" onClick={novoPapel}>
            <Plus size={15} /> Novo papel de custo
          </button>
        )
      }
    >
      <div className="corpo-editor" style={{ padding: 0 }}>
        <div>
          <div className="tabela rolagem">
            <table>
              <thead>
                <tr>
                  <th>Papel de custo</th>
                  <th>Categoria</th>
                  <th>Moeda</th>
                  <th className="dir">Custo / hora</th>
                  <th className="dir">Em reais</th>
                  <th>Ativo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.perfis.map((p) => (
                  <tr key={`${p.id}-${p.custoHora}-${p.moeda}`}>
                    <td>{celulaPapel(p, "nome", { textAlign: "left", fontWeight: 600, minWidth: 170 })}</td>
                    <td>{celulaPapel(p, "categoria", { textAlign: "left", minWidth: 110 })}</td>
                    <td>
                      <select
                        className="celula"
                        value={p.moeda}
                        disabled={!gerenciar}
                        aria-label="Moeda"
                        onChange={(e) => alterarPapel.mutate({ id: p.id, moeda: e.target.value as "BRL" | "USD" })}
                      >
                        <option>BRL</option>
                        <option>USD</option>
                      </select>
                    </td>
                    <td className="dir">
                      <input
                        className="celula"
                        style={{ width: 96 }}
                        type="number"
                        step={0.01}
                        defaultValue={p.custoHora}
                        disabled={!gerenciar}
                        aria-label="Custo por hora"
                        onBlur={(e) =>
                          Number(e.target.value) !== p.custoHora &&
                          alterarPapel.mutate({ id: p.id, custoHora: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="valor">{brl(p.custoHora * (p.moeda === "USD" ? fx : 1))}</td>
                    <td>
                      <input
                        type="checkbox"
                        style={{ accentColor: "var(--tinta)", width: 16, height: 16 }}
                        checked={p.ativo !== false}
                        disabled={!gerenciar}
                        aria-label="Ativo"
                        onChange={(e) => alterarPapel.mutate({ id: p.id, ativo: e.target.checked })}
                      />
                    </td>
                    <td>
                      {gerenciar && (
                        <button
                          className="botao-icone"
                          onClick={() => confirmarExclusao(p)}
                          aria-label={`Excluir ${p.nome}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dica-campo" style={{ marginTop: 8 }}>
            Mudanças valem para novos orçamentos. Os existentes mantêm o custo congelado até alguém usar “Atualizar
            custos”.
          </p>
        </div>
        <aside>
          <div className="cartao">
            <div className="cartao-cabecalho">
              <h2>Dólar</h2>
              <span className="secundario">
                {s.cambio.fonte}, {data(s.cambio.atualizadoEm)}
              </span>
            </div>
            <div className="cartao-corpo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="campo">
                <span className="rotulo-campo">Cotação (R$)</span>
                <input
                  className="entrada num"
                  type="number"
                  step={0.0001}
                  disabled={!gerenciar}
                  value={dolar}
                  onChange={(e) => setDolar(Number(e.target.value))}
                />
              </label>
              {gerenciar && (
                <div className="linha-inline">
                  <button
                    className="botao"
                    onClick={() =>
                      salvarParametros.mutate({
                        cambio: { usd: dolar, fonte: "manual", atualizadoEm: new Date().toISOString() },
                      })
                    }
                  >
                    Salvar valor
                  </button>
                  <button
                    className="botao botao-primario"
                    disabled={ptax.isPending}
                    onClick={() => ptax.mutate(undefined, { onSuccess: (r) => setDolar(r.usd) })}
                  >
                    Buscar PTAX
                  </button>
                </div>
              )}
              <p className="dica-campo">
                Papéis de custo em USD (squad LATAM) usam esta cotação. Cada orçamento congela o dólar do dia em que foi
                criado.
              </p>
            </div>
          </div>
          <div className="cartao">
            <div className="cartao-cabecalho">
              <h2>Regras de preço</h2>
            </div>
            <div className="cartao-corpo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="grade-campos" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {campoRegra("margemAlvo", "Margem alvo %", 0.5)}
                {campoRegra("margemMinima", "Margem mínima %", 0.5)}
                {campoRegra("impostoPadrao", "Impostos padrão %", 0.01)}
                {campoRegra("contingenciaPadrao", "Contingência %", 0.5)}
                <label className="campo">
                  <span className="rotulo-campo">Modo padrão</span>
                  <select
                    className="entrada"
                    disabled={!gerenciar}
                    value={regras.modoPrecoPadrao}
                    onChange={(e) => setRegras({ ...regras, modoPrecoPadrao: e.target.value as "margem" })}
                  >
                    <option value="margem">Margem</option>
                    <option value="markup">Markup</option>
                  </select>
                </label>
                {campoRegra("validadeDias", "Validade (dias)")}
                {campoRegra("gpDedicadoPct", "GP dedicado %", 0.5)}
                {campoRegra("gpCompartilhadoPct", "GP compartilhado %", 0.5)}
                <p className="dica-campo" style={{ gridColumn: "1/-1" }}>
                  Percentual aplicado sobre a soma das horas da mesma natureza (ex.: 510 h de setup × 25% = 127,5 h de
                  GP). Use “Atualizar custos” para aplicar em orçamentos existentes.
                </p>
                <label className="campo" style={{ gridColumn: "1/-1" }}>
                  <span className="rotulo-campo">Empresa na proposta</span>
                  <input
                    className="entrada"
                    disabled={!gerenciar}
                    value={regras.empresa}
                    onChange={(e) => setRegras({ ...regras, empresa: e.target.value })}
                  />
                </label>
              </div>
              {erroPreco && (
                <div className="erro-bloco" role="alert" style={{ margin: 0 }}>
                  Margem alvo e impostos padrão: {erroPreco}.
                </div>
              )}
              {gerenciar && (
                <div>
                  <button
                    className="botao botao-primario"
                    disabled={salvarParametros.isPending || !!erroPreco}
                    onClick={salvarRegras}
                  >
                    Salvar regras
                  </button>
                </div>
              )}
              <p className="dica-campo">
                Abaixo da margem mínima, o orçamento só vai ao cliente depois de aprovado. Confirme a alíquota com o
                fiscal.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {texto.elemento}
    </Pagina>
  );
}
