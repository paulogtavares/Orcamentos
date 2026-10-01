/** Painel lateral: versões congeladas e atividade. */
import { X } from "lucide-react";
import { useEffect } from "react";
import { brl, data, dataHora, pct } from "../formato";
import type { Orcamento } from "../tipos";

export function Historico({ orc, veCustos, aoFechar }: { orc: Orcamento; veCustos: boolean; aoFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <aside className="painel" aria-label="Histórico">
      <div className="painel-cabecalho">
        <h2>Histórico</h2>
        <button className="botao-icone" onClick={aoFechar} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      <div className="painel-corpo">
        {orc.versoes.length > 0 && (
          <>
            <div className="rotulo-campo" style={{ marginBottom: 6 }}>
              Versões congeladas
            </div>
            <div className="tabela" style={{ marginBottom: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Versão</th>
                    <th>Data</th>
                    <th className="dir">Contrato</th>
                    {veCustos && <th className="dir">Margem</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...orc.versoes].reverse().map((v) => (
                    <tr key={v.v}>
                      <td className="forte">v{v.v}</td>
                      <td>{data(v.data)}</td>
                      <td className="valor">{brl(v.resumo.tcv)}</td>
                      {veCustos && <td className="valor">{pct(v.resumo.margemReal)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="rotulo-campo">Atividade</div>
        {[...orc.historico].reverse().map((h, i) => (
          <div className="evento" key={i}>
            <time>
              {dataHora(h.data)}
              {h.por ? ` · ${h.por}` : ""}
            </time>
            {h.acao}
          </div>
        ))}
      </div>
    </aside>
  );
}
