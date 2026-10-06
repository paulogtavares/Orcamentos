/**
 * Antes de passar para AUTH_MODO=portal: remove os usuários criados no modo local (com senha própria).
 *   node remover-usuarios-locais.js              → só lista
 *   node remover-usuarios-locais.js --confirmar  → remove
 * No modo portal, um usuário local com o mesmo e-mail de alguém do portal faz o login dessa pessoa ser recusado (409).
 * Orçamentos, histórico e clientes não mudam (guardam o autor sem chave estrangeira); as sessões saem junto.
 */
import { join } from "node:path";
import { lerAmbienteOrcamentos } from "./ambiente.js";
import { abrirBanco } from "./banco.js";
import { prepararBanco } from "./migracoes.js";
import { removerUsuariosLocais, usuariosLocais } from "./pessoas.js";

const confirmar = process.argv.includes("--confirmar");
const amb = lerAmbienteOrcamentos();
const conexao = await abrirBanco({
  databaseUrl: amb.databaseUrl,
  dadosDir: amb.dadosDir ?? join(process.cwd(), "dados"),
});
try {
  await prepararBanco(conexao, () => {});
  const locais = await usuariosLocais(conexao.banco);
  if (!locais.length) console.log(`Nenhum usuário local em ${conexao.descricao}. Nada a fazer.`);
  else if (!confirmar) {
    console.log(`${locais.length} usuário(s) local(is) em ${conexao.descricao}:\n  ${locais.join("\n  ")}`);
    console.log("Para remover: node remover-usuarios-locais.js --confirmar");
  } else
    console.log(
      `Removido(s) ${await removerUsuariosLocais(conexao.banco)} usuário(s) local(is) de ${conexao.descricao}.`,
    );
} finally {
  await conexao.fechar();
}
