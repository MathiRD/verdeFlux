export type TransactionKind = "income" | "expense";

export type RecurrenceMode =
  | "single"
  | "installments"
  | "monthly-year"
  | "monthly-open";

export type FinanceTransaction = {
  id: string;
  description: string;
  category: string;
  account: string;
  type: TransactionKind;
  amount: number;
  date: string;
  source: "Manual" | "Importado" | "Entrada rapida" | "OCR" | "Recorrente";
  recurrenceId?: string;
  recurrenceMode?: RecurrenceMode;
  recurrenceLabel?: string;
  installmentIndex?: number;
  installmentTotal?: number;
};

export type FinanceBudget = {
  category: string;
  limit: number;
  accent: string;
};

export const categories = [
  "Receita fixa",
  "Freelas",
  "Moradia",
  "Alimentacao",
  "Transporte",
  "Saude",
  "Lazer",
  "Educacao",
  "Investimentos",
  "Assinaturas",
];

export const accounts = [
  "Conta principal",
  "Carteira digital",
  "Cartao credito",
  "Reserva",
  "Investimentos",
];

export const demoBudgets: FinanceBudget[] = [
  { category: "Alimentacao", limit: 1600, accent: "#16a34a" },
  { category: "Moradia", limit: 2600, accent: "#0f766e" },
  { category: "Transporte", limit: 760, accent: "#2563eb" },
  { category: "Lazer", limit: 900, accent: "#d97706" },
  { category: "Assinaturas", limit: 340, accent: "#475569" },
];

export const demoTransactions: FinanceTransaction[] = [
  {
    id: "tx-001",
    description: "Salario mensal",
    category: "Receita fixa",
    account: "Conta principal",
    type: "income",
    amount: 8200,
    date: "2026-06-05",
    source: "Manual",
  },
  {
    id: "tx-002",
    description: "Projeto landing page",
    category: "Freelas",
    account: "Carteira digital",
    type: "income",
    amount: 1650,
    date: "2026-06-09",
    source: "Importado",
  },
  {
    id: "tx-003",
    description: "Aluguel",
    category: "Moradia",
    account: "Conta principal",
    type: "expense",
    amount: 2350,
    date: "2026-06-06",
    source: "Manual",
  },
  {
    id: "tx-004",
    description: "Mercado da semana",
    category: "Alimentacao",
    account: "Cartao credito",
    type: "expense",
    amount: 418.9,
    date: "2026-06-08",
    source: "Entrada rapida",
  },
  {
    id: "tx-005",
    description: "Uber e metro",
    category: "Transporte",
    account: "Carteira digital",
    type: "expense",
    amount: 214.5,
    date: "2026-06-10",
    source: "Importado",
  },
  {
    id: "tx-006",
    description: "Consulta odontologica",
    category: "Saude",
    account: "Cartao credito",
    type: "expense",
    amount: 320,
    date: "2026-06-11",
    source: "OCR",
  },
  {
    id: "tx-007",
    description: "Curso de dados",
    category: "Educacao",
    account: "Cartao credito",
    type: "expense",
    amount: 179.9,
    date: "2026-05-16",
    source: "Manual",
  },
  {
    id: "tx-008",
    description: "Dividendos",
    category: "Investimentos",
    account: "Investimentos",
    type: "income",
    amount: 410.35,
    date: "2026-05-20",
    source: "Importado",
  },
  {
    id: "tx-009",
    description: "Academia",
    category: "Saude",
    account: "Cartao credito",
    type: "expense",
    amount: 139.9,
    date: "2026-04-07",
    source: "Manual",
  },
  {
    id: "tx-010",
    description: "Cinema e jantar",
    category: "Lazer",
    account: "Cartao credito",
    type: "expense",
    amount: 268,
    date: "2026-04-18",
    source: "Manual",
  },
  {
    id: "tx-011",
    description: "Salario mensal",
    category: "Receita fixa",
    account: "Conta principal",
    type: "income",
    amount: 8200,
    date: "2026-05-05",
    source: "Manual",
  },
  {
    id: "tx-012",
    description: "Salario mensal",
    category: "Receita fixa",
    account: "Conta principal",
    type: "income",
    amount: 8200,
    date: "2026-04-05",
    source: "Manual",
  },
  {
    id: "tx-013",
    description: "Supermercado",
    category: "Alimentacao",
    account: "Cartao credito",
    type: "expense",
    amount: 890.65,
    date: "2026-05-11",
    source: "Importado",
  },
  {
    id: "tx-014",
    description: "Streaming e apps",
    category: "Assinaturas",
    account: "Cartao credito",
    type: "expense",
    amount: 186.7,
    date: "2026-06-02",
    source: "Importado",
  },
];

export const monthLabels = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export const categoryColors: Record<string, string> = {
  "Receita fixa": "#16a34a",
  Freelas: "#0f766e",
  Moradia: "#2563eb",
  Alimentacao: "#22c55e",
  Transporte: "#f59e0b",
  Saude: "#ef4444",
  Lazer: "#14b8a6",
  Educacao: "#475569",
  Investimentos: "#059669",
  Assinaturas: "#64748b",
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
