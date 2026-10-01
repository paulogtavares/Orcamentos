/** Peças pequenas do Orçamentos (as genéricas vêm do kit: Modal, Campo, avisos e confirmação). */
import { STATUS, type Status } from "@orcamentos/compartilhado/calc";
import { Modal } from "plataforma-kit/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { NAT, pct, type Nat } from "./formato";

export const Selo = ({ status }: { status: string }) => (
  <span className={`selo selo-${status}`}>{(STATUS[status as Status] ?? STATUS.rascunho).label}</span>
);

export const ChipNat = ({ n }: { n: string }) => {
  const nat = NAT[(n as Nat) in NAT ? (n as Nat) : "setup"];
  return (
    <span className="chip-nat" style={{ "--cor": nat.cor } as React.CSSProperties}>
      <i />
      {nat.nome}
    </span>
  );
};

/** Barra de margem: cheia em 50%; marca a margem mínima. */
export function BarraMargem({
  margem,
  minima,
  larga,
  baixa,
}: {
  margem: number;
  minima?: number;
  larga?: boolean;
  baixa?: boolean;
}) {
  return (
    <span className={`barra-progresso ${larga ? "larga" : ""}`}>
      <i
        style={{
          width: `${Math.max(0, Math.min(100, margem * 200))}%`,
          ...(baixa ? { background: "var(--atraso)" } : {}),
        }}
      />
      {minima != null && <b style={{ left: `${minima * 200}%` }} title={`Margem mínima ${pct(minima, 0)}`} />}
    </span>
  );
}

export const Vazio = ({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) => (
  <div className="vazio">
    <strong>{titulo}</strong>
    {texto && <p>{texto}</p>}
    {children}
  </div>
);

export const Carregando = () => (
  <div className="pagina">
    <p className="texto-apoio">Carregando…</p>
  </div>
);

interface PedidoTexto {
  titulo: string;
  rotulo: string;
  inicial?: string;
  acao?: string;
  obrigatorio?: boolean;
}

/** Janela com uma caixa de texto (no lugar de prompt). pedir() resolve com o texto ou null. */
export function usePedirTexto() {
  const [pedido, setPedido] = useState<(PedidoTexto & { valor: string }) | null>(null);
  const resolver = useRef<(v: string | null) => void>(() => {});
  const pedir = useCallback(
    (p: PedidoTexto) =>
      new Promise<string | null>((res) => {
        resolver.current = res;
        setPedido({ ...p, valor: p.inicial ?? "" });
      }),
    [],
  );
  const fechar = (v: string | null) => {
    setPedido(null);
    resolver.current(v);
  };
  const elemento = pedido && (
    <Modal titulo={pedido.titulo} aoFechar={() => fechar(null)}>
      <label className="campo">
        <span className="rotulo-campo">{pedido.rotulo}</span>
        <textarea
          className="entrada"
          rows={3}
          autoFocus
          value={pedido.valor}
          onChange={(e) => setPedido({ ...pedido, valor: e.target.value })}
        />
      </label>
      <div className="acoes-modal">
        <button className="botao" onClick={() => fechar(null)}>
          Cancelar
        </button>
        <button
          className="botao botao-primario"
          disabled={pedido.obrigatorio && !pedido.valor.trim()}
          onClick={() => fechar(pedido.valor)}
        >
          {pedido.acao ?? "Salvar"}
        </button>
      </div>
    </Modal>
  );
  return { elemento, pedir };
}
