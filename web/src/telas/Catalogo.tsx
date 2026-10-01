/** Janela "Adicionar item": catálogo de serviços por área, com busca. */
import { Search } from "lucide-react";
import { Modal } from "plataforma-kit/react";
import { useState } from "react";
import { ChipNat } from "../componentes";
import { COBRANCA, num, simboloMoeda } from "../formato";
import type { Base, Servico } from "../tipos";

export function Catalogo({
  base,
  veCustos,
  aoEscolher,
  aoFechar,
}: {
  base: Base;
  veCustos: boolean;
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const [q, setQ] = useState("");
  const areas = [...new Set(base.servicos.map((s) => s.area))];
  const descricao = (s: Servico) => {
    if (!veCustos)
      return s.tipoCobranca === "hora"
        ? "por hora"
        : s.tipoCobranca === "percentual"
          ? "% do GMV"
          : `por ${s.unidade ?? ""}`;
    if (s.tipoCobranca === "hora") {
      const papel = base.perfis.find((p) => p.id === s.perfilId);
      return papel ? `${simboloMoeda(papel.moeda)} ${num(papel.custoHora)}/h, ${papel.nome}` : "papel de custo ausente";
    }
    if (s.tipoCobranca === "percentual") return `${num(s.custoUnit)}% do GMV`;
    return `${simboloMoeda(s.moeda)} ${num(s.custoUnit)} por ${s.unidade ?? ""}`;
  };
  const busca = q.toLowerCase();
  const visivel = (s: Servico) => `${s.nome} ${s.area} ${s.grupo ?? ""}`.toLowerCase().includes(busca);
  return (
    <Modal titulo="Adicionar item" aoFechar={aoFechar} largura={880}>
      <label className="busca" style={{ width: "100%" }}>
        <Search size={15} />
        <input
          className="entrada"
          autoFocus
          placeholder="Buscar serviço, área ou grupo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {areas.map((a) => {
          const servicos = base.servicos.filter((s) => s.area === a && visivel(s));
          if (!servicos.length) return null;
          return (
            <div key={a} style={{ display: "contents" }}>
              <div className="grupo-catalogo">{a}</div>
              {servicos.map((s) => (
                <button key={s.id} className="item-catalogo" onClick={() => aoEscolher(s.id)}>
                  <span style={{ flex: 1 }}>
                    <span className="forte">{s.nome}</span>
                    <br />
                    <span className="secundario">
                      {COBRANCA[s.tipoCobranca]}, {descricao(s)}
                    </span>
                  </span>
                  <ChipNat n={s.natureza} />
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
