/**
 * Cadastro de clientes (v2.1.0): o cadastro mestre da plataforma (Plano 4).
 *
 *   - Importação do Cronogramas: vale sempre o id de lá (os usuários externos já apontam para ele). Um cliente local
 *     com o mesmo documento ou o mesmo nome é UNIDO ao do Cronogramas: os orçamentos passam a apontar para o id do
 *     Cronogramas e o registro local sai. Tudo aparece numa prévia antes de confirmar.
 *   - Ligação dos orçamentos: os orçamentos da v1 têm o cliente como texto livre; os textos são agrupados por nome
 *     normalizado, com sugestão de cliente e aviso de nomes parecidos, e só são ligados depois da revisão.
 *   - O texto "cliente" do orçamento é o nome mostrado na proposta: renomear ou ligar atualiza só os orçamentos ainda
 *     não enviados (enviados, aceitos e perdidos mantêm o nome que o cliente viu).
 */
import { ErroApi, naoEncontrado } from "plataforma-kit/erros";
import type { Consulta } from "./banco.js";
import { CAMPOS_CLIENTE, colunasInsert, deColunas, paraColunas, UUID } from "./dados/mapeamento.js";
import type { Json } from "./dados/tipos.js";

export interface Cliente {
  id: string;
  nome: string;
  documento?: string | null;
  situacao: "ativo" | "inativo";
  origem: "manual" | "cronogramas" | "ligacao";
  criadoEm?: string;
  atualizadoEm?: string;
  /** orçamentos ligados (só nas listagens da tela) */
  orcamentos?: number;
}

/** Orçamentos que ainda recebem o nome do cadastro (os demais guardam o nome que o cliente viu). */
export const STATUS_SEGUEM_CADASTRO = ["rascunho", "em_aprovacao", "aprovado"];

// ------------------------------------------------------------ normalização

const SUFIXOS = new Set(["ltda", "sa", "s/a", "me", "mei", "epp", "eireli", "cia", "co", "inc", "llc"]);

/** Nome comparável: sem acentos, caixa, pontuação, espaços repetidos e sufixos societários (Ltda, S.A., ME…). */
export function normalizarNome(texto: string): string {
  const palavras = String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/s\s*\/\s*a\b/g, "sa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  for (;;) {
    const n = palavras.length;
    if (n > 2 && palavras[n - 2] === "s" && palavras[n - 1] === "a")
      palavras.splice(n - 2, 2); // "S.A." → "s a"
    else if (n > 1 && SUFIXOS.has(palavras[n - 1])) palavras.pop();
    else break;
  }
  return palavras.join(" ");
}

/** Só dígitos; CPF (11) ou CNPJ (14). Qualquer outra coisa vira null. */
export function normalizarDocumento(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 || d.length === 14 ? d : null;
}

/** Distância de edição (Levenshtein), para avisar de nomes parecidos. */
function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = t;
    }
  }
  return d[b.length];
}

/** Dois nomes normalizados "parecem o mesmo": distância pequena ou um contém o outro como palavras inteiras. */
export function parecidos(a: string, b: string) {
  if (!a || !b || a === b) return false;
  // mesmo número de palavras e diferença só em palavras curtas ("loja y" × "loja z"): nomes diferentes
  const pa = a.split(" ");
  const pb = b.split(" ");
  if (pa.length === pb.length && pa.every((x, i) => x === pb[i] || (x.length <= 2 && pb[i].length <= 2))) return false;
  if (Math.min(a.length, b.length) >= 5 && distancia(a, b) <= 2) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return curto.length >= 4 && ` ${longo} `.includes(` ${curto} `);
}

// ------------------------------------------------------------ repositório

export async function listarClientes(q: Consulta, comContagem = false): Promise<Cliente[]> {
  const { rows } = await q(
    `SELECT c.*${comContagem ? ", (SELECT count(*)::int FROM orcamentos o WHERE o.cliente_id = c.id) AS n_orcamentos" : ""}
       FROM clientes c ORDER BY lower(c.nome), c.id`,
  );
  return rows.map((r) => ({
    ...(deColunas(r, CAMPOS_CLIENTE) as unknown as Cliente),
    ...(comContagem ? { orcamentos: r.n_orcamentos } : {}),
  }));
}

