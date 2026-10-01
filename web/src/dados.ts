/** Dados da tela com TanStack Query. A base inteira vem de /api/db (como na v1); alterações invalidam. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAvisos } from "plataforma-kit/react";
import { cliente } from "./api";
import type { Base } from "./tipos";

export const CHAVE_BASE = ["base"] as const;

export function useBase() {
  return useQuery({ queryKey: CHAVE_BASE, queryFn: () => cliente.get<Base>("/api/db"), staleTime: 10_000 });
}

/** Mutação que mostra o erro e recarrega a base no fim. */
export function useAlteracao<A, R = unknown>(fn: (a: A) => Promise<R>, ok?: string | ((r: R) => string)) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (ok) avisos.avisar(typeof ok === "function" ? ok(r) : ok);
    },
    onError: (e) => avisos.erro(e),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_BASE }),
  });
}
