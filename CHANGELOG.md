# Histórico de versões

## v2.0.0 (em andamento) · equalização tecnológica

Reescrita na stack padrão da plataforma (Node 24, TypeScript, Fastify 5, PostgreSQL, React 19),
mantendo as mesmas regras de cálculo e as mesmas rotas de API. Plano 2 do documento
"Plano de equalização tecnológica".

### Atenção ao atualizar

- **Login**: o login básico (`APP_USER` / `APP_PASS`) foi substituído pelo login da plataforma
  (cookie `orc_sessao`). Se as variáveis existirem, o servidor avisa no log que foram ignoradas.
  Crie o primeiro administrador com `ADMIN_EMAIL` e `ADMIN_SENHA`.
- **Dados**: saem do `data/db.json` e vão para o schema `orcamentos` do PostgreSQL (nuvem) ou do
  PGlite em `DADOS_DIR/banco` (local). No primeiro início, se houver `db.json` na pasta de dados,
  ele é importado automaticamente e **não é alterado**. Guarde o `db.json` original até conferir os
  valores. Também dá para importar à mão: `npm run importar -- caminho/db.json` (pode repetir, não duplica).
- **`DATA_DIR`** virou **`DADOS_DIR`** (o nome antigo ainda funciona nesta versão, com aviso).
- **Produção** (`NODE_ENV=production`) exige `DATABASE_URL`.
- **Erros da API** agora vêm como `{ erro, codigo }` (antes `{ error }`); o código aparece também no log.

### v2.0.0-alpha.5 · etapa 4 concluída: identidade e administração do kit

- plataforma-kit **1.4.0** instalado direto do GitHub (`github:paulogtavares/plataforma-kit#v1.4.0`)
- Tabelas de identidade (`perfis`, `usuarios`, `sessoes`) pelo `identidade.sql` do kit, no schema `orcamentos`,
  com o migrador do kit em modo schema; um teste confirma que são idênticas às do kit. Sai o SQL provisório
- Rotas de administração de usuários e perfis do kit (`/api/admin/*`, só administrador)
- O primeiro administrador criado por `ADMIN_EMAIL`/`ADMIN_SENHA` troca a senha no primeiro acesso

### v2.0.0-alpha.4 · etapa 4 (servidor): login e permissões

- Permissões `orcamentos.ver`, `.editar`, `.aprovar`, `.custos.ver`, `.custos.gerenciar`,
  `.templates.gerenciar`, `.backup`, validadas em cada rota do servidor
- Aprovar ou devolver um orçamento em aprovação exige `orcamentos.aprovar`
- Sem `orcamentos.custos.ver`, a API não entrega custos, margens nem a política de preço: entrega o
  preço de cada linha já calculado. Uma edição feita por quem não vê custos nunca altera os custos,
  a margem nem o câmbio gravados
- Histórico, aprovação e versões gravam o usuário logado
- Primeiro administrador por `ADMIN_EMAIL` / `ADMIN_SENHA`; usuários de teste só com `MODO_TESTE=1`;
  sem modo de teste, quem ainda entra com a senha de teste é bloqueado em produção

### v2.0.0-alpha.3 · etapa 2: servidor

- Fastify 5 com a base do kit: cabeçalhos de segurança, iframe só do mesmo domínio,
  `/api/status`, `/api/saude`, `/modulo.json`, prefixo por `X-Forwarded-Prefix` ou `BASE_PATH`
- Mesmas rotas da v1.2.1, validadas com zod, cada alteração numa transação
- Sem `Access-Control-Allow-Origin: *`; a PTAX continua buscada pelo servidor
- Teste de contrato: a mesma sequência de chamadas na v1.2.1 e na v2 produz os mesmos orçamentos

### v2.0.0-alpha.2 · etapa 3: banco de dados

- Schema `orcamentos` (nada em `public`), migrador do kit, `search_path = orcamentos, public`
- Importador do `db.json` sem perda (campos desconhecidos guardados em `extras`) e reexecutável
- Backup e restauração no mesmo formato JSON de antes; antes de restaurar, a base atual é guardada
  em `copias_seguranca`; numeração dos orçamentos pela sequência do banco

### v2.0.0-alpha.1 · etapa 1: cálculo

- `compartilhado/calc.ts`: tradução fiel do `calc.js`, com os testes da planilha H Stern,
  paridade exata com o original em 5.000 orçamentos e casos de borda
- **Pendência de decisão**: com margem + imposto somando exatamente 100% (ex.: 70% + 30%), o
  ponto flutuante gera um preço astronômico em vez de zero. Comportamento herdado da v1.2.1,
  mantido e documentado em teste até decisão

### v2.0.0-alpha.0 · etapa 0: marco inicial

- Workspaces `api`, `web`, `compartilhado`; Node 24; ESLint e Prettier do kit; v1.2.1 em `legado/`

## v1.2.1 · 2026-09-25

- A composição da squad não aparece mais na proposta (o cliente vê só **Squad Dev** com o total de horas e o valor)

## v1.2.0 · 2026-09-25

- GP calculado em % das horas (Dedicado, Compartilhado ou Personalizado)

## v1.1.0 · 2026-09-25

- Novo layout no padrão da plataforma Cronogramas

## v1.0.0 · 2026-09-25

- Primeira versão