export async function lerCliente(q: Consulta, id: string): Promise<Cliente | null> {
  if (!UUID.test(id)) return null;
  const { rows } = await q("SELECT * FROM clientes WHERE id = $1", [id]);
  return rows[0] ? (deColunas(rows[0], CAMPOS_CLIENTE) as unknown as Cliente) : null;
}

/** Grava o cliente como veio (cria ou substitui pelo id). Usado pela restauração e importação de backup. */
export async function gravarCliente(q: Consulta, c: Json, usuarioId?: string | null) {
  const { valores } = paraColunas(c, CAMPOS_CLIENTE); // clientes não guardam campos desconhecidos
  const { nomes, marcadores } = colunasInsert(CAMPOS_CLIENTE);
  const atualizar = CAMPOS_CLIENTE.filter((x) => x.json !== "id").map((x) => `${x.coluna} = EXCLUDED.${x.coluna}`);
  await q(
    `INSERT INTO clientes (${nomes}, criado_por) VALUES (${marcadores}, $${CAMPOS_CLIENTE.length + 1})
     ON CONFLICT (id) DO UPDATE SET ${atualizar.join(", ")}`,
    [...valores, usuarioId ?? null],
  );
}

/** Nome do cadastro nos orçamentos ligados que ainda não foram enviados. */
async function propagarNome(q: Consulta, clienteId: string, nome: string) {
  await q(
    `UPDATE orcamentos SET cliente = $2, atualizado_em = now()
      WHERE cliente_id = $1 AND status = ANY($3) AND cliente IS DISTINCT FROM $2`,
    [clienteId, nome, STATUS_SEGUEM_CADASTRO],
  );
}

export interface DadosCliente {
  nome?: string;
  documento?: string | null;
  situacao?: "ativo" | "inativo";
}

export async function criarCliente(
  q: Consulta,
  d: DadosCliente,
  usuarioId: string | null,
  origem: Cliente["origem"] = "manual",
) {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO clientes (nome, documento, situacao, origem, criado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [d.nome!.trim(), normalizarDocumento(d.documento), d.situacao ?? "ativo", origem, usuarioId],
  );
  return rows[0].id;
}

export async function alterarCliente(q: Consulta, id: string, d: DadosCliente) {
  const atual = await lerCliente(q, id);
  if (!atual) throw naoEncontrado("Cliente");
  const nome = d.nome !== undefined ? d.nome.trim() : atual.nome;
  const documento = d.documento !== undefined ? normalizarDocumento(d.documento) : (atual.documento ?? null);
  await q(`UPDATE clientes SET nome = $2, documento = $3, situacao = $4, atualizado_em = now() WHERE id = $1`, [
    id,
    nome,
    documento,
    d.situacao ?? atual.situacao,
  ]);
  if (nome !== atual.nome) await propagarNome(q, id, nome);
}

export async function excluirCliente(q: Consulta, id: string) {
  if (!(await lerCliente(q, id))) throw naoEncontrado("Cliente");
  const uso = await q<{ n: number }>("SELECT count(*)::int AS n FROM orcamentos WHERE cliente_id = $1", [id]);
  if (uso.rows[0].n > 0)
    throw new ErroApi(409, `Este cliente tem ${uso.rows[0].n} orçamento(s) ligado(s). Inative-o em vez de excluir.`);
  await q("DELETE FROM clientes WHERE id = $1", [id]);
}

// ------------------------------------------------------------ importação do Cronogramas

export interface LinhaImportacao {
  id: string;
  nome: string;
  documento: string | null;
  situacao: "ativo" | "inativo";
}

/** CSV simples (separador ; ou ,, aspas duplas), com cabeçalho. */
function lerCsv(texto: string): Json[] {
  const linhas = texto
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const campos = (l: string) => {
    const r: string[] = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && aspas && l[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = !aspas;
      else if (c === sep && !aspas) {
        r.push(atual);
        atual = "";
      } else atual += c;
    }
    r.push(atual);
    return r.map((x) => x.trim());
  };
  const cab = campos(linhas[0]).map((c) => normalizarNome(c).replace(/ /g, "_"));
  return linhas.slice(1).map((l) => Object.fromEntries(campos(l).map((v, i) => [cab[i], v])));
}

