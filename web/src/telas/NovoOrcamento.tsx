/** Janela "Novo orçamento": a partir de um template ou em branco. */
import { Modal, useAvisos } from "plataforma-kit/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cliente } from "../api";
import { useAlteracao, useBase } from "../dados";
import { MODELOS } from "../formato";
import type { Orcamento } from "../tipos";

export function NovoOrcamento({ templateId, aoFechar }: { templateId?: string; aoFechar: () => void }) {
  const b = useBase().data!;
  const navegar = useNavigate();
  const avisos = useAvisos();
  const temTemplates = b.templates.length > 0;
  const clientesAtivos = (b.clientes ?? []).filter((c) => c.situacao === "ativo");
  const [d, setD] = useState({
    projeto: "",
    cliente: "",
    clienteId: "",
    responsavel: "",
    inicio: temTemplates ? "tpl" : "branco",
    templateId: templateId || b.templates[0]?.id || "",
    modelo: "projeto",
  });
  const criar = useAlteracao(() =>
    cliente.post<Orcamento>("/api/orcamentos", {
      projeto: d.projeto.trim(),
      cliente: d.cliente.trim(),
      responsavel: d.responsavel.trim(),
      templateId: d.inicio === "tpl" ? d.templateId : "",
      modelo: d.modelo,
    }),
  );
  const enviar = () =>
    criar.mutate(undefined, {
      onSuccess: (o) => {
        aoFechar();
        avisos.avisar(`${o.numero} criado`);
        navegar(`/orcamentos/${o.id}`);
      },
    });
  const campo = (k: keyof typeof d, rotulo: string, ph: string) => (
    <label className="campo">
      <span className="rotulo-campo">{rotulo}</span>
      <input className="entrada" placeholder={ph} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal titulo="Novo orçamento" aoFechar={aoFechar} largura={560}>
      {campo("projeto", "Projeto", "Ex.: Lume – Filial")}
      <div className="grade-campos">
        {clientesAtivos.length > 0 ? (
          <label className="campo">
            <span className="rotulo-campo">Cliente</span>
            <select className="entrada" value={d.clienteId} onChange={(e) => setD({ ...d, clienteId: e.target.value })}>
              <option value="">Fora do cadastro (texto livre)</option>
              {clientesAtivos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {!d.clienteId && (
              <input
                className="entrada"
                style={{ marginTop: 4 }}
                placeholder="Ex.: H Stern"
                value={d.cliente}
                onChange={(e) => setD({ ...d, cliente: e.target.value })}
                aria-label="Nome do cliente (texto livre)"
              />
            )}
          </label>
        ) : (
          campo("cliente", "Cliente", "Ex.: H Stern")
        )}
        {campo("responsavel", "Responsável", "Quem monta a proposta")}
      </div>
      <div className="campo">
        <span className="rotulo-campo">Como começar</span>
        <label className="opcao-cartao">
          <input
            type="radio"
            name="inicio"
            checked={d.inicio === "tpl"}
            disabled={!temTemplates}
            onChange={() => setD({ ...d, inicio: "tpl" })}
          />
          <span>
            <strong>A partir de um template</strong>
            <small>
              Copia itens, horas e parâmetros de preço. O custo e o dólar vigentes ficam congelados no orçamento.
            </small>
          </span>
        </label>
        <label className="opcao-cartao">
          <input
            type="radio"
            name="inicio"
            checked={d.inicio === "branco"}
            onChange={() => setD({ ...d, inicio: "branco" })}
          />
          <span>
            <strong>Em branco</strong>
            <small>Sem itens. Você adiciona do catálogo de serviços.</small>
          </span>
        </label>
      </div>
      {d.inicio === "tpl" ? (
        <label className="campo">
          <span className="rotulo-campo">Template</span>
          <select className="entrada" value={d.templateId} onChange={(e) => setD({ ...d, templateId: e.target.value })}>
            {b.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({MODELOS[t.modelo] ?? t.modelo})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="campo">
          <span className="rotulo-campo">Modelo de operação</span>
          <select className="entrada" value={d.modelo} onChange={(e) => setD({ ...d, modelo: e.target.value })}>
            {Object.entries(MODELOS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="acoes-modal">
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="botao botao-primario" disabled={criar.isPending} onClick={enviar}>
          Criar orçamento
        </button>
      </div>
    </Modal>
  );
}
