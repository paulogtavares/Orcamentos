/**
 * Validação das rotas com zod. Mesmos nomes de campo da v1.2.1; campos desconhecidos nos cadastros
 * são descartados (na v1 qualquer campo era gravado). Itens de orçamento aceitam campos a mais
 * (vão para "extras"), para a tela nunca perder informação que ela mesma gravou.
 */
import { z } from "zod";

const texto = (max = 500) => z.string().trim().max(max, `Texto com mais de ${max} caracteres.`);
const numero = z.number({ invalid_type_error: "Informe um número." }).finite();
const naoNegativo = numero.min(0, "O valor não pode ser negativo.");
const fracao = numero.min(0, "Percentual inválido.").max(1, "Percentual acima de 100%.");
const moeda = z.enum(["BRL", "USD"], { errorMap: () => ({ message: "Moeda deve ser BRL ou USD." }) });
const natureza = z.enum(["setup", "mensal", "variavel"], { errorMap: () => ({ message: "Natureza inválida." }) });
const tipoCobranca = z.enum(["hora", "unidade", "fixo", "percentual"], {
  errorMap: () => ({ message: "Tipo de cobrança inválido." }),
});
const qtdModo = z.enum(["fixa", "porPedido", "percHoras"], {
  errorMap: () => ({ message: "Modo de quantidade inválido." }),
});
const alocacao = z.enum(["dedicado", "compartilhado", "personalizado"]).nullable();
/** número em campo livre de item: aceita número, texto numérico (herança da v1) ou vazio */
const numLivre = z.union([numero, z.string().max(40), z.null()]).optional();

export const idRota = z.object({ id: z.string().regex(/^[\w-]{1,80}$/, "Identificador inválido.") });

export const parametrosPreco = z
  .object({
    modoPreco: z.enum(["margem", "markup"]).optional(),
    margem: numero.optional(),
    imposto: fracao.optional(),
    contingencia: numero.min(0).optional(),
    meses: naoNegativo.optional(),
    pedidosMes: naoNegativo.optional(),
    gmvMes: naoNegativo.optional(),
    feeGmv: naoNegativo.optional(),
  })
  .passthrough();

export const cambio = z
  .object({
    usd: numero.positive("Câmbio deve ser maior que zero.").optional(),
    fonte: texto(60).optional(),
    dataCotacao: texto(40).optional(),
    atualizadoEm: texto(40).optional(),
  })
  .strip();

export const settings = z
  .object({
    empresa: texto(120).optional(),
    cambio: cambio.optional(),
    margemAlvo: fracao.optional(),
    margemMinima: fracao.optional(),
    impostoPadrao: fracao.optional(),
    contingenciaPadrao: fracao.optional(),
    modoPrecoPadrao: z.enum(["margem", "markup"]).optional(),
    validadeDias: z.number().int().min(1).max(365).optional(),
    gpDedicadoPct: numero.min(0).max(100).optional(),
    gpCompartilhadoPct: numero.min(0).max(100).optional(),
  })
  .strip();

export const papel = z
  .object({
    nome: texto(120).min(1, "Informe o nome."),
    categoria: texto(120),
    moeda,
    custoHora: naoNegativo,
    ativo: z.boolean(),
  })
  .strip();

export const servico = z
  .object({
    nome: texto(160).min(1, "Informe o nome do serviço."),
    area: texto(120),
    grupo: texto(120),
    tipoCobranca,
    natureza,
    perfilId: z.string().max(80).nullable(),
    unidade: texto(60),
    custoUnit: naoNegativo,
    moeda,
  })
  .strip();

export const itemTemplate = z
  .object({
    servicoId: z.string().min(1).max(80),
    qtd: numLivre,
    qtdModo: qtdModo.optional(),
    fator: numLivre,
    natureza: natureza.optional(),
    alocacao: alocacao.optional(),
    percHoras: numLivre,
  })
  .strip();

