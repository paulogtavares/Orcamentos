// @vitest-environment jsdom
/** Testes de tela: o que cada perfil vê na lista, no editor e na proposta. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { ProvedorAvisos, ProvedorSessao, type UsuarioTela } from "plataforma-kit/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { calcular } from "@orcamentos/compartilhado/calc";
import { cliente } from "../api";
import { CHAVE_BASE } from "../dados";
import type { Base, Orcamento } from "../tipos";
import { Editor } from "./Editor";
import { Lista } from "./Lista";
import { Proposta } from "./Proposta";

const itens = [
  {
    uid: "a",
    nome: "Project Manager",
    area: "Tecnologia",
    grupo: "Squad Dev",
    tipoCobranca: "hora",
    natureza: "setup",
    moeda: "USD",
    custoUnit: 22,
    qtd: 40,
    qtdModo: "fixa",
    perfilNome: "Project Manager",
  },
  {
    uid: "b",
    nome: "Front-end",
    area: "Tecnologia",
    grupo: "Squad Dev",
    tipoCobranca: "hora",
    natureza: "setup",
    moeda: "USD",
    custoUnit: 22,
    qtd: 160,
    qtdModo: "fixa",
    perfilNome: "Front-end Developer",
  },
  {
    uid: "c",
    nome: "SAC",
    area: "Operação",
    tipoCobranca: "hora",
    natureza: "setup",
    moeda: "BRL",
    custoUnit: 136,
    qtd: 40,
    qtdModo: "fixa",
    perfilNome: "SAC",
  },
];
const params = { modoPreco: "markup", margem: 0.3, imposto: 0, contingencia: 0, meses: 0 };
const c = calcular({ itens, params, cambio: 5.01 });
const orcCompleto: Orcamento = {
  id: "orc_1",
  numero: "ORC-2026-0001",
  cliente: "H Stern",
  projeto: "Lume – Filial",
  modelo: "projeto",
  responsavel: "Ana",
  status: "rascunho",
  validade: "2026-10-31",
  templateId: null,
  cambio: 5.01,
  params,
  premissas: "Escopo X",
  itens: itens as Orcamento["itens"],
  versoes: [],
  historico: [{ data: "2026-09-28T10:00:00.000Z", acao: "Criado em branco", por: "Ana" }],
  criadoEm: "2026-09-28T10:00:00.000Z",
  atualizadoEm: "2026-09-28T10:00:00.000Z",
  resumo: {
    setup: c.setup,
    mensal: c.mensal,
    tcv: c.tcv,
    custoTotal: c.custoTotal,
    margemReal: c.margemReal,
    horas: c.horasSetup,
  },
};
/** O que a API entrega a quem não vê custos (visibilidade.ts do servidor). */
const orcPublico: Orcamento = {
  ...orcCompleto,
  params: { imposto: 0, meses: 0 },
  itens: orcCompleto.itens.map((i, k) => ({
    ...i,
    custoUnit: undefined,
    preco: Math.round(c.linhas[k].preco * 100) / 100,
  })),
  resumo: { setup: c.setup, mensal: c.mensal, tcv: c.tcv, horas: c.horasSetup },
};
const base = (o: Orcamento, veCustos: boolean): Base => ({
  meta: {},
  settings: {
    empresa: "Infracommerce",
    cambio: { usd: 5.01 },
    margemMinima: 0.25,
    gpDedicadoPct: 25,
    gpCompartilhadoPct: 10,
  },
  perfis: veCustos ? [{ id: "pf_pm", nome: "Project Manager", categoria: "Squad", moeda: "USD", custoHora: 22 }] : [],
  servicos: [],
  templates: [],
  orcamentos: [o],
});
const usuario = (permissoes: string[]): UsuarioTela => ({
  id: "u",
  nome: "Teste",
  email: "t@x.com",
  tipo: "interno",
  permissoes,
});

function montar(caminho: string, b: Base, permissoes: string[]) {
  const qc = new QueryClient();
  qc.setQueryData(CHAVE_BASE, b);
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <QueryClientProvider client={qc}>
        <ProvedorAvisos>
          <ProvedorSessao cliente={cliente} fixo={{ usuario: usuario(permissoes), carregando: false }}>
            <Routes>
              <Route path="/" element={<Lista />} />
              <Route path="/orcamentos/:id" element={<Editor />} />
              <Route path="/orcamentos/:id/proposta" element={<Proposta />} />
            </Routes>
          </ProvedorSessao>
        </ProvedorAvisos>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
afterEach(cleanup);
const TODAS = [
  "orcamentos.ver",
  "orcamentos.editar",
  "orcamentos.aprovar",
  "orcamentos.custos.ver",
  "orcamentos.custos.gerenciar",
  "orcamentos.templates.gerenciar",
];
const COMERCIAL = ["orcamentos.ver", "orcamentos.editar"];
const tcv = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.tcv);