const primeiro = (o: Json, chaves: string[]) => {
  for (const k of chaves) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

function situacaoDe(o: Json): "ativo" | "inativo" {
  const v = primeiro(o, ["situacao", "status", "ativo"]);
  if (v === undefined) return "ativo";
  if (typeof v === "boolean") return v ? "ativo" : "inativo";
  return /^(inativo|inactive|false|0|nao|não|n)$/i.test(String(v).trim()) ? "inativo" : "ativo";
}

/**
 * Lê o arquivo exportado do Cronogramas: JSON (lista, ou { clientes: [...] }) ou CSV com cabeçalho.
 * Obrigatórios: id (uuid) e nome. Opcionais: documento (ou cnpj/cpf) e situação (ou status/ativo).
 */
export function lerArquivoClientes(conteudo: string | unknown): { linhas: LinhaImportacao[]; erros: string[] } {
  let brutos: Json[];
  if (typeof conteudo === "string") {
    const t = conteudo.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        conteudo = JSON.parse(t);
      } catch {
        throw new ErroApi(400, "O arquivo parece JSON, mas não é um JSON válido.");
      }
    } else conteudo = lerCsv(t);
  }
  if (Array.isArray(conteudo)) brutos = conteudo;
  else if (conteudo && typeof conteudo === "object" && Array.isArray((conteudo as Json).clientes))
    brutos = (conteudo as Json).clientes;
  else throw new ErroApi(400, "Formato não reconhecido: envie uma lista de clientes (JSON) ou um CSV com cabeçalho.");

  const linhas: LinhaImportacao[] = [];
  const erros: string[] = [];
  const vistos = new Set<string>();
  const documentos = new Map<string, string>();
  brutos.forEach((b, i) => {
    const n = `linha ${i + 1}`;
    const id = String(primeiro(b, ["id", "uuid", "cliente_id"]) ?? "")
      .trim()
      .toLowerCase();
    const nome = String(primeiro(b, ["nome", "razao_social", "name"]) ?? "").trim();
    if (!UUID.test(id)) return erros.push(`${n}: id ausente ou inválido (precisa ser o uuid do Cronogramas).`);
    if (!nome) return erros.push(`${n}: sem nome.`);
    if (vistos.has(id)) return erros.push(`${n}: id ${id} repetido no arquivo.`);
    const bruto = primeiro(b, ["documento", "cnpj", "cpf", "cnpj_cpf"]);
    let documento = normalizarDocumento(bruto);
    if (bruto !== undefined && !documento)
      erros.push(`${n} (${nome}): documento "${bruto}" ignorado (não é CPF nem CNPJ).`);
    if (documento && documentos.has(documento)) {
      erros.push(
        `${n} (${nome}): documento já usado por ${documentos.get(documento)} no arquivo; importado sem documento.`,
      );
      documento = null;
    }
    if (documento) documentos.set(documento, nome);
    vistos.add(id);
    linhas.push({ id, nome, documento, situacao: situacaoDe(b) });
  });
  return { linhas, erros };
}

export type AcaoImportacao = "criar" | "atualizar" | "igual" | "unir";
export interface ItemPrevia {
  linha: LinhaImportacao;
  acao: AcaoImportacao;
  /** cliente local que será unido ao do Cronogramas */
  unirCom?: { id: string; nome: string; documento?: string | null; orcamentos: number; motivo: "documento" | "nome" };
  mudancas?: string[];
}

