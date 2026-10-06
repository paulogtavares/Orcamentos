# Histórico de versões

## v2.1.0 · 2026-10-06 · cadastro de clientes

Cadastro mestre de clientes da plataforma (Plano 4: o Financeiro / Orçamentos é o dono do cadastro; o portal e os
outros módulos consultam).

### Atenção ao atualizar

- Migração `02_clientes` (aplicada sozinha no início): tabela `clientes`, `orcamentos.cliente_id`, chave estrangeira
  `usuarios.cliente_id → clientes` e o registro `importacoes_clientes`. Nada existente muda: todos os orçamentos
  continuam com o cliente como texto até serem ligados ao cadastro.
- Ordem sugerida: **1)** importar os clientes do Cronogramas; **2)** ligar os orçamentos (Clientes → Revisar e ligar).
- O Cronogramas precisa exportar os clientes (JSON ou CSV) com `id` (o uuid de lá) e `nome`; `documento` (ou
  `cnpj`/`cpf`) e situação (`situacao`, `status` ou `ativo`) são opcionais.

### Novidades

- **Clientes** no Financeiro: aba e tela com busca, filtro por situação, documento (CPF ou CNPJ, único) e quantidade
  de orçamentos; permissões `orcamentos.clientes.ver` e `orcamentos.clientes.gerenciar`; item no manifesto. Quem edita
  orçamentos lista os clientes para escolher. Cliente com orçamentos não pode ser excluído: inative
- **Importação do Cronogramas** com prévia (criar, atualizar, unir, sem mudança e linhas com problema) antes de gravar.
  Os ids do Cronogramas são mantidos, porque os usuários externos já apontam para eles. Um cliente daqui com o mesmo
  documento ou o mesmo nome é **unido** ao do Cronogramas: os orçamentos passam a apontar para o id de lá e o registro
  local sai. Reimportar o mesmo arquivo não muda nada
- **Ligação dos orçamentos ao cadastro**: os nomes escritos à mão são agrupados sem acentos, pontuação e sufixos
  (Ltda, S.A., ME…), com a sugestão do cadastro e o aviso de grupos parecidos (possíveis duplicados). Nada é ligado
  antes da revisão; escolher o mesmo destino junta os grupos
- O orçamento ganha `clienteId`; o texto `cliente` continua sendo o nome mostrado na proposta. Ligar ou renomear um
  cliente atualiza só os orçamentos **ainda não enviados**: enviados, aceitos e perdidos mantêm o nome que o cliente viu
- Editor e novo orçamento escolhem o cliente do cadastro (ou texto livre, enquanto o cliente não estiver cadastrado)
- **Rota interna** `GET /api/interno/clientes` para outros módulos (ex.: o Cronogramas), aceita **só** com token de
  serviço do portal com `orcamentos.clientes.ler` (kit 1.5.0); `?desde=<data ISO>` devolve só os alterados. Sem
  `SEGREDO_PLATAFORMA`, responde 503
- **Modo portal**: com `AUTH_MODO=portal`, o início não cria administrador local (`ADMIN_EMAIL`) nem usuários de teste
  (`MODO_TESTE`) e avisa no log que foram ignorados. Um usuário local com o mesmo e-mail de um usuário do portal faria
  o kit recusar o login dele (409)
- O backup passa a levar `clientes` e o `clienteId` dos orçamentos; backups da v1.2.1 e da v2.0.0 continuam restauráveis
- Perfil de teste "Financeiro" com `orcamentos.clientes.gerenciar`

## v2.0.0 · 2026-10-05 · equalização tecnológica

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

### v2.0.0 final

- **plataforma-kit 1.5.1** (`npm install "plataforma-kit@github:paulogtavares/plataforma-kit#v1.5.1"`, versão conferida
  em `node_modules`). Sai o contorno provisório do tema escuro: o kit corrigiu o botão primário (`--texto-sobre-tinta`).
  Contraste medido no navegador: 16,3:1 no claro, 15,2:1 no escuro do sistema e no escuro forçado pelo portal
- **Mudança de comportamento: margem + imposto ≥ 100% é recusado.** No modo margem, a soma de margem e imposto
  precisa ser menor que 100%; no modo markup, o imposto precisa ser menor que 100% (o markup pode passar de 100%).
  A API responde 400 com "Margem + imposto precisa ser menor que 100%." no orçamento, no template e nas regras de
  preço padrão; as telas mostram o aviso na hora e o editor não salva até corrigir. Na v1.2.1, 70% + 30% gerava preço
  astronômico (o cálculo faz 1 − 0,7 − 0,3 = 5,55e-17, não zero). A regra tem tolerância: 780 combinações digitadas que
  somam 100% (ex.: 0,15% + 99,85%) ficam um fio abaixo de 1 em ponto flutuante e também são recusadas. O motor de
  cálculo não mudou (paridade com a v1.2.1); orçamentos antigos com essa combinação continuam abrindo, e salvar
  exige corrigir a precificação
- **Publicação**: o Orçamentos vai para produção já em modo portal (decisão de 03/10/2026, Plano 4); sem validação
  isolada no Railway. Em produção, não cadastre usuários locais: o portal é o dono dos usuários
- `legado/` (código da v1.2.1) fica no repositório como referência dos testes de paridade e de contrato; não entra no
  pacote

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
- Com margem + imposto somando exatamente 100% (ex.: 70% + 30%), o ponto flutuante gerava um preço
  astronômico em vez de zero, como na v1.2.1. Resolvido na v2.0.0 final: a combinação passa a ser recusada

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
