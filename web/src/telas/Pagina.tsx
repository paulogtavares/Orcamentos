/** Página principal com abas (layout do Cronogramas, como na v1.2.1). Dentro do iframe as abas somem. */
import { useSessao } from "plataforma-kit/react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { embutido } from "../api";
import { useBase } from "../dados";

export function Pagina({ acoes, busca, children }: { acoes?: ReactNode; busca?: ReactNode; children: ReactNode }) {
  const { pode } = useSessao();
  const b = useBase().data!;
  const veCustos = pode("orcamentos.custos.ver");
  const abas = [
    { para: "/", rotulo: "Orçamentos", n: b.orcamentos.length },
    ...(pode("orcamentos.clientes.ver") || pode("orcamentos.clientes.gerenciar")
      ? [{ para: "/clientes", rotulo: "Clientes", n: b.clientes?.length ?? 0 }]
      : []),
    { para: "/templates", rotulo: "Templates", n: b.templates.length },
    ...(veCustos
      ? [
          { para: "/servicos", rotulo: "Serviços", n: b.servicos.length },
          { para: "/custos", rotulo: "Custos e parâmetros", n: b.perfis.length },
        ]
      : []),
  ];
  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <h1 className="titulo-pagina">Orçamentos</h1>
        <div className="linha-inline">{acoes}</div>
      </div>
      {(!embutido.embutido || busca) && (
        <div className="barra-abas">
          {!embutido.embutido && (
            <nav className="abas" aria-label="Seções">
              {abas.map((a) => (
                <NavLink key={a.para} to={a.para} end className="aba">
                  {a.rotulo}
                  <span className="contador">{a.n}</span>
                </NavLink>
              ))}
            </nav>
          )}
          {busca}
        </div>
      )}
      {children}
    </div>
  );
}
