/** Restaurar backup: escolhe o arquivo, confirma e envia (o servidor guarda uma cópia antes). */
import type { Avisos } from "plataforma-kit/react";
import { cliente } from "../api";

export function restaurarBackup(avisos: Avisos, depois: () => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = ".json,application/json";
  entrada.onchange = async () => {
    const arquivo = entrada.files?.[0];
    if (!arquivo) return;
    const ok = await avisos.confirmar({
      titulo: "Restaurar backup",
      texto: `Todos os dados serão substituídos por ${arquivo.name}. A base atual é copiada antes, por segurança.`,
      acao: "Restaurar",
      perigo: true,
    });
    if (!ok) return;
    try {
      await cliente.post("/api/restore", JSON.parse(await arquivo.text()));
      avisos.avisar("Backup restaurado");
      depois();
    } catch (e) {
      avisos.erro(e instanceof SyntaxError ? "O arquivo não é um JSON válido." : e);
    }
  };
  entrada.click();
}
