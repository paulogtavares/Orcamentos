-- =====================================================================
-- Orçamentos · estrutura inicial (schema orcamentos).
-- Aplicada só num banco novo (o migrador do kit detecta pela tabela orcamentos.parametros).
-- A conexão usa search_path = orcamentos, public: nada deste módulo fica em public.
--
-- Números em double precision: são os mesmos números (IEEE 754) que a v1.2.1 gravava no
-- db.json, então o cálculo dá exatamente o mesmo resultado depois de importar.
-- Colunas "extras": campos que um db.json antigo tenha e a v2 não conhece; voltam no backup.
-- =====================================================================

-- Parâmetros gerais (margens, impostos, câmbio, GP…): chave → valor, como o "settings" da v1.
-- Chaves começando com "meta:" guardam dados de controle (ex.: data de criação da base).
CREATE TABLE parametros (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- Papéis de custo (na v1.2.1: "perfis" da tabela de custos). A API mantém /api/perfis.
CREATE TABLE papeis_custo (
  id          text PRIMARY KEY,
  nome        text NOT NULL,
  categoria   text NOT NULL DEFAULT 'Geral',
  moeda       text NOT NULL DEFAULT 'BRL' CHECK (moeda IN ('BRL', 'USD')),
  custo_hora  double precision NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  ordem       integer NOT NULL DEFAULT 0,
  extras      jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE servicos (
  id             text PRIMARY KEY,
  nome           text NOT NULL,
  area           text NOT NULL DEFAULT 'Geral',
  grupo          text NOT NULL DEFAULT '',
  tipo_cobranca  text NOT NULL CHECK (tipo_cobranca IN ('hora', 'unidade', 'fixo', 'percentual')),
  natureza       text NOT NULL DEFAULT 'setup',
  papel_id       text REFERENCES papeis_custo (id),
  unidade        text,
  custo_unit     double precision,
  moeda          text,
  ordem          integer NOT NULL DEFAULT 0,
  extras         jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE templates (
  id         text PRIMARY KEY,
  nome       text NOT NULL,
  modelo     text NOT NULL DEFAULT 'projeto',
  descricao  text NOT NULL DEFAULT '',
  params     jsonb NOT NULL DEFAULT '{}',
  ordem      integer NOT NULL DEFAULT 0,
  extras     jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE template_itens (
  template_id  text NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  ordem        integer NOT NULL,
  servico_id   text NOT NULL,
  qtd          double precision,
  qtd_modo     text,
  fator        double precision,
  natureza     text,
  alocacao     text,
  perc_horas   double precision,
  extras       jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (template_id, ordem)
);
CREATE INDEX ix_template_itens_servico ON template_itens (servico_id);

-- Numeração dos orçamentos (ORC-AAAA-NNNN): contador único da base, como o meta.seq da v1.
CREATE SEQUENCE orcamento_numero_seq;

CREATE TABLE orcamentos (
  id             text PRIMARY KEY,
  numero         text NOT NULL,
  cliente        text NOT NULL DEFAULT '',
  projeto        text NOT NULL DEFAULT '',
  modelo         text NOT NULL DEFAULT 'projeto',
  responsavel    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho', 'em_aprovacao', 'aprovado', 'enviado', 'aceito', 'perdido')),
  validade       text,
  template_id    text,
  cambio         double precision,
  params         jsonb NOT NULL DEFAULT '{}',
  premissas      text NOT NULL DEFAULT '',
  resumo         jsonb NOT NULL DEFAULT '{}',
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  -- posição na lista (a v1 mostra os mais novos primeiro, na ordem em que foram criados)
  posicao        bigint NOT NULL DEFAULT 0,
  criado_por     uuid,
  extras         jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT ux_orcamentos_numero UNIQUE (numero)
);
CREATE INDEX ix_orcamentos_posicao ON orcamentos (posicao DESC);

CREATE TABLE orcamento_itens (
  orcamento_id   text NOT NULL REFERENCES orcamentos (id) ON DELETE CASCADE,
  ordem          integer NOT NULL,
  uid            text NOT NULL,
  servico_id     text,
  nome           text,
  area           text,
  grupo          text,
  tipo_cobranca  text,
  natureza       text,
  unidade        text,
  papel_id       text,
  papel_nome     text,
  moeda          text,
  custo_unit     double precision,
  qtd            double precision,
  qtd_modo       text,
  fator          double precision,
  alocacao       text,
  perc_horas     double precision,
  extras         jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (orcamento_id, ordem)
);

-- Versões congeladas (no envio ou manualmente): resumo e snapshot { itens, params, cambio }.
CREATE TABLE orcamento_versoes (
  orcamento_id  text NOT NULL REFERENCES orcamentos (id) ON DELETE CASCADE,
  v             integer NOT NULL,
  data          timestamptz NOT NULL DEFAULT now(),
  resumo        jsonb NOT NULL,
  snapshot      jsonb NOT NULL,
  usuario_id    uuid,
  extras        jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (orcamento_id, v)
);

CREATE TABLE orcamento_historico (
  orcamento_id  text NOT NULL REFERENCES orcamentos (id) ON DELETE CASCADE,
  ordem         integer NOT NULL,
  data          timestamptz NOT NULL DEFAULT now(),
  acao          text NOT NULL,
  -- "por": texto exibido (na v1, enviado pela tela; na v2, o nome do usuário logado)
  por           text,
  usuario_id    uuid,
  extras        jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (orcamento_id, ordem)
);

-- Cópia da base inteira antes de uma restauração (na v1: data/db-antes-restore-<data>.json).
CREATE TABLE copias_seguranca (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  motivo      text NOT NULL,
  usuario_id  uuid,
  dados       jsonb NOT NULL
);
