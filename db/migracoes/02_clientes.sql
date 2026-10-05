-- =====================================================================
-- v2.1.0 · cadastro de clientes (cadastro mestre da plataforma, Plano 4).
-- Os ids são uuid e, para os clientes vindos do Cronogramas, os MESMOS ids
-- de lá: os usuários externos (usuarios.cliente_id) já apontam para eles.
-- =====================================================================

CREATE TABLE clientes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL CHECK (btrim(nome) <> ''),
  -- CNPJ ou CPF, só dígitos (a tela formata); opcional
  documento      text CHECK (documento IS NULL OR documento ~ '^[0-9]{11}$|^[0-9]{14}$'),
  situacao       text NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo', 'inativo')),
  -- de onde veio: cadastro na tela, importação do Cronogramas ou ligação dos orçamentos
  origem         text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'cronogramas', 'ligacao')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid
);
-- um documento não se repete; o nome pode (a tela avisa sobre nomes parecidos)
CREATE UNIQUE INDEX ux_clientes_documento ON clientes (documento) WHERE documento IS NOT NULL;
CREATE INDEX ix_clientes_nome ON clientes (lower(nome));

-- orçamento ligado ao cadastro; o texto "cliente" continua guardando o nome mostrado na proposta
ALTER TABLE orcamentos ADD COLUMN cliente_id uuid REFERENCES clientes (id) ON DELETE RESTRICT;
CREATE INDEX ix_orcamentos_cliente ON orcamentos (cliente_id);

-- cliente do usuário externo (coluna do kit; a chave estrangeira é do módulo, como diz o identidade.sql)
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE SET NULL;

-- registro das importações de clientes (arquivo, contagens, quem importou)
CREATE TABLE importacoes_clientes (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feita_em      timestamptz NOT NULL DEFAULT now(),
  usuario_id    uuid,
  arquivo       text,
  criados       integer NOT NULL,
  atualizados   integer NOT NULL,
  unidos        integer NOT NULL,
  ignorados     integer NOT NULL
);
