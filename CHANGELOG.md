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

### v2.0.0-beta.5 · validação com PostgreSQL 16 e Node 24

- Todos os testes rodam também num PostgreSQL real: `TESTE_PG=postgres://postgres@localhost:5432/postgres npm run test:pg`
  cria um banco novo para cada teste (e o apaga no fim). Conferido no PostgreSQL 16.15: os mesmos testes do PGlite
- Pacote conferido em modo produção (Node 24.21.0, `NODE_ENV=production`, `DATABASE_URL`): `MODO_TESTE` recusado com
  aviso, todos os objetos no schema `orcamentos` (nada em `public`), primeiro administrador por `ADMIN_EMAIL` com troca
  de senha obrigatória, reinício sem reaplicar nada, `importar.js` com um `db.json` da v1.2.1 (duas vezes, sem
  duplicar) e os mesmos valores de setup, mensalidade, TCV e margem em todos os orçamentos
- `api/testes/gerar-db-v1.ts`: gera um `db.json` de verdade com o servidor da v1.2.1, para ensaiar a migração

### v2.0.0-beta.4 · etapa 8: empacotamento

- `npm run empacotar` gera `dist-pacote/orcamentos-vX_Y_Z-AAAA-MM-DD.zip`: `server.js` compilado com esbuild (o
  plataforma-kit vai embutido, então o deploy não precisa de acesso ao GitHub), `importar.js`, tela do Vite em
  `public/`, `db/`, `modulo.json`, `node_modules` só com `pg` e PGlite (o PGlite carrega arquivos `.wasm` próprios)
- `iniciar.bat` e `iniciar.sh` exigem Node 24 e leem o `.env`; o `.env` do pacote é para uso local, com `MODO_TESTE=1`
- Migração da v1.2.1 pelo pacote: copie `data/db.json` para `dados/db.json` antes do primeiro início (ou rode
  `node --env-file-if-exists=.env importar.js caminho/db.json`)
- Conferido com Node 24.21.0: todos os testes passam e o pacote sobe pelo `iniciar.sh`, numa pasta limpa

### v2.0.0-beta.3 · etapa 7: modo embutido

- Dentro do iframe do portal (mesma origem) não há barra superior nem abas; a cada navegação o portal recebe
  `rota-alterada`, e quando a sessão expira com a tela aberta recebe `sessao-expirada`. O módulo obedece `navegar` e
  `tema` vindos do portal
- Conferido no navegador atrás de um proxy local em `/financeiro/orcamentos/` (com `X-Forwarded-Prefix`) e dentro
  de um iframe do mesmo domínio: login, abas, editor, recarregar a página, nenhuma requisição fora do prefixo
- **Pedido ao kit** (conversa do Cronogramas, dona do kit): no tema escuro o `.botao-primario` fica com texto branco
  sobre fundo claro, porque `--texto-invertido` só é definido para o tema claro. O Orçamentos tem um contorno
  marcado em `web/src/estilos.css`, restrito ao botão, a remover quando o kit corrigir

### v2.0.0-beta.2 · etapa 6: nomenclatura

- Os "perfis" da tabela de custos passam a se chamar **papéis de custo** na tela, nas mensagens e no código
  (tabela `papeis_custo`). "Perfil" fica só para o perfil de acesso (usuários e permissões)
- Nova rota `/api/papeis-custo`; `/api/perfis` continua funcionando igual (compatibilidade com a v1.2.1)
- O formato JSON do backup e do `db.json` não muda (`perfis`, `perfilId`, `perfilNome`): backups da v1.2.1 continuam
  restauráveis e backups da v2 abrem na v1.2.1

### v2.0.0-beta.1 · etapa 5: telas em React

- React 19, React Router 7, Vite 8 (`base: "./"`), TanStack Query e lucide-react, nas versões do Cronogramas
- Login, troca de senha, barra superior, sessão e tela de usuários e perfis vindos do kit; prefixo, `basename` e
  cliente de API do kit
- Rotas: `/` (lista), `/orcamentos/:id`, `/orcamentos/:id/proposta`, `/templates`, `/servicos`, `/custos`, `/usuarios`
- Editor com salvamento automático, grupos Setup / Mensal / Variável, histórico e versões, catálogo, confirmações e
  lista em cartões no celular, reproduzindo a v1.2.1
- Estilos com os tokens e as peças do kit (tema escuro incluído); só as cores das naturezas são do módulo
- A tela respeita as permissões: quem não vê custos não vê colunas de custo nem margem (o preço vem do servidor e é
  recalculado a cada salvamento); aprovar e devolver só para quem aprova; somente leitura para quem não edita
- Testes de tela (jsdom) para lista, editor e proposta por perfil

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