/** O que a importação fará, sem gravar nada. */
export async function previaImportacao(q: Consulta, linhas: LinhaImportacao[]) {
  const atuais = await listarClientes(q, true);
  const porId = new Map(atuais.map((c) => [c.id, c]));
  const idsDoArquivo = new Set(linhas.map((l) => l.id));
  // só clientes locais que NÃO estão no arquivo podem ser unidos (cada um a no máximo um do arquivo)
  const livres = atuais.filter((c) => !idsDoArquivo.has(c.id));
  const usados = new Set<string>();
  const itens: ItemPrevia[] = linhas.map((linha) => {
    const atual = porId.get(linha.id);
    if (atual) {
      const mudancas = [
        atual.nome !== linha.nome && `nome: "${atual.nome}" → "${linha.nome}"`,
        (atual.documento ?? null) !== linha.documento &&
          linha.documento &&
          `documento: ${atual.documento ?? "—"} → ${linha.documento}`,
        atual.situacao !== linha.situacao && `situação: ${atual.situacao} → ${linha.situacao}`,
      ].filter(Boolean) as string[];
      return { linha, acao: mudancas.length ? "atualizar" : "igual", mudancas };
    }
    const chave = normalizarNome(linha.nome);
    const porDoc = linha.documento
      ? livres.find((c) => !usados.has(c.id) && c.documento === linha.documento)
      : undefined;
    const porNome = porDoc ? undefined : livres.find((c) => !usados.has(c.id) && normalizarNome(c.nome) === chave);
    const alvo = porDoc ?? porNome;
    if (alvo) {
      usados.add(alvo.id);
      return {
        linha,
        acao: "unir",
        unirCom: {
          id: alvo.id,
          nome: alvo.nome,
          documento: alvo.documento,
          orcamentos: alvo.orcamentos ?? 0,
          motivo: porDoc ? "documento" : "nome",
        },
      };
    }
    return { linha, acao: "criar" };
  });
  const conta = (a: AcaoImportacao) => itens.filter((i) => i.acao === a).length;
  return {
    itens,
    resumo: { criar: conta("criar"), atualizar: conta("atualizar"), igual: conta("igual"), unir: conta("unir") },
  };
}

/** Aplica a importação (numa transação, chamada pela rota). Recalcula a prévia para não depender do que a tela mandou. */
export async function aplicarImportacao(
  q: Consulta,
  linhas: LinhaImportacao[],
  o: { usuarioId: string | null; arquivo?: string; ignorados: number },
) {
  const { itens, resumo } = await previaImportacao(q, linhas);
  for (const it of itens) {
    const l = it.linha;
    if (it.acao === "igual") continue;
    if (it.acao === "unir" && it.unirCom) {
      // cria o do Cronogramas sem documento, repõe as ligações, apaga o local e só então grava o documento (índice único)
      await q(`INSERT INTO clientes (id, nome, situacao, origem, criado_por) VALUES ($1, $2, $3, 'cronogramas', $4)`, [
        l.id,
        l.nome,
        l.situacao,
        o.usuarioId,
      ]);
      await q("UPDATE orcamentos SET cliente_id = $1 WHERE cliente_id = $2", [l.id, it.unirCom.id]);
      await q("UPDATE usuarios SET cliente_id = $1 WHERE cliente_id = $2", [l.id, it.unirCom.id]);
      await q("DELETE FROM clientes WHERE id = $1", [it.unirCom.id]);
      await q("UPDATE clientes SET documento = $2 WHERE id = $1", [l.id, l.documento ?? it.unirCom.documento ?? null]);
      await propagarNome(q, l.id, l.nome);
      continue;
    }
    if (it.acao === "criar") {
      await q(
        `INSERT INTO clientes (id, nome, documento, situacao, origem, criado_por) VALUES ($1, $2, $3, $4, 'cronogramas', $5)`,
        [l.id, l.nome, l.documento, l.situacao, o.usuarioId],
      );
      continue;
    }
    // atualizar: o Cronogramas é a origem destes ids; o documento só é trocado se vier no arquivo
    await q(
      `UPDATE clientes SET nome = $2, documento = coalesce($3, documento), situacao = $4, atualizado_em = now() WHERE id = $1`,
      [l.id, l.nome, l.documento, l.situacao],
    );
    await propagarNome(q, l.id, l.nome);
  }
  await q(
    `INSERT INTO importacoes_clientes (usuario_id, arquivo, criados, atualizados, unidos, ignorados) VALUES ($1, $2, $3, $4, $5, $6)`,
    [o.usuarioId, o.arquivo ?? null, resumo.criar, resumo.atualizar, resumo.unir, o.ignorados],
  );
  return resumo;
}

