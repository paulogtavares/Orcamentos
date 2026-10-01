/**
 * Gera um db.json de verdade com o servidor da v1.2.1 (legado/), para ensaiar a migração à mão:
 *   npx tsx api/testes/gerar-db-v1.ts caminho/db.json
 */
import { writeFileSync } from "node:fs";
import { popularV1, servidorV1 } from "./v1.js";

const destino = process.argv[2] ?? "db-v1.json";
const v1 = await servidorV1(3990);
try {
  await popularV1(v1);
  writeFileSync(destino, JSON.stringify(v1.lerDb(), null, 2));
  console.log(`db.json da v1.2.1 gravado em ${destino}`);
} finally {
  v1.parar();
}
