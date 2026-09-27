/** Catálogo de permissões do Orçamentos (regra do kit: toda chave começa com "orcamentos."). */
import { criarCatalogo } from "plataforma-kit/permissoes";
import type { UsuarioPlataforma } from "plataforma-kit/tipos";

export const catalogo = criarCatalogo("orcamentos", [
  {
    chave: "orcamentos.ver",
    grupo: "Orçamentos",
    nome: "Ver orçamentos",
    descricao: "Lista, abre e vê a proposta dos orçamentos.",
  },
  {
    chave: "orcamentos.editar",
    grupo: "Orçamentos",
    nome: "Criar e editar",
    descricao: "Cria, edita, duplica e exclui orçamentos; envia para aprovação, marca enviado, aceito ou perdido.",
  },
  {
    chave: "orcamentos.aprovar",
    grupo: "Orçamentos",
    nome: "Aprovar",
    descricao: "Aprova ou devolve orçamentos que estão em aprovação.",
  },
  {
    chave: "orcamentos.custos.ver",
    grupo: "Custos",
    nome: "Ver custos",
    descricao: "Vê custos, margem e tabela de custos. Sem ela, vê só o preço.",
  },
  {
    chave: "orcamentos.custos.gerenciar",
    grupo: "Custos",
    nome: "Gerenciar custos e parâmetros",
    descricao: "Altera papéis de custo, serviços, câmbio e regras de preço.",
  },
  {
    chave: "orcamentos.templates.gerenciar",
    grupo: "Cadastros",
    nome: "Gerenciar templates",
    descricao: "Cria, altera e exclui templates.",
  },
  {
    chave: "orcamentos.backup",
    grupo: "Administração",
    nome: "Backup e restauração",
    descricao: "Baixa o backup completo e restaura a base a partir de um arquivo.",
  },
] as const);

export type Permissao = (typeof catalogo.todas)[number];
export type Usuario = UsuarioPlataforma<Permissao>;
