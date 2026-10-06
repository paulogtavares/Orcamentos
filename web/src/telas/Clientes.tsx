/** Aba Clientes (v2.1.0): cadastro mestre, importação do Cronogramas com prévia e atalho para ligar orçamentos. */
import { Link2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Modal, useAvisos, useSessao } from "plataforma-kit/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cliente } from "../api";
import { Vazio } from "../componentes";
import { useAlteracao, useBase } from "../dados";
import { documento, ORIGEM_CLIENTE } from "../formato";
import type { Cliente } from "../tipos";
import { Pagina } from "./Pagina";

const filtro = { q: "", situacao: "ativo" as "ativo" | "inativo" | "todos" };

export function Clientes() {
  const b = useBase().data!;
  const { pode } = useSessao();
  const navegar = useNavigate();
  const gerenciar = pode("orcamentos.clientes.gerenciar");
  const [f, setF] = useState(filtro);
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null);
  const [importar, setImportar] = useState(false);
  const mudar = (x: Partial<typeof filtro>) => setF(Object.assign(filtro, x) && { ...filtro });

  const clientes = b.clientes ?? [];
  const contagem = new Map<string, number>();
  for (const o of b.orcamentos) if (o.clienteId) contagem.set(o.clienteId, (contagem.get(o.clienteId) ?? 0) + 1);
  const semLigacao = b.orcamentos.filter((o) => !o.clienteId && o.cliente?.trim()).length;
  const q = f.q.toLowerCase();
  const digitos = f.q.replace(/\D/g, "");
  const lista = clientes.filter(
    (c) =>
      (f.situacao === "todos" || c.situacao === f.situacao) &&
      (!q || c.nome.toLowerCase().includes(q) || (digitos.length >= 3 && c.documento?.includes(digitos))),
  );

  return (
    <Pagina
      acoes={
        gerenciar && (
          <>
            <button className="botao" onClick={() => setImportar(true)}>
              <Upload size={15} /> Importar do Cronogramas
            </button>
            <button
              className="botao botao-primario"
              onClick={() => setEditando({ nome: "", documento: "", situacao: "ativo" })}
            >
              <Plus size={15} /> Novo cliente
            </button>
          </>
        )
      }
      busca={
        <label className="busca">
          <Search size={15} />
          <input
            className="entrada"
            placeholder="Buscar por nome ou documento"
            value={f.q}
            onChange={(e) => mudar({ q: e.target.value })}
          />
        </label>
      }
    >
      {gerenciar && semLigacao > 0 && (
        <div className="aviso-bloco linha-inline" style={{ justifyContent: "space-between" }}>
          <span>
            {semLigacao} {semLigacao > 1 ? "orçamentos ainda têm" : "orçamento ainda tem"} o cliente só como texto, sem
            ligação com o cadastro.
          </span>
          <button className="botao botao-pequeno" onClick={() => navegar("/clientes/ligar")}>
            <Link2 size={15} /> Revisar e ligar
          </button>
        </div>
      )}
      <div className="barra-lista">
        <div className="segmentado" role="group" aria-label="Filtrar por situação">
          {(
            [
              ["ativo", "Ativos"],
              ["inativo", "Inativos"],
              ["todos", "Todos"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} aria-pressed={f.situacao === k} onClick={() => mudar({ situacao: k })}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {!clientes.length ? (
        <Vazio
          titulo="Nenhum cliente cadastrado"
          texto="Importe os clientes do Cronogramas (mantendo os mesmos ids) ou cadastre aqui. Depois, ligue os orçamentos ao cadastro."
        >
          {gerenciar && (
            <button className="botao botao-primario" onClick={() => setImportar(true)}>
              <Upload size={15} /> Importar do Cronogramas
            </button>
          )}
        </Vazio>
      ) : !lista.length ? (
        <Vazio titulo="Nada encontrado" texto="Nenhum cliente com esses filtros." />
      ) : (
        <div className="tabela rolagem">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Situação</th>
                <th className="dir">Orçamentos</th>
                <th>Origem</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr
                  key={c.id}
                  className={gerenciar ? "clicavel" : ""}
                  onClick={() => gerenciar && setEditando({ ...c })}
                >
                  <td className="forte">{c.nome}</td>
                  <td className="num">{documento(c.documento)}</td>
                  <td>
                    <span className={`selo ${c.situacao === "ativo" ? "selo-aceito" : "selo-rascunho"}`}>
                      {c.situacao === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="valor">{contagem.get(c.id) ?? 0}</td>
                  <td className="secundario">{ORIGEM_CLIENTE[c.origem] ?? c.origem}</td>
                  <td className="dir">{gerenciar && <Pencil size={15} className="apagado" aria-hidden />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <EditorCliente
          inicial={editando}
          orcamentos={editando.id ? (contagem.get(editando.id) ?? 0) : 0}
          aoFechar={() => setEditando(null)}
        />
      )}
      {importar && <ImportarClientes aoFechar={() => setImportar(false)} />}
    </Pagina>
  );
}

function EditorCliente({
  inicial,
  orcamentos,
  aoFechar,
}: {
  inicial: Partial<Cliente>;
  orcamentos: number;
  aoFechar: () => void;
}) {
  const avisos = useAvisos();
  const [c, setC] = useState(inicial);
  const salvar = useAlteracao(
    (corpo: Partial<Cliente>) =>
      c.id ? cliente.put(`/api/clientes/${c.id}`, corpo) : cliente.post("/api/clientes", corpo),
    "Cliente salvo",
  );
  const excluir = useAlteracao(() => cliente.delete(`/api/clientes/${c.id}`), "Cliente excluído");
  const doc = (c.documento ?? "").replace(/\D/g, "");
  const docInvalido = doc.length > 0 && doc.length !== 11 && doc.length !== 14;

  function enviar() {
    if (!c.nome?.trim()) return avisos.erro("Informe o nome do cliente.");
    salvar.mutate({ nome: c.nome.trim(), documento: doc || null, situacao: c.situacao }, { onSuccess: aoFechar });
  }
  async function confirmarExclusao() {
    if (
      await avisos.confirmar({
        titulo: "Excluir cliente",
        texto: `${c.nome} sai do cadastro.`,
        acao: "Excluir",
        perigo: true,
      })
    )
      excluir.mutate(undefined, { onSuccess: aoFechar });
  }
  return (
    <Modal titulo={c.id ? "Editar cliente" : "Novo cliente"} aoFechar={aoFechar} largura={520}>
      <label className="campo">
        <span className="rotulo-campo">Nome</span>
        <input
          className="entrada"
          autoFocus
          value={c.nome ?? ""}
          onChange={(e) => setC({ ...c, nome: e.target.value })}
        />
      </label>
      <div className="grade-campos" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="campo">
          <span className="rotulo-campo">CNPJ ou CPF (opcional)</span>
          <input
            className="entrada num"
            value={c.documento ?? ""}
            onChange={(e) => setC({ ...c, documento: e.target.value })}
            aria-invalid={docInvalido}
          />
          {docInvalido && <span className="dica-campo atraso">Informe 11 dígitos (CPF) ou 14 (CNPJ).</span>}
        </label>
        <label className="campo">
          <span className="rotulo-campo">Situação</span>
          <select
            className="entrada"
            value={c.situacao ?? "ativo"}
            onChange={(e) => setC({ ...c, situacao: e.target.value as Cliente["situacao"] })}
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
      </div>
      {c.id && (
        <p className="dica-campo">
          Mudar o nome atualiza os orçamentos ligados que ainda não foram enviados. Enviados, aceitos e perdidos mantêm
          o nome que o cliente viu.
        </p>
      )}
      <div className="acoes-modal">
        {c.id && (
          <button
            className="botao botao-perigo-texto esquerda"
            onClick={confirmarExclusao}
            disabled={orcamentos > 0}
            title={orcamentos > 0 ? "Tem orçamentos ligados: inative em vez de excluir" : undefined}
          >
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="botao botao-primario" disabled={salvar.isPending || docInvalido} onClick={enviar}>
          Salvar cliente
        </button>
      </div>
    </Modal>
  );
}

interface ItemPrevia {
  linha: { id: string; nome: string; documento: string | null; situacao: string };
  acao: "criar" | "atualizar" | "igual" | "unir";
  unirCom?: { id: string; nome: string; orcamentos: number; motivo: "documento" | "nome" };
  mudancas?: string[];
}
interface Previa {
  itens: ItemPrevia[];
  resumo: Record<"criar" | "atualizar" | "igual" | "unir", number>;
  erros: string[];
}
const ROTULO_ACAO = { criar: "Criar", atualizar: "Atualizar", igual: "Sem mudança", unir: "Unir" } as const;

/** Importação do arquivo exportado do Cronogramas: escolhe o arquivo, revisa a prévia e confirma. */
function ImportarClientes({ aoFechar }: { aoFechar: () => void }) {
  const avisos = useAvisos();
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const confirmar = useAlteracao(
    () =>
      cliente.post<{ resumo: Previa["resumo"] }>("/api/clientes/importacao", {
        conteudo: arquivo!.conteudo,
        arquivo: arquivo!.nome,
        confirmar: true,
      }),
    (r) =>
      `Importação concluída: ${r.resumo.criar} criados, ${r.resumo.atualizar} atualizados, ${r.resumo.unir} unidos`,
  );

  async function escolher(f: File | undefined) {
    if (!f) return;
    setLendo(true);
    setPrevia(null);
    try {
      const conteudo = await f.text();
      setArquivo({ nome: f.name, conteudo });
      setPrevia(await cliente.post<Previa>("/api/clientes/importacao", { conteudo, arquivo: f.name }));
    } catch (e) {
      avisos.erro(e);
    } finally {
      setLendo(false);
    }
  }
  const mudancas = previa ? previa.resumo.criar + previa.resumo.atualizar + previa.resumo.unir : 0;

  return (
    <Modal titulo="Importar clientes do Cronogramas" aoFechar={aoFechar} largura={880}>
      <p className="texto-apoio" style={{ margin: 0 }}>
        Arquivo exportado do Cronogramas, em JSON ou CSV, com <b>id</b> (o mesmo uuid de lá) e <b>nome</b>; documento e
        situação são opcionais. Os ids do Cronogramas são mantidos, porque os usuários externos já apontam para eles. Um
        cliente daqui com o mesmo documento ou o mesmo nome é unido ao do Cronogramas, e os orçamentos dele passam
        junto. Nada é gravado antes de você confirmar.
      </p>
      <label className="campo">
        <span className="rotulo-campo">Arquivo</span>
        <input
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
      </label>
      {lendo && <p className="texto-apoio">Lendo o arquivo…</p>}
      {previa && (
        <>
          <div className="linha-inline" role="status">
            <span className="selo selo-enviado">{previa.resumo.criar} a criar</span>
            <span className="selo selo-aprovado">{previa.resumo.atualizar} a atualizar</span>
            <span className="selo selo-em_aprovacao">{previa.resumo.unir} a unir</span>
            <span className="selo selo-rascunho">{previa.resumo.igual} sem mudança</span>
          </div>
          {previa.erros.length > 0 && (
            <div className="aviso-bloco">
              <b>{previa.erros.length} linha(s) com problema, que não entram como estão:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {previa.erros.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {previa.erros.length > 12 && <li>e mais {previa.erros.length - 12}…</li>}
              </ul>
            </div>
          )}
          <div className="tabela rolagem" style={{ maxHeight: 340 }}>
            <table>
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Cliente (Cronogramas)</th>
                  <th>Documento</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {previa.itens
                  .filter((i) => i.acao !== "igual")
                  .map((i) => (
                    <tr key={i.linha.id}>
                      <td className="forte">{ROTULO_ACAO[i.acao]}</td>
                      <td>
                        {i.linha.nome}
                        {i.linha.situacao === "inativo" && <span className="secundario"> (inativo)</span>}
                      </td>
                      <td className="num">{documento(i.linha.documento)}</td>
                      <td className="secundario">
                        {i.unirCom
                          ? `Une com "${i.unirCom.nome}" (mesmo ${i.unirCom.motivo}); ${i.unirCom.orcamentos} orçamento(s) passam junto`
                          : (i.mudancas ?? []).join("; ")}
                      </td>
                    </tr>
                  ))}
                {!mudancas && (
                  <tr>
                    <td colSpan={4} className="secundario" style={{ textAlign: "center", padding: 18 }}>
                      Tudo já está igual ao Cronogramas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="acoes-modal">
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          className="botao botao-primario"
          disabled={!previa || !mudancas || confirmar.isPending}
          onClick={() => confirmar.mutate(undefined, { onSuccess: aoFechar })}
        >
          Confirmar importação
        </button>
      </div>
    </Modal>
  );
}
