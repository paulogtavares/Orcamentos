/**
 * Gera o pacote de entrega do Orçamentos: dist-pacote/orcamentos-vX_Y_Z-AAAA-MM-DD.zip
 *
 *   orcamentos/
 *     server.js        servidor compilado (esbuild), com o plataforma-kit embutido: o deploy não precisa do GitHub
 *     importar.js      importa um db.json da v1.2.1: node --env-file-if-exists=.env importar.js caminho/db.json
 *     public/          tela compilada (Vite)
 *     db/              estrutura e migrações (SQL legível)
 *     modulo.json      manifesto para o portal
 *     package.json     versão, buildDate, engines 24.x e as duas dependências que não entram no server.js
 *     node_modules/    pg e PGlite (o PGlite carrega arquivos .wasm próprios, por isso fica fora do server.js)
 *     .env             uso local, com MODO_TESTE=1 (em nuvem as variáveis vêm do painel)
 *     iniciar.bat / iniciar.sh, README.md, CHANGELOG.md
 *
 * Uso: npm run empacotar
 */
import { execSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const saida = join(raiz, "dist-pacote");
const pasta = join(saida, "orcamentos");
const passo = (m) => console.log(`\n> ${m}`);
const rodar = (cmd, cwd = raiz) => execSync(cmd, { cwd, stdio: "inherit" });

/** versão exata instalada de um pacote (vai fixa no package.json do pacote) */
const versaoDe = (nome) => JSON.parse(readFileSync(join(raiz, "node_modules", nome, "package.json"), "utf8")).version;
const EXTERNOS = ["pg", "@electric-sql/pglite"];

rmSync(saida, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

passo("tela (Vite)");
rodar("npm run build -w web");
cpSync(join(raiz, "web", "dist", "public"), join(pasta, "public"), { recursive: true });

passo("servidor (esbuild)");
for (const [entrada, arquivo] of [
  ["api/src/principal.ts", "server.js"],
  ["api/src/importar.ts", "importar.js"],
]) {
  await build({
    entryPoints: [join(raiz, entrada)],
    outfile: join(pasta, arquivo),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: [...EXTERNOS, "pg-native"],
    legalComments: "none",
    logLevel: "warning",
    // dependências CommonJS empacotadas num arquivo ESM precisam de require
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
}

passo("arquivos do pacote");
cpSync(join(raiz, "db"), join(pasta, "db"), { recursive: true });
for (const a of ["modulo.json", "CHANGELOG.md", "README.md"]) cpSync(join(raiz, a), join(pasta, a));
cpSync(join(raiz, "empacotar", "env.pacote"), join(pasta, ".env"));
cpSync(join(raiz, "empacotar", "iniciar.bat"), join(pasta, "iniciar.bat"));
cpSync(join(raiz, "empacotar", "iniciar.sh"), join(pasta, "iniciar.sh"));
chmodSync(join(pasta, "iniciar.sh"), 0o755);
writeFileSync(
  join(pasta, "package.json"),
  JSON.stringify(
    {
      name: "orcamentos",
      version: pkg.version,
      buildDate: pkg.buildDate,
      description: pkg.description,
      private: true,
      type: "module",
      engines: { node: "24.x" },
      scripts: { start: "node server.js", importar: "node importar.js" },
      dependencies: Object.fromEntries(EXTERNOS.map((n) => [n, versaoDe(n)])),
      license: "UNLICENSED",
    },
    null,
    2,
  ) + "\n",
);

passo("dependências do pacote (pg e PGlite)");
rodar("npm install --omit=dev --no-audit --no-fund --loglevel=error", pasta);

passo("ZIP");
const nome = `orcamentos-v${pkg.version.replace(/\./g, "_")}-${pkg.buildDate}.zip`;
if (!existsSync(join(pasta, "server.js"))) throw new Error("server.js não foi gerado");
rodar(`zip -qr ${nome} orcamentos`, saida);
console.log(`\nPacote pronto: dist-pacote/${nome}`);
