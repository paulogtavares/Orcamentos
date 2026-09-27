/** Versão e data do pacote, lidas do package.json da raiz (fonte única, como no Cronogramas). */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function lerVersao(): { versao: string; data: string } {
  const aqui = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(aqui, "package.json"), join(aqui, "..", "..", "package.json")]) {
    if (!existsSync(p)) continue;
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    if (pkg.name === "orcamentos") return { versao: pkg.version, data: pkg.buildDate ?? "—" };
  }
  return { versao: "0.0.0", data: "—" };
}