// ------------------------------------------------------------ ligação dos orçamentos ao cadastro

export interface GrupoLigacao {
  chave: string;
  textos: { texto: string; orcamentos: number }[];
  orcamentos: number;
  /** cliente do cadastro com o mesmo nome normalizado */
  sugestao: { id: string; nome: string } | null;
  /** clientes do cadastro com nome parecido (para revisar) */
  parecidosCadastro: { id: string; nome: string }[];
  /** outros grupos com nome parecido (possíveis duplicados entre si) */
  parecidosGrupos: string[];
}

/** Agrupa os textos de cliente dos orçamentos ainda não ligados, sem gravar nada. */
export async function previaLigacao(q: Consulta): Promise<{ grupos: GrupoLigacao[]; semLigacao: number }> {
  const { rows } = await q<{ cliente: string; n: number }>(
    `SELECT coalesce(cliente, '') AS cliente, count(*)::int AS n FROM orcamentos WHERE cliente_id IS NULL GROUP BY 1 ORDER BY 1`,
  );
  const clientes = (await listarClientes(q)).map((c) => ({ ...c, chave: normalizarNome(c.nome) }));
  const porChave = new Map<string, GrupoLigacao>();
  for (const r of rows) {
    const chave = normalizarNome(r.cliente);
    if (!chave) continue; // orçamentos sem nome de cliente ficam de fora
    const g = porChave.get(chave) ?? {
      chave,
      textos: [],
      orcamentos: 0,
      sugestao: null,
      parecidosCadastro: [],
      parecidosGrupos: [],
    };
    g.textos.push({ texto: r.cliente, orcamentos: r.n });
    g.orcamentos += r.n;
    porChave.set(chave, g);
  }
  const grupos = [...porChave.values()];
  for (const g of grupos) {
    const igual = clientes.find((c) => c.chave === g.chave);
    g.sugestao = igual ? { id: igual.id, nome: igual.nome } : null;
    g.parecidosCadastro = clientes
      .filter((c) => c.id !== igual?.id && parecidos(c.chave, g.chave))
      .map((c) => ({ id: c.id, nome: c.nome }));
    g.parecidosGrupos = grupos.filter((o) => o !== g && parecidos(o.chave, g.chave)).map((o) => o.chave);
  }
  grupos.sort((a, b) => b.orcamentos - a.orcamentos || a.chave.localeCompare(b.chave));
  return { grupos, semLigacao: rows.reduce((t, r) => t + r.n, 0) };
}

export type DestinoLigacao = { clienteId: string } | { novo: { nome: string; documento?: string | null } } | null;

/** Liga os orçamentos dos textos de cada grupo ao destino escolhido na revisão. */
export async function aplicarLigacao(
  q: Consulta,
  grupos: { textos: string[]; destino: DestinoLigacao }[],
  usuarioId: string | null,
) {
  let ligados = 0;
  let criados = 0;
  for (const g of grupos) {
    if (!g.destino || !g.textos.length) continue;
    let id: string;
    if ("clienteId" in g.destino) {
      if (!(await lerCliente(q, g.destino.clienteId)))
        throw new ErroApi(400, "Cliente de destino não encontrado no cadastro.");
      id = g.destino.clienteId;
    } else {
      if (!g.destino.novo.nome?.trim()) throw new ErroApi(400, "Informe o nome do novo cliente.");
      id = await criarCliente(q, g.destino.novo, usuarioId, "ligacao");
      criados++;
    }
    const r = await q(
      `UPDATE orcamentos SET cliente_id = $1, atualizado_em = now() WHERE cliente_id IS NULL AND coalesce(cliente, '') = ANY($2)`,
      [id, g.textos],
    );
    ligados += r.rowCount;
    const c = await lerCliente(q, id);
    await propagarNome(q, id, c!.nome);
  }
  return { ligados, criados };
}
