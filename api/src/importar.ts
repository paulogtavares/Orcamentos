/**
 * Importa um db.json da v1.2.1 para o banco configurado (DATABASE_URL ou DADOS_DIR).
 *   npm run importar -- caminho/para/db.json
 * Pode rodar mais de uma vez sem duplicar. O arquivo não é alterado.
 */
import { join } from "node:path";
import { lerAmbienteOrcamentos } from "./ambiente.js";
import { abrirBanco } from "./banco.js";
import { importarBase, lerArquivoBase } from "./dados/importador.js";
import { prepararBanco } from "./migracoes.js";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npm run importar -- caminho/para/db.json");
  process.exit(1);
}
const amb = lerAmbienteOrcamentos();
const conexao = await abrirBanco({
  databaseUrl: amb.databaseUrl,
  dadosDir: amb.dadosDir ?? join(process.cwd(), "dados"),
});
try {
  await prepararBanco(conexao, console.log);
  const base = lerArquivoBase(arquivo);
  const r = await conexao.banco.tx(null, (t) => importarBase(t.query, base, { log: console.log }));
  console.log(`Importado para ${conexao.descricao}:`, r);
} finally {
  await conexao.fechar();
}