describe("lista", () => {
  it("quem vê custos vê a margem e as abas de custos", () => {
    const { container } = montar("/", base(orcCompleto, true), TODAS);
    expect(screen.getByText("Margem média")).toBeTruthy();
    expect(screen.getByText("Custos e parâmetros")).toBeTruthy();
    expect(container.textContent).toContain(tcv);
  });
  it("comercial não vê margem nem as abas de custos", () => {
    const { container } = montar("/", base(orcPublico, false), COMERCIAL);
    expect(screen.queryByText("Margem média")).toBeNull();
    expect(screen.queryByText("Margem")).toBeNull();
    expect(screen.queryByText("Custos e parâmetros")).toBeNull();
    expect(screen.queryByText("Serviços")).toBeNull();
    expect(container.textContent).toContain(tcv);
  });
});

describe("editor", () => {
  it("quem vê custos: colunas de custo, margem real e resumo completo", () => {
    montar("/orcamentos/orc_1", base(orcCompleto, true), TODAS);
    expect(screen.getByText("Custo unit.")).toBeTruthy();
    expect(screen.getByText("Margem real")).toBeTruthy();
    expect(screen.getByText("Custo total")).toBeTruthy();
    expect(screen.getByText("Enviar para aprovação")).toBeTruthy();
  });
  it("comercial: sem custo, sem margem, preço por linha do servidor, sem Aprovar", () => {
    const { container } = montar("/orcamentos/orc_1", base(orcPublico, false), COMERCIAL);
    expect(screen.queryByText("Custo unit.")).toBeNull();
    expect(screen.queryByText("Margem real")).toBeNull();
    expect(screen.queryByText("Custo total")).toBeNull();
    expect(screen.queryByText("Markup %")).toBeNull();
    expect(container.textContent).toContain(tcv);
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });
  it("somente leitura para quem não edita; em aprovação, quem aprova vê Aprovar", () => {
    montar("/orcamentos/orc_1", base({ ...orcCompleto, status: "em_aprovacao" }, true), [
      "orcamentos.ver",
      "orcamentos.aprovar",
      "orcamentos.custos.ver",
    ]);
    expect(screen.getByText(/Somente leitura/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeTruthy();
    expect((screen.getAllByLabelText("Horas")[0] as HTMLInputElement).disabled).toBe(true);
  });
  it("enviado: bloqueado para edição", () => {
    montar("/orcamentos/orc_1", base({ ...orcCompleto, status: "enviado" }, true), TODAS);
    expect(screen.getByText(/bloqueado para edição/)).toBeTruthy();
  });
});

describe("precificação inválida (v2.0.0)", () => {
  it("margem + imposto = 100% mostra o aviso no editor", () => {
    montar(
      "/orcamentos/orc_1",
      base({ ...orcCompleto, params: { modoPreco: "margem", margem: 0.7, imposto: 0.3 } }, true),
      TODAS,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Margem \+ imposto precisa ser menor que 100%/);
  });
});

describe("proposta", () => {
  it("visão do cliente: grupo somado (Squad Dev), sem custo nem margem, mesmo total para os dois perfis", () => {
    const a = montar("/orcamentos/orc_1/proposta", base(orcCompleto, true), TODAS);
    const textoA = a.container.querySelector(".folha")!.textContent!;
    cleanup();
    const b = montar("/orcamentos/orc_1/proposta", base(orcPublico, false), COMERCIAL);
    const textoB = b.container.querySelector(".folha")!.textContent!;
    for (const t of [textoA, textoB]) {
      expect(t).toContain("Squad Dev");
      expect(t).toContain("200 h");
      expect(t).not.toMatch(/Custo|Margem|custo|margem/);
      expect(t).toContain(tcv);
    }
    expect(textoB.replace(/Emitida em [^V]+/, "")).toBe(textoA.replace(/Emitida em [^V]+/, ""));
  });
});