export const template = z
  .object({
    nome: texto(160).min(1, "Informe o nome do template."),
    modelo: texto(60),
    descricao: texto(2000),
    params: parametrosPreco,
    itens: z.array(itemTemplate).max(500),
  })
  .strip();

export const itemOrcamento = z
  .object({
    uid: z.string().max(80).optional(),
    servicoId: z.string().max(80).nullable().optional(),
    nome: z.string().max(200).nullable().optional(),
    area: z.string().max(120).nullable().optional(),
    grupo: z.string().max(120).nullable().optional(),
    tipoCobranca: tipoCobranca.optional(),
    natureza: natureza.optional(),
    unidade: z.string().max(60).nullable().optional(),
    perfilId: z.string().max(80).nullable().optional(),
    perfilNome: z.string().max(160).nullable().optional(),
    moeda: moeda.optional(),
    custoUnit: numLivre,
    qtd: numLivre,
    qtdModo: qtdModo.optional(),
    fator: numLivre,
    alocacao: alocacao.optional(),
    percHoras: numLivre,
  })
  .passthrough();

const uuid = z.string().uuid("Cliente inválido.");

export const novoOrcamento = z
  .object({
    cliente: texto(200).optional(),
    clienteId: uuid.nullable().optional(),
    projeto: texto(200).optional(),
    modelo: texto(60).optional(),
    responsavel: texto(160).optional(),
    templateId: z.string().max(80).nullable().optional(),
  })
  .strip();

export const edicaoOrcamento = z
  .object({
    cliente: texto(200).optional(),
    clienteId: uuid.nullable().optional(),
    projeto: texto(200).optional(),
    modelo: texto(60).optional(),
    responsavel: texto(160).optional(),
    validade: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Validade deve ser uma data (AAAA-MM-DD).")
      .optional(),
    cambio: numero.min(0).optional(),
    params: parametrosPreco.optional(),
    premissas: z.string().max(20000).optional(),
    itens: z.array(itemOrcamento).max(1000).optional(),
  })
  .strip();

export const novoItem = z
  .object({
    servicoId: z.string().min(1, "Informe o serviço.").max(80),
    qtd: numLivre,
    qtdModo: qtdModo.optional(),
    fator: numLivre,
    natureza: natureza.optional(),
    alocacao: alocacao.optional(),
    percHoras: numLivre,
  })
  .strip();

export const mudancaStatus = z
  .object({
    status: z.string().min(1, "Informe o status."),
    comentario: z.string().max(2000).optional(),
  })
  .strip();

// ------------------------------------------------------------ clientes (v2.1.0)

const documento = z
  .string()
  .trim()
  .max(30)
  .nullable()
  .refine(
    (v) => !v || [11, 14].includes(v.replace(/\D/g, "").length),
    "Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos).",
  );

export const cliente = z
  .object({
    nome: texto(200).min(1, "Informe o nome do cliente."),
    documento: documento.optional(),
    situacao: z.enum(["ativo", "inativo"]).optional(),
  })
  .strip();

export const importacaoClientes = z
  .object({
    /** conteúdo do arquivo (JSON ou CSV) ou a lista já lida */
    conteudo: z.union([z.string().max(10_000_000), z.array(z.object({}).passthrough()), z.object({}).passthrough()]),
    arquivo: z.string().max(200).optional(),
    confirmar: z.boolean().optional(),
  })
  .strip();

export const ligacao = z
  .object({
    grupos: z
      .array(
        z.object({
          textos: z.array(z.string().max(200)).min(1),
          destino: z
            .union([
              z.object({ clienteId: uuid }).strict(),
              z
                .object({
                  novo: z.object({
                    nome: texto(200).min(1, "Informe o nome do novo cliente."),
                    documento: documento.optional(),
                  }),
                })
                .strict(),
            ])
            .nullable(),
        }),
      )
      .max(5000),
  })
  .strip();
