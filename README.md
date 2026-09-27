# Orçamentos v2

Precificação de Projetos, Fullcommerce e Fulfillment · Infracommerce. Módulo da plataforma
(id `orcamentos`, prefixo no portal `/financeiro/orcamentos`).

**Estado:** em equalização (v2.0.0-alpha). Servidor, banco, login e permissões prontos; a tela em React
(etapa 5) depende do plataforma-kit 1.3.0. A v1.2.1 continua sendo a versão em uso.

## Estrutura

```
package.json      versão, buildDate, engines 24.x, workspaces
compartilhado/    calc.ts (motor de cálculo, usado pelo api e pelo web) e testes
api/src/          servidor Fastify: rotas, regras (dominio.ts), permissões, visibilidade de custos
api/testes/       testes de API com PGlite em memória (inclui contrato e importação da v1.2.1)
db/               00_identidade.provisorio.sql, 01_estrutura.sql, migracoes/
legado/           código da v1.2.1, só para os testes de paridade (sai na v2.0.0 final)
modulo.json       manifesto para o portal
```

## Rodar

```bash
npm install
cp .env.example .env         # ajuste ADMIN_EMAIL/ADMIN_SENHA ou MODO_TESTE=1
npm run dev                  # http://127.0.0.1:3333
npm test                     # cálculo, banco, API, permissões, contrato com a v1.2.1
npm run typecheck && npm run lint && npm run formatacao
npm run importar -- caminho/db.json
```

Para rodar ao lado da v1.2.1 no mesmo computador, use outra porta (`PORT=4333`).

## Kit da plataforma

Durante o desenvolvimento, o kit é instalado do pacote local `../plataforma-kit-1.2.0.tgz`
(gerado com `npm pack` na pasta do kit). Na versão final, a dependência volta a ser
`github:infracommerce/plataforma-kit#<tag>`.

## Regras de precificação

Iguais à v1.2.1: ver `compartilhado/calc.ts` e o histórico da v1 no `CHANGELOG.md`.
