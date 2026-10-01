/**
 * Cliente de API e modo embutido (kit). Dentro do iframe do portal a casca some, as mudanças de rota
 * são avisadas (rota-alterada) e o 401 vira aviso de sessão expirada para o portal decidir.
 */
import { criarClienteApi, criarEmbutido } from "plataforma-kit/web";

export const MODULO = "orcamentos";
export const EVENTO_SESSAO_EXPIRADA = "orcamentos:sessao-expirada";

export const embutido = criarEmbutido({ modulo: MODULO });

export const cliente = criarClienteApi({
  aoExpirarSessao: () => {
    if (embutido.embutido) embutido.avisarSessaoExpirada();
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  },
});
