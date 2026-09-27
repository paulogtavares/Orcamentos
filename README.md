# Orçamentos

Plataforma de precificação de Projetos, Fullcommerce e Fulfillment — Infracommerce.

Versão deste pacote: **v1.2.1** · 2026-09-25

Arquitetura do **C.P · Controle Projetos** (Node.js puro, sem dependências, sem `npm install`) com o layout da plataforma **Cronogramas** (tema claro/escuro, Figtree, abas, barra superior escura). O que mudou em cada versão está no `CHANGELOG.md`.

---

## Estrutura

| Arquivo | Função |
|---|---|
| `server.js` | Servidor HTTP nativo, rotas da API, persistência em JSON, PTAX |
| `calc.js` | Motor de cálculo compartilhado (servidor + navegador) — fonte única da verdade |
| `index.html` | Interface: abas Orçamentos, Templates, Serviços e Custos; editor; proposta |
| `CHANGELOG.md` | Histórico de versões |
| `test.js` | Testes do cálculo (reproduz a planilha H Stern) e da API |
| `data/db.json` | Banco de dados (criado na primeira execução, **não versionar**) |
| `iniciar.bat` / `iniciar.sh` | Atalhos para rodar localmente |

---

## Rodar localmente

**Windows:** duplo clique em `iniciar.bat`
**Mac/Linux:** `./iniciar.sh` ou `node server.js`
Acesse: http://localhost:3333 (3131 é o C.P e 3232 o Cronogramas: os três rodam juntos)

Na primeira execução o banco é criado com a tabela de custos da planilha e 3 templates de exemplo.

Testes: `npm test`

---

## Versionamento

Igual ao C.P — a versão fica no `package.json`:

```json
{ "version": "1.0.0", "buildDate": "2026-09-25" }
```

| Tipo de mudança | O que incrementar | Exemplo |
|---|---|---|
| Correção de bug pequeno | Patch | 1.0.0 → 1.0.1 |
| Nova funcionalidade | Minor | 1.0.0 → 1.1.0 |
| Reescrita / mudança grande | Major | 1.0.0 → 2.0.0 |

```bash
git add .
git commit -m "v1.1.0 - descricao clara do que mudou"
git push
```

A versão aparece no topo da plataforma, ao lado do nome (ex.: `v1.2.1 · 25/09/2026`), no banner do terminal e em `GET /api/status`. Registre cada mudança no `CHANGELOG.md`.

---

## Rollback

**Código:** `git log --oneline` → `git revert <hash>` → `git push` (Railway faz redeploy).
**Dados:** Configurações (canto superior direito) → *Baixar backup (JSON)*. Para voltar, *Restaurar backup* — o banco atual é copiado para `data/db-antes-restore-<timestamp>.json` antes da troca.

---

## Variáveis de ambiente (Railway)

| Variável | Valor |
|---|---|
| `DATA_DIR` | Caminho de um **Volume** do Railway (ex.: `/data`). Sem volume, os dados somem a cada deploy. |
| `APP_USER` | (opcional) usuário do login básico |
| `APP_PASS` | (opcional) senha do login básico |
| `PORT` | definida automaticamente |

Recomendado definir `APP_USER`/`APP_PASS` em nuvem: a tabela de custos é sensível.

---

## Regras de precificação (calc.js)

**Natureza de cada item**
- `setup` — implantação, pagamento único
- `mensal` — recorrente fixo (ex.: horas de SAC/backoffice, licença, gestão)
- `variavel` — mensal dependente de volume (ex.: picking por item, packing por pedido, % GMV)

**Tipo de cobrança:** `hora` (usa o custo do perfil), `unidade`, `fixo`, `percentual` (% do GMV).
Itens por unidade podem ter quantidade fixa ou `× pedidos` (fator × pedidos/mês).
Itens por hora podem ter horas fixas ou `% das horas`: `horas = % × soma das horas dos demais itens por hora da mesma natureza` (arredondado a 0,1 h). É o modo usado para o **GP**, com alocação Dedicado ou Compartilhado (percentuais em *Custos e parâmetros*) ou Personalizado. Itens em `% das horas` não entram na base.

**Preço por natureza**
- Modo margem: `preço = custo × (1 + contingência) ÷ (1 − margem − impostos)`
- Modo markup: `preço = custo × (1 + contingência) × (1 + markup) ÷ (1 − impostos)` — equivalente à planilha antiga

**Contrato**
- `mensalidade = preço mensal + preço variável + fee% × GMV/mês`
- `TCV = setup + mensalidade × meses`
- `margem real = (TCV − impostos − custo total) ÷ TCV`

**Congelamento:** ao entrar no orçamento, custo unitário e dólar são copiados. Mudar a tabela de custos não altera orçamentos existentes; use *Mais → Atualizar custos* para trazer os valores vigentes.

**Fluxo de status**
`rascunho → (em aprovação → aprovado) → enviado → aceito | perdido`
- Abaixo da margem mínima, só vai para *enviado* passando por aprovação.
- Ao marcar como *enviado*, uma versão é congelada no histórico.
- *Enviado* e *aceito* ficam bloqueados para edição; editar um orçamento aprovado o devolve para rascunho.

---

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/status` | versão, modo nuvem, login |
| GET | `/api/db` | todos os dados (settings, perfis, serviços, templates, orçamentos) |
| PUT | `/api/settings` | margens, impostos, câmbio, validade |
| POST | `/api/cambio/ptax` | busca PTAX de venda no Banco Central |
| GET/POST/PUT/DELETE | `/api/perfis[/:id]` | tabela de custos |
| GET/POST/PUT/DELETE | `/api/servicos[/:id]` | catálogo de serviços |
| GET/POST/PUT/DELETE | `/api/templates[/:id]` | templates |
| GET/POST | `/api/orcamentos` | lista / cria (`templateId` opcional) |
| GET/PUT/DELETE | `/api/orcamentos/:id` | lê / atualiza / exclui |
| POST | `/api/orcamentos/:id/item` | adiciona item do catálogo (com custo congelado) |
| POST | `/api/orcamentos/:id/status` | muda status (valida margem e transições) |
| POST | `/api/orcamentos/:id/versao` | salva versão manual |
| POST | `/api/orcamentos/:id/duplicar` | duplica |
| POST | `/api/orcamentos/:id/atualizar-custos` | reaplica tabela de custos e dólar vigentes |
| GET / POST | `/api/backup` / `/api/restore` | backup e restauração |

---

## Próximos passos sugeridos

- Integração com o C.P: ao aceitar, criar o épico no Jira com as horas por perfil (orçado × realizado)
- Integração com CRM (HubSpot) para abrir orçamento a partir da oportunidade
- Perfis de acesso (comercial vê preço, financeiro vê custo)
- Migrar `data/db.json` para Postgres quando houver vários usuários editando ao mesmo tempo
