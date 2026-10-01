/**
 * Casca do Orçamentos: login e troca de senha (kit), barra superior (kit, some no iframe), rotas e modo embutido.
 * Rotas: / (lista), /orcamentos/:id, /orcamentos/:id/proposta, /templates, /servicos, /custos, /usuarios.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Casca,
  TelaLogin,
  TelaTrocaSenha,
  TelaUsuarios,
  useSessao,
  type ItemMenuUsuario,
  type StatusLogin,
} from "plataforma-kit/react";
import { aplicarTema } from "plataforma-kit/web";
import { useEffect } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { cliente, embutido } from "./api";
import { Carregando } from "./componentes";
import { num } from "./formato";
import { useBase } from "./dados";
import { Custos } from "./telas/Custos";
import { Editor } from "./telas/Editor";
import { Lista } from "./telas/Lista";
import { Proposta } from "./telas/Proposta";
import { Servicos } from "./telas/Servicos";
import { Templates } from "./telas/Templates";
import { restaurarBackup } from "./telas/backup";
import { useAvisos } from "plataforma-kit/react";

export const Marca = () => (
  <span className="marca-simbolo" aria-hidden="true">
    <i style={{ background: "#2f6bdb", width: 16 }} />
    <i style={{ background: "#13968a", width: 20, marginLeft: 6 }} />
    <i style={{ background: "#e08a00", width: 12, marginLeft: 3 }} />
  </span>
);

function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => cliente.get<StatusLogin & { version: string; buildDate: string }>("/api/status"),
    staleTime: Infinity,
  });
}

/** Avisa o portal a cada navegação e obedece "navegar" e "tema" vindos dele. */
function useModoEmbutido() {
  const local = useLocation();
  const navegar = useNavigate();
  useEffect(() => {
    if (embutido.embutido) embutido.avisarRotaAlterada(local.pathname + local.search, window.location.href);
  }, [local.pathname, local.search]);
  useEffect(
    () => embutido.ouvirPortal({ navegar: (caminho) => navegar(caminho), tema: (t) => aplicarTema(t) }),
    [navegar],
  );
}

function alternarTema() {
  const raiz = document.documentElement;
  const atual = raiz.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const novo = atual === "dark" ? "light" : "dark";
  raiz.dataset.theme = novo;
  try {
    localStorage.setItem("orcamentos-tema", novo);
  } catch {}
}
try {
  const t = localStorage.getItem("orcamentos-tema");
  if (t) document.documentElement.dataset.theme = t;
} catch {}

export function App() {
  const { usuario, carregando } = useSessao();
  const status = useStatus();
  useModoEmbutido();
  if (carregando) return null;
  if (!usuario)
    return (
      <TelaLogin
        subtitulo="Orçamentos de Projetos, Fullcommerce e Fulfillment"
        marca={<Marca />}
        status={status.data ?? null}
      />
    );
  if (usuario.precisa_trocar_senha) return <TelaTrocaSenha />;
  return <Logado versao={status.data?.version ?? ""} data={status.data?.buildDate ?? ""} />;
}

function Logado({ versao, data }: { versao: string; data: string }) {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const base = useBase();
  const navegar = useNavigate();
  const veCustos = pode("orcamentos.custos.ver");

  const itensMenu: ItemMenuUsuario[] = [
    { rotulo: "Usuários e perfis", caminho: "/usuarios", somenteAdministrador: true },
    ...(pode("orcamentos.backup")
      ? [
          { rotulo: "Baixar backup (JSON)", aoClicar: () => (window.location.href = "api/backup") },
          {
            rotulo: "Restaurar backup",
            aoClicar: () => restaurarBackup(avisos, () => base.refetch().then(() => navegar("/"))),
          },
        ]
      : []),
    { rotulo: "Alternar tema claro / escuro", aoClicar: alternarTema },
  ];

  const usd = base.data?.settings.cambio?.usd;
  return (
    <>
      <Casca
        nome="Orçamentos"
        versao={versao}
        data={data}
        marca={<Marca />}
        itensMenu={itensMenu}
        acoes={
          veCustos && usd ? (
            <NavLink className="botao-topo" to="/custos" title="Dólar de referência para novos orçamentos">
              <small>US$</small> <span className="num">{num(usd, 4)}</span>
            </NavLink>
          ) : null
        }
      />
      {!base.data ? (
        base.error ? (
          <div className="pagina">
            <div className="vazio">
              <strong>Não foi possível carregar os orçamentos</strong>
              <p>{String((base.error as Error).message)}</p>
            </div>
          </div>
        ) : (
          <Carregando />
        )
      ) : (
        <Routes>
          <Route path="/" element={<Lista />} />
          <Route path="/orcamentos/:id" element={<Editor />} />
          <Route path="/orcamentos/:id/proposta" element={<Proposta />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/servicos" element={veCustos ? <Servicos /> : <Navigate to="/" replace />} />
          <Route path="/custos" element={veCustos ? <Custos /> : <Navigate to="/" replace />} />
          <Route path="/usuarios" element={<TelaUsuarios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </>
  );
}
