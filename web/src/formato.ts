/** Formatação e rótulos (iguais aos da v1.2.1). */
export const MODELOS: Record<string, string> = {
  projeto: "Projeto",
  fullcommerce: "Fullcommerce",
  fulfillment: "Fulfillment",
};
export const NAT = {
  setup: { nome: "Setup", longo: "implantação", cor: "var(--setup)" },
  mensal: { nome: "Mensal", longo: "recorrente fixo", cor: "var(--mensal)" },
  variavel: { nome: "Variável", longo: "por volume", cor: "var(--variavel)" },
} as const;
export type Nat = keyof typeof NAT;
export const COBRANCA: Record<string, string> = {
  hora: "Por hora",
  unidade: "Por unidade",
  fixo: "Valor fixo",
  percentual: "% sobre GMV",
};
export const ALOCACAO: Record<string, string> = {
  dedicado: "Dedicado",
  compartilhado: "Compartilhado",
  personalizado: "Personalizado",
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (n: unknown) => moeda.format(Number(n) || 0);
export const num = (n: unknown, d = 2) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const int = (n: unknown) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export const pct = (n: unknown, d = 1) => `${num((Number(n) || 0) * 100, d)}%`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const data = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T12:00` : s);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};
export const dataHora = (s?: string | null) =>
  s ? `${data(s)}, ${new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—";
export const simboloMoeda = (m?: string) => (m === "USD" ? "US$" : "R$");
export const hoje = () => new Date().toISOString().slice(0, 10);

/** CPF (11 dígitos) ou CNPJ (14) formatado; o resto como veio. */
export function documento(d?: string | null) {
  if (!d) return "—";
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}
export const ORIGEM_CLIENTE: Record<string, string> = {
  manual: "Cadastro",
  cronogramas: "Cronogramas",
  ligacao: "Ligação de orçamentos",
};
