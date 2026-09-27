-- =====================================================================
-- PROVISÓRIO até o plataforma-kit 1.3.0 (SQL de identidade).
--
-- O kit 1.2.0 lê usuarios, perfis e sessoes com colunas fixas, mas não entrega o SQL.
-- Este arquivo tem só o mínimo que o kit 1.2.0 consulta (o mesmo de testes/apoio.ts do kit,
-- mais as duas restrições que o kit traduz: ux_usuarios_email e ck_admin_interno).
-- Nada foi copiado do Cronogramas.
--
-- Quando o kit 1.3.0 sair, este arquivo é substituído pelo SQL do kit. Como a v2 ainda não
-- roda em produção, bancos de desenvolvimento podem ser recriados.
-- =====================================================================

CREATE TABLE perfis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  permissoes  text[] NOT NULL DEFAULT '{}',
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text NOT NULL,
  email                 text NOT NULL,
  tipo                  text NOT NULL DEFAULT 'interno' CHECK (tipo IN ('interno', 'externo')),
  cliente_id            uuid,
  administrador         boolean NOT NULL DEFAULT false,
  precisa_trocar_senha  boolean NOT NULL DEFAULT false,
  perfil_id             uuid REFERENCES perfis (id),
  ativo                 boolean NOT NULL DEFAULT true,
  senha_hash            text,
  ultimo_acesso         timestamptz,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_admin_interno CHECK (NOT administrador OR tipo = 'interno')
);
CREATE UNIQUE INDEX ux_usuarios_email ON usuarios (lower(email));

CREATE TABLE sessoes (
  token_hash  text PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  expira_em   timestamptz NOT NULL,
  ip          text,
  agente      text,
  criada_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessoes_usuario ON sessoes (usuario_id);
