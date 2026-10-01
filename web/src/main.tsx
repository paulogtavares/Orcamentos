import "plataforma-kit/tokens.css";
import "plataforma-kit/componentes.css";
import "./estilos.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProvedorAvisos, ProvedorSessao } from "plataforma-kit/react";
import { BASENAME } from "plataforma-kit/web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { cliente, embutido, EVENTO_SESSAO_EXPIRADA } from "./api";
import { App } from "./App";

const consultas = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
if (embutido.embutido) document.documentElement.classList.add("embutido");

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <QueryClientProvider client={consultas}>
        <ProvedorAvisos>
          <ProvedorSessao
            cliente={cliente}
            eventoSessaoExpirada={EVENTO_SESSAO_EXPIRADA}
            aoMudarUsuario={() => consultas.clear()}
          >
            <App />
          </ProvedorSessao>
        </ProvedorAvisos>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
