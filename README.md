# Orçamentos v2

Precificação de Projetos, Fullcommerce e Fulfillment · Infracommerce. Módulo da plataforma
(id `orcamentos`, prefixo no portal `/financeiro/orcamentos`).

**Estado:** v2.1.0 (cadastro de clientes, o cadastro mestre da plataforma). Vai para produção já em modo portal
(`AUTH_MODO=portal`), atrás do portal da plataforma: em produção, não cadastre usuários locais.

## Estrutura

```
package.json      versão, buildDate, engines 24.x, workspaces
compartilhado/    calc.ts (motor de cálculo, usado pelo api e pelo web) e testes
api/src/          servidor Fastify: rotas, regras (dominio.ts), permissões, visibilidade de custos
api/testes/       testes de API com PGlite em memória (inclui contrato e importação da v1.2.1)
db/               01_estrutura.sql e migracoes/ (02_clientes.sql); a identidade vem do kit
legado/           código da v1.2.1, referência dos testes de paridade e de contrato (não entra no pacote)
modulo.json       manifesto para o portal
```

## Rodar

```bash
npm install
cp .env.example .env         # ajuste ADMIN_EMAIL/ADMIN_SENHA ou MODO_TESTE=1
npm run dev                  # http://127.0.0.1:3333
npm test                     # cálculo, banco, API, permissões, contrato com a v1.2.1, telas
TESTE_PG=postgres://postgres@localhost:5432/postgres npm run test:pg   # os mesmos testes num PostgreSQL real
npm run typecheck && npm run lint && npm run formatacao
npm run dev:web              # tela com recarga automática em http://localhost:5173 (API na 3333)
npm run importar -- caminho/db.json
npm run empacotar            # dist-pacote/orcamentos-vX_Y_Z-AAAA-MM-DD.zip
npx tsx api/testes/gerar-db-v1.ts db.json   # db.json de exemplo gerado pela v1.2.1, para ensaiar a migração
```

## Pacote

O ZIP traz `server.js` (com o kit embutido), a tela em `public/`, `db/`, `iniciar.bat`/`iniciar.sh` (exigem Node 24)
e um `.env` para uso local com `MODO_TESTE=1`. Em nuvem (Railway), use só as variáveis do painel, com
`DATABASE_URL`, `NODE_ENV=production`, `ADMIN_EMAIL` e `ADMIN_SENHA`; o comando de início é `npm start`.

Para rodar ao lado da v1.2.1 no mesmo computador, use outra porta (`PORT=4333`).

## Kit da plataforma

Instalado direto do GitHub pela tag: `"plataforma-kit": "github:paulogtavares/plataforma-kit#v1.5.1"`. Para
atualizar: `npm install "plataforma-kit@github:paulogtavares/plataforma-kit#vX.Y.Z"` e conferir com
`node -p "require('./node_modules/plataforma-kit/package.json').version"` (trocar a tag no `package.json` não basta).
O `prepare` do kit compila o `dist/` na instalação. Precisa de acesso ao repositório só quem compila a partir do
código-fonte; o pacote de entrega já leva o kit compilado. Se o lockfile pedir SSH:
`git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"`.

## Clientes e outros módulos

- Importar do Cronogramas: Clientes → Importar do Cronogramas (arquivo JSON ou CSV com `id` e `nome`; prévia antes de
  gravar). Depois: Clientes → Revisar e ligar, para ligar os orçamentos ao cadastro.
- Leitura por outros módulos: `GET /api/interno/clientes` com `X-Plataforma-Token` de serviço emitido pelo portal
  (`emitirTokenServico({ origem, destino: "orcamentos", permissoes: ["orcamentos.clientes.ler"] })`). Resposta:
  `{ gerado_em, completo, clientes: [{ id, nome, documento, situacao, atualizado_em }] }`; `?desde=` para incremental.

## Regras de precificação

Iguais à v1.2.1: ver `compartilhado/calc.ts` e o histórico da v1 no `CHANGELOG.md`.
