# Histórico de versões

## v1.2.1 · 2026-09-25

**Proposta**
- A composição da squad não aparece mais na proposta: o cliente vê só **Squad Dev** com o total de horas e o valor, sem a lista de perfis (Project Manager, Technical Leader, Front-end Developer, Quality Assurance)
- Dentro da plataforma (editor, CSV e histórico) o detalhamento por perfil continua disponível

## v1.2.0 · 2026-09-25

**GP calculado em % das horas**
- Novo modo de quantidade **% das horas** para itens por hora: as horas do item passam a ser um percentual da **soma das demais horas da mesma natureza** (setup com setup, mensal com mensal)
- Alocação **Dedicado**, **Compartilhado** ou **Personalizado**. Os percentuais de Dedicado (padrão 25%) e Compartilhado (padrão 10%) ficam em *Custos e parâmetros → Regras de preço*
- O GP acompanha automaticamente qualquer mudança nas demais horas; a tela mostra o cálculo (ex.: “= 127,5 h de 510 h”)
- Horas calculadas são arredondadas a 0,1 h
- Itens em % das horas não entram na base (sem cálculo circular)
- Ao voltar de % das horas para Horas, o item mantém as horas que estavam calculadas
- **Atualizar custos** também reaplica os percentuais vigentes de Dedicado e Compartilhado
- Templates aceitam GP em % das horas
  - *Fast Template Lume – Filial*: GP personalizado de 24,71% (= 126 h sobre 510 h, o mesmo valor da planilha)
  - *Fullcommerce – Loja completa*: GP dedicado
  - *Fulfillment*: GP continua em horas fixas (o setup não tem outras horas por perfil para servir de base)

**Banco de dados**
- Bancos da v1.1.0 recebem os percentuais padrão de GP automaticamente ao iniciar. Templates já existentes não são alterados

## v1.1.0 · 2026-09-25

**Novo layout, no padrão da plataforma Cronogramas**
- Tema claro com fonte Figtree, barra superior escura e símbolo de três barras (Setup, Mensal e Variável)
- Sem menu lateral: página única com abas **Orçamentos**, **Templates**, **Serviços** e **Custos e parâmetros**, cada uma com contador
- Faixa de resumo na lista (em aberto, aceitos, margem média, aguardando aprovação, conversão) e filtro de status em botões segmentados
- Tela do orçamento no formato da tela de cronograma: título com selos, métricas à direita (setup, mensalidade, contrato, margem real), barra de ferramentas com legenda de cores
- Grupos Setup / Mensal / Variável recolhíveis na tabela de itens
- Histórico e versões em painel lateral
- Novo orçamento com opções em cartão (a partir de template ou em branco)
- Confirmações e justificativas em janelas próprias, no lugar das caixas do navegador
- Avisos na base da tela, centralizados
- Proposta em tela própria, no padrão do PDF do Cronogramas
- Modo escuro automático (segue o sistema) e opção de alternar em Configurações
- No celular, a lista de orçamentos vira cartões

**Alterado**
- Porta padrão agora é **3333** (3131 é do C.P e 3232 do Cronogramas: os três rodam juntos)
- Nome exibido: **Orçamentos**

## v1.0.0 · 2026-09-25

- Primeira versão: tabela de custos, catálogo de serviços, templates, orçamentos com natureza Setup / Mensal / Variável, margem real ou markup, impostos, contingência, fee sobre GMV, valor total do contrato, fluxo de aprovação com margem mínima, versões congeladas, proposta sem custos, PTAX do Banco Central, backup e restauração
