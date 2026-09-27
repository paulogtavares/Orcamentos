/**
 * Carga inicial de um banco novo sem db.json para importar: exatamente a mesma da v1.2.1
 * (tabela de custos da planilha H Stern – Lume, catálogo de serviços e 3 templates de exemplo).
 * Copiada da função seedDb() do server.js da v1.2.1, sem mudar ids nem valores.
 */
import type { BaseV1 } from "./tipos.js";

// Percentual de GP sobre a soma das horas (valores de exemplo — ajustáveis em Parâmetros)
export const SETTINGS_GP = { gpDedicadoPct: 25, gpCompartilhadoPct: 10 };

// ── Seed inicial (baseado na planilha H Stern – Lume) ─────────────────────────
export function sementeV1(): BaseV1 {
  const perfis = [
    { id: "pf_design", nome: "Designer", categoria: "Design", moeda: "BRL", custoHora: 85.57 },
    { id: "pf_pm", nome: "Project Manager", categoria: "Squad LATAM", moeda: "USD", custoHora: 22 },
    { id: "pf_tl", nome: "Technical Leader", categoria: "Squad LATAM", moeda: "USD", custoHora: 22 },
    { id: "pf_fe", nome: "Front-end Developer", categoria: "Squad LATAM", moeda: "USD", custoHora: 22 },
    { id: "pf_qa", nome: "Quality Assurance", categoria: "Squad LATAM", moeda: "USD", custoHora: 22 },
    { id: "pf_gp", nome: "GP + Analista 100%", categoria: "Gestão", moeda: "BRL", custoHora: 195 },
    { id: "pf_bo", nome: "Backoffice", categoria: "Operação", moeda: "BRL", custoHora: 136 },
    { id: "pf_sac", nome: "SAC", categoria: "Operação", moeda: "BRL", custoHora: 136 },
    { id: "pf_transp", nome: "Transportes", categoria: "Operação", moeda: "BRL", custoHora: 136 },
    { id: "pf_pay", nome: "Payments", categoria: "Operação", moeda: "BRL", custoHora: 136 },
  ].map((p) => ({ ...p, ativo: true }));

  const H = (id: string, nome: string, perfilId: string, area: string, grupo?: string, natureza = "setup") => ({
    id,
    nome,
    area,
    grupo: grupo || "",
    tipoCobranca: "hora",
    natureza,
    perfilId,
    unidade: "hora",
  });
  const U = (
    id: string,
    nome: string,
    area: string,
    custoUnit: number,
    unidade: string,
    natureza: string,
    tipoCobranca = "unidade",
    grupo = "",
  ) => ({
    id,
    nome,
    area,
    grupo,
    tipoCobranca,
    natureza,
    custoUnit,
    unidade,
    moeda: "BRL",
  });

  const servicos = [
    H("sv_pm", "Project Manager", "pf_pm", "Tecnologia", "Squad Dev"),
    H("sv_tl", "Technical Leader", "pf_tl", "Tecnologia", "Squad Dev"),
    H("sv_fe", "Front-end Developer", "pf_fe", "Tecnologia", "Squad Dev"),
    H("sv_qa", "Quality Assurance", "pf_qa", "Tecnologia", "Squad Dev"),
    H("sv_design", "Design", "pf_design", "Tecnologia"),
    H("sv_gp", "GP", "pf_gp", "Gestão"),
    H("sv_bo", "Backoffice", "pf_bo", "Operação"),
    H("sv_pay", "Payments", "pf_pay", "Operação"),
    H("sv_sac", "SAC", "pf_sac", "Operação"),
    H("sv_transp", "Transportes", "pf_transp", "Operação"),
    // Fulfillment (valores de exemplo — validar com Logística)
    U("sv_onb", "Onboarding e integração WMS", "Logística", 3500, "projeto", "setup", "fixo"),
    U("sv_arm", "Armazenagem", "Logística", 45, "posição-pallet", "variavel"),
    U("sv_rec", "Recebimento", "Logística", 0.35, "unidade", "variavel"),
    U("sv_pick", "Picking", "Logística", 0.9, "item", "variavel"),
    U("sv_pack", "Packing", "Logística", 2.5, "pedido", "variavel"),
    U("sv_emb", "Embalagem", "Logística", 1.8, "pedido", "variavel"),
    U("sv_exp", "Expedição", "Logística", 0.6, "pedido", "variavel"),
    // Fullcommerce (valores de exemplo)
    U("sv_gest", "Gestão de conta", "Gestão", 2500, "mês", "mensal", "fixo"),
    U("sv_lic", "Licença de plataforma", "Tecnologia", 3000, "mês", "mensal", "fixo"),
    U("sv_host", "Hospedagem e CDN", "Tecnologia", 800, "mês", "mensal", "fixo"),
    U("sv_gw", "Gateway e antifraude", "Operação", 1.2, "% GMV", "variavel", "percentual"),
  ];

  const T = (servicoId: string, qtd: number, extra: Record<string, unknown> = {}) => ({
    servicoId,
    qtd,
    qtdModo: "fixa",
    ...extra,
  });
  const P = (servicoId: string, fator: number, extra: Record<string, unknown> = {}) => ({
    servicoId,
    qtd: 0,
    qtdModo: "porPedido",
    fator,
    ...extra,
  });
  // GP em % da soma das demais horas da mesma natureza
  const G = (servicoId: string, alocacao: string, percHoras: number, extra: Record<string, unknown> = {}) => ({
    servicoId,
    qtd: 0,
    qtdModo: "percHoras",
    alocacao,
    percHoras,
    ...extra,
  });

  const templates = [
    {
      id: "tp_lume",
      nome: "Fast Template Lume – Filial",
      modelo: "projeto",
      descricao:
        "Front de loja com fast template. Réplica da planilha H Stern (Design corrigido para 80h; GP = 24,71% das horas = 126h).",
      params: { modoPreco: "markup", margem: 0.3, imposto: 0, contingencia: 0, meses: 0 },
      itens: [
        T("sv_pm", 40),
        T("sv_tl", 30),
        T("sv_fe", 160),
        T("sv_qa", 30),
        T("sv_design", 80),
        G("sv_gp", "personalizado", 24.71),
        T("sv_bo", 80),
        T("sv_pay", 10),
        T("sv_sac", 40),
        T("sv_transp", 40),
      ],
    },
    {
      id: "tp_ful",
      nome: "Fulfillment – Operação padrão",
      modelo: "fulfillment",
      descricao: "Armazenagem, recebimento, picking, packing e expedição com volume projetado.",
      params: {
        modoPreco: "margem",
        margem: 0.25,
        imposto: 0.15,
        contingencia: 0.05,
        meses: 12,
        pedidosMes: 5000,
        gmvMes: 0,
        feeGmv: 0,
      },
      itens: [
        T("sv_onb", 1),
        T("sv_gp", 40),
        T("sv_arm", 120),
        P("sv_rec", 1.5),
        P("sv_pick", 1.8),
        P("sv_pack", 1),
        P("sv_emb", 1),
        P("sv_exp", 1),
        T("sv_gest", 1),
      ],
    },
    {
      id: "tp_full",
      nome: "Fullcommerce – Loja completa",
      modelo: "fullcommerce",
      descricao: "Implantação da loja + operação ponta a ponta (backoffice, SAC, pagamentos, logística).",
      params: {
        modoPreco: "margem",
        margem: 0.28,
        imposto: 0.15,
        contingencia: 0.05,
        meses: 24,
        pedidosMes: 3000,
        gmvMes: 900000,
        feeGmv: 3,
      },
      itens: [
        T("sv_pm", 60),
        T("sv_tl", 50),
        T("sv_fe", 240),
        T("sv_qa", 50),
        T("sv_design", 120),
        G("sv_gp", "dedicado", 25),
        T("sv_bo", 160, { natureza: "mensal" }),
        T("sv_sac", 176, { natureza: "mensal" }),
        T("sv_pay", 20, { natureza: "mensal" }),
        T("sv_transp", 40, { natureza: "mensal" }),
        T("sv_lic", 1),
        T("sv_host", 1),
        T("sv_gest", 1),
        T("sv_arm", 80),
        P("sv_rec", 1.5),
        P("sv_pick", 1.6),
        P("sv_pack", 1),
        P("sv_emb", 1),
        P("sv_exp", 1),
        T("sv_gw", 1),
      ],
    },
  ];

  const agora = new Date().toISOString();
  return {
    meta: { createdAt: agora, seq: 0 },
    settings: {
      empresa: "Infracommerce",
      cambio: { usd: 5.01, fonte: "manual", atualizadoEm: agora },
      margemAlvo: 0.3,
      margemMinima: 0.2,
      impostoPadrao: 0.15,
      contingenciaPadrao: 0.05,
      modoPrecoPadrao: "margem",
      validadeDias: 30,
      ...SETTINGS_GP,
    },
    perfis,
    servicos,
    templates,
    orcamentos: [],
  };
}
