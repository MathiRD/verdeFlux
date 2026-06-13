"use client";

import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { signIn, signOut, useSession } from "next-auth/react";
import Swal from "sweetalert2";
import {
  ArrowDownToLine,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  LogIn,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Receipt,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import Papa from "papaparse";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import {
  accounts,
  categories,
  categoryColors,
  demoBudgets,
  FinanceTransaction,
  formatCurrency,
  formatPercent,
  monthLabels,
  normalizeText,
  RecurrenceMode,
  TransactionKind,
} from "@/lib/finance-demo";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
const currentYear = today.slice(0, 4);

type DraftTransaction = {
  description: string;
  category: string;
  account: string;
  type: TransactionKind;
  amount: string;
  date: string;
  recurrenceMode: RecurrenceMode;
  installmentCount: number;
};

type ImportedRow = Record<string, string | number | boolean | Date | null>;

const initialDraft: DraftTransaction = {
  description: "",
  category: "Alimentacao",
  account: "Conta principal",
  type: "expense",
  amount: "",
  date: today,
  recurrenceMode: "single",
  installmentCount: 3,
};

const recurrenceOptions: Array<{
  mode: RecurrenceMode;
  label: string;
}> = [
  { mode: "single", label: "Unico" },
  { mode: "installments", label: "Parcelado" },
  { mode: "monthly-year", label: "Fixo anual" },
  { mode: "monthly-open", label: "Indefinido" },
];

const quickCategoryRules = [
  { category: "Alimentacao", words: ["mercado", "restaurante", "ifood", "lanche", "cafe", "padaria"] },
  { category: "Transporte", words: ["uber", "99", "metro", "onibus", "gasolina", "posto"] },
  { category: "Moradia", words: ["aluguel", "condominio", "luz", "agua", "internet"] },
  { category: "Saude", words: ["farmacia", "consulta", "medico", "dentista", "exame"] },
  { category: "Lazer", words: ["cinema", "show", "bar", "jantar", "viagem"] },
  { category: "Educacao", words: ["curso", "livro", "faculdade", "aula"] },
  { category: "Investimentos", words: ["tesouro", "cdb", "acao", "dividendo", "aporte"] },
  { category: "Assinaturas", words: ["netflix", "spotify", "prime", "assinatura", "app"] },
];

const incomeWords = ["salario", "recebi", "pix recebido", "freela", "bonus", "dividendo", "reembolso"];

function sumTransactions(transactions: FinanceTransaction[], type?: TransactionKind) {
  return transactions
    .filter((transaction) => (type ? transaction.type === type : true))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function parseAmount(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function splitInstallmentAmount(totalAmount: number, installments: number, index: number) {
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;
  const installmentCents = baseCents + (index < remainder ? 1 : 0);

  return installmentCents / 100;
}

function formatIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addMonths(isoDate: string, months: number) {
  const base = new Date(`${isoDate}T12:00:00`);
  const target = new Date(base);
  const originalDay = base.getDate();

  target.setDate(1);
  target.setMonth(base.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return formatIsoDate(target);
}

function monthsUntilYearEnd(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return 12 - date.getMonth();
}

function getOccurrenceCount(draft: DraftTransaction) {
  if (draft.recurrenceMode === "installments") {
    return Math.max(2, Math.min(60, draft.installmentCount || 2));
  }

  if (draft.recurrenceMode === "monthly-year") {
    return monthsUntilYearEnd(draft.date);
  }

  if (draft.recurrenceMode === "monthly-open") {
    return 12;
  }

  return 1;
}

function getRecurrenceLabel(mode: RecurrenceMode, index: number, total: number) {
  if (mode === "installments") {
    return `Parcela ${index}/${total}`;
  }

  if (mode === "monthly-year") {
    return `Fixo anual ${index}/${total}`;
  }

  if (mode === "monthly-open") {
    return `Indefinido ${index}/${total}`;
  }

  return undefined;
}

function mapImportedRow(row: ImportedRow): FinanceTransaction | null {
  const rawType = normalizeText(String(row.tipo ?? row.type ?? row.natureza ?? "expense"));
  const amount = parseAmount(row.valor ?? row.amount ?? row.value);
  const description = String(row.descricao ?? row.description ?? row.nome ?? "Lancamento importado").trim();
  const date = String(row.data ?? row.date ?? row.occurredAt ?? today).slice(0, 10);

  if (!amount || !description) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    description,
    category: String(row.categoria ?? row.category ?? "Alimentacao"),
    account: String(row.conta ?? row.account ?? "Conta principal"),
    type:
      rawType.includes("receita") ||
      rawType.includes("entrada") ||
      rawType.includes("income")
        ? "income"
        : "expense",
    amount,
    date,
    source: "Importado",
  };
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function exportRows(transactions: FinanceTransaction[]) {
  return transactions.map((transaction) => ({
    descricao: transaction.description,
    categoria: transaction.category,
    conta: transaction.account,
    tipo: transaction.type === "income" ? "receita" : "despesa",
    valor: transaction.amount,
    data: transaction.date,
    origem: transaction.source,
    recorrencia: transaction.recurrenceLabel ?? "",
    grupo_recorrencia: transaction.recurrenceId ?? "",
  }));
}

function ScrollPath() {
  return (
    <motion.svg
      aria-hidden="true"
      className="absolute left-0 top-0 h-full w-full opacity-45"
      fill="none"
      viewBox="0 0 1200 320"
      preserveAspectRatio="none"
    >
      <motion.path
        d="M-60 260 C 140 120, 260 320, 430 180 S 760 50, 900 160 1060 290, 1240 130"
        stroke="#16a34a"
        strokeLinecap="round"
        strokeWidth="3"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
      />
      <motion.path
        d="M-40 120 C 180 60, 300 210, 520 90 S 860 230, 1260 80"
        stroke="#0f766e"
        strokeDasharray="8 18"
        strokeLinecap="round"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        transition={{ duration: 1.8, ease: "easeOut", delay: 0.15 }}
      />
    </motion.svg>
  );
}

export default function FinanceExperience() {
  const { data: session, status } = useSession();
  const [booting, setBooting] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scope, setScope] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [draft, setDraft] = useState<DraftTransaction>(initialDraft);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState("");
  const [quickEntry, setQuickEntry] = useState("");
  const [quickFeedback, setQuickFeedback] = useState("");
  const [importFeedback, setImportFeedback] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transactionFormRef = useRef<HTMLDivElement>(null);
  const isAuthed = status === "authenticated";
  const userStorageKey = session?.user?.id
    ? `verdeflux-transactions-${session.user.id}`
    : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 950);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    const hydrationTimer = window.setTimeout(() => {
      if (!userStorageKey) {
        setTransactions([]);
        return;
      }

      const savedTransactions = window.localStorage.getItem(userStorageKey);

      if (!savedTransactions) {
        setTransactions([]);
        return;
      }

      try {
        setTransactions(JSON.parse(savedTransactions) as FinanceTransaction[]);
      } catch {
        setTransactions([]);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [status, userStorageKey]);

  useEffect(() => {
    if (!booting && userStorageKey) {
      window.localStorage.setItem(userStorageKey, JSON.stringify(transactions));
    }
  }, [booting, transactions, userStorageKey]);

  const filteredTransactions = useMemo(() => {
    if (scope === "year") {
      return transactions.filter((transaction) => transaction.date.startsWith(currentYear));
    }

    return transactions.filter((transaction) => transaction.date.startsWith(selectedMonth));
  }, [scope, selectedMonth, transactions]);

  const income = useMemo(() => sumTransactions(filteredTransactions, "income"), [filteredTransactions]);
  const expenses = useMemo(() => sumTransactions(filteredTransactions, "expense"), [filteredTransactions]);
  const balance = income - expenses;
  const savingsRate = income > 0 ? (balance / income) * 100 : 0;

  const monthlySeries = useMemo(() => {
    return monthLabels.map((label, index) => {
      const month = `${currentYear}-${String(index + 1).padStart(2, "0")}`;
      const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(month));

      return {
        mes: label,
        receitas: sumTransactions(monthTransactions, "income"),
        despesas: sumTransactions(monthTransactions, "expense"),
        saldo: sumTransactions(monthTransactions, "income") - sumTransactions(monthTransactions, "expense"),
      };
    });
  }, [transactions]);

  const categorySeries = useMemo(() => {
    const grouped = new Map<string, number>();

    filteredTransactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        grouped.set(transaction.category, (grouped.get(transaction.category) ?? 0) + transaction.amount);
      });

    return Array.from(grouped.entries())
      .map(([name, value]) => ({ name, value, color: categoryColors[name] ?? "#16a34a" }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const budgetRows = useMemo(() => {
    return demoBudgets.map((budget) => {
      const spent = filteredTransactions
        .filter((transaction) => transaction.type === "expense" && transaction.category === budget.category)
        .reduce((total, transaction) => total + transaction.amount, 0);

      return {
        ...budget,
        spent,
        percentage: Math.min(100, budget.limit > 0 ? (spent / budget.limit) * 100 : 0),
      };
    });
  }, [filteredTransactions]);

  const latestTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [transactions]);

  const draftOccurrenceCount = getOccurrenceCount(draft);
  const draftAmount = parseAmount(draft.amount);
  const installmentPreviewAmount =
    draft.recurrenceMode === "installments" && draftOccurrenceCount > 1
      ? draftAmount / draftOccurrenceCount
      : draftAmount;
  const selectedReportYear = Number(selectedMonth.slice(0, 4));
  const selectedReportMonthIndex = Number(selectedMonth.slice(5, 7)) - 1;

  function openAuth(mode: "login" | "signup") {
    setAuthMode(mode);
    setAuthOpen(true);
    setMobileOpen(false);
  }

  function finishAuth() {
    setAuthOpen(false);
    transactionFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelEdit() {
    setEditingTransactionId(null);
    setDraft(initialDraft);
    setDraftFeedback("");
  }

  function editTransaction(transaction: FinanceTransaction) {
    setEditingTransactionId(transaction.id);
    setDraft({
      description: transaction.description.replace(/\s\(\d+\/\d+\)$/, ""),
      category: transaction.category,
      account: transaction.account,
      type: transaction.type,
      amount: transaction.amount.toFixed(2).replace(".", ","),
      date: transaction.date,
      recurrenceMode: "single",
      installmentCount: transaction.installmentTotal ?? 3,
    });
    setDraftFeedback(
      transaction.recurrenceId
        ? "Editando apenas este lancamento da recorrencia."
        : "Editando lancamento.",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteTransaction(transactionId: string) {
    const result = await Swal.fire({
      title: "Excluir lançamento?",
      text: "Você tem certeza que deseja excluir este lançamento?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sim, excluir",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#be123c",
      cancelButtonColor: "#047857",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    setTransactions((current) =>
      current.filter((transaction) => transaction.id !== transactionId),
    );

    if (editingTransactionId === transactionId) {
      cancelEdit();
    }
  }

  async function deleteRecurrence(recurrenceId: string) {
    const result = await Swal.fire({
      title: "Excluir toda a série?",
      text: "Você tem certeza que deseja excluir toda a série? Essa ação remove todos os lançamentos vinculados.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sim, excluir série",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#be123c",
      cancelButtonColor: "#047857",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    setTransactions((current) =>
      current.filter((transaction) => transaction.recurrenceId !== recurrenceId),
    );

    const editingTransaction = transactions.find(
      (transaction) => transaction.id === editingTransactionId,
    );

    if (editingTransaction?.recurrenceId === recurrenceId) {
      cancelEdit();
    }
  }

  function addTransaction() {
    const amount = parseAmount(draft.amount);

    if (!draft.description.trim() || amount <= 0) {
      setDraftFeedback("Preencha descricao e valor.");
      return;
    }

    if (editingTransactionId) {
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === editingTransactionId
            ? {
                ...transaction,
                description: draft.description.trim(),
                category: draft.category,
                account: draft.account,
                type: draft.type,
                amount,
                date: draft.date,
              }
            : transaction,
        ),
      );
      setEditingTransactionId(null);
      setDraft(initialDraft);
      setDraftFeedback("Lancamento atualizado.");
      return;
    }

    const occurrenceCount = getOccurrenceCount(draft);
    const recurrenceId =
      occurrenceCount > 1 ? crypto.randomUUID() : undefined;
    const baseDescription = draft.description.trim();
    const createdTransactions = Array.from({ length: occurrenceCount }).map(
      (_, index) => {
        const installmentIndex = index + 1;
        const recurrenceLabel = getRecurrenceLabel(
          draft.recurrenceMode,
          installmentIndex,
          occurrenceCount,
        );

        return {
        id: crypto.randomUUID(),
        description:
          draft.recurrenceMode === "installments"
            ? `${baseDescription} (${installmentIndex}/${occurrenceCount})`
            : baseDescription,
        category: draft.category,
        account: draft.account,
        type: draft.type,
        amount:
          draft.recurrenceMode === "installments"
            ? splitInstallmentAmount(amount, occurrenceCount, index)
            : amount,
        date: addMonths(draft.date, index),
        source: occurrenceCount > 1 ? "Recorrente" : "Manual",
        recurrenceId,
        recurrenceMode:
          occurrenceCount > 1 ? draft.recurrenceMode : undefined,
        recurrenceLabel,
        installmentIndex:
          occurrenceCount > 1 ? installmentIndex : undefined,
        installmentTotal:
          occurrenceCount > 1 ? occurrenceCount : undefined,
      } satisfies FinanceTransaction;
      },
    );

    setTransactions((current) => [...createdTransactions, ...current]);
    setDraftFeedback(
      draft.recurrenceMode === "installments"
        ? `${formatCurrency(amount)} dividido em ${occurrenceCount} parcelas.`
        : occurrenceCount > 1
        ? `${occurrenceCount} lancamentos mensais criados.`
        : "Lancamento criado.",
    );
    setDraft(initialDraft);
  }

  function addQuickEntry() {
    const normalized = normalizeText(quickEntry);
    const amountMatch = quickEntry.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : 0;

    if (!quickEntry.trim() || amount <= 0) {
      setQuickFeedback("Informe algo como: mercado 42,90 alimentacao");
      return;
    }

    const matchedRule = quickCategoryRules.find((rule) =>
      rule.words.some((word) => normalized.includes(word)),
    );
    const isIncome = incomeWords.some((word) => normalized.includes(word));
    const description =
      quickEntry.replace(amountMatch?.[0] ?? "", "").replace(/\s+/g, " ").trim() ||
      "Lancamento rapido";

    setTransactions((current) => [
      {
        id: crypto.randomUUID(),
        description,
        category: isIncome ? "Receita fixa" : matchedRule?.category ?? "Alimentacao",
        account: "Carteira digital",
        type: isIncome ? "income" : "expense",
        amount,
        date: today,
        source: "Entrada rapida",
      },
      ...current,
    ]);
    setQuickEntry("");
    setQuickFeedback("Lancamento salvo no painel.");
  }

  function exportJson() {
    const payload = {
      app: "VerdeFlux",
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      budgets: demoBudgets,
    };

    downloadBlob(
      `verdeflux-${today}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
  }

  function exportCsv() {
    const csv = Papa.unparse(exportRows(transactions));
    downloadBlob(`verdeflux-${today}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  function exportXlsx() {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(exportRows(transactions));
    XLSX.utils.book_append_sheet(workbook, sheet, "Transacoes");
    XLSX.writeFile(workbook, `verdeflux-${today}.xlsx`);
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    let imported: FinanceTransaction[] = [];

    try {
      if (extension === "json") {
        const data = JSON.parse(await file.text()) as
          | { transactions?: ImportedRow[] }
          | ImportedRow[];
        const rows = Array.isArray(data) ? data : data.transactions ?? [];
        imported = rows.map(mapImportedRow).filter(Boolean) as FinanceTransaction[];
      }

      if (extension === "csv") {
        const parsed = Papa.parse<ImportedRow>(await file.text(), {
          header: true,
          skipEmptyLines: true,
        });
        imported = parsed.data.map(mapImportedRow).filter(Boolean) as FinanceTransaction[];
      }

      if (extension === "xlsx" || extension === "xls") {
        const workbook = XLSX.read(await file.arrayBuffer());
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ImportedRow>(firstSheet);
        imported = rows.map(mapImportedRow).filter(Boolean) as FinanceTransaction[];
      }

      if (!imported.length) {
        setImportFeedback("Nenhum lancamento valido foi encontrado.");
        return;
      }

      setTransactions((current) => [...imported, ...current]);
      setImportFeedback(`${imported.length} lancamento(s) importado(s).`);
    } catch {
      setImportFeedback("Nao consegui ler esse arquivo.");
    }
  }

  if (isAuthed) {
    return (
      <main className="min-h-screen bg-[#f5faf6] text-slate-950">
        <Preloader visible={booting} />
        <DashboardHeader
          onLogout={() => {
            setTransactions([]);
            void signOut({ redirect: false });
          }}
        />
        <section id="report-surface" className="print-surface mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-14 pt-24 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Painel financeiro</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Controle mensal e anual com dados prontos para exportar.
              </h1>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <button
                onClick={() => setScope("month")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scope === "month" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 shadow-sm"
                }`}
              >
                Mensal
              </button>
              <button
                onClick={() => setScope("year")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scope === "year" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 shadow-sm"
                }`}
              >
                Anual
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setReportPickerOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:ring-2 hover:ring-emerald-100"
                  aria-expanded={reportPickerOpen}
                  aria-haspopup="dialog"
                >
                  <Calendar className="h-4 w-4 text-emerald-700" />
                  {selectedMonth}
                </button>
                <AnimatePresence>
                  {reportPickerOpen ? (
                    <motion.div
                      className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-emerald-100 bg-white p-3 shadow-2xl shadow-emerald-950/10"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      role="dialog"
                      aria-label="Selecionar mes do relatorio"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMonth(`${selectedReportYear - 1}-${String(selectedReportMonthIndex + 1).padStart(2, "0")}`)
                          }
                          className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                          aria-label="Ano anterior"
                        >
                          <ChevronRight className="h-4 w-4 rotate-180" />
                        </button>
                        <strong className="text-sm font-bold text-slate-900">
                          {selectedReportYear}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMonth(`${selectedReportYear + 1}-${String(selectedReportMonthIndex + 1).padStart(2, "0")}`)
                          }
                          className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                          aria-label="Proximo ano"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {monthLabels.map((label, index) => {
                          const monthValue = `${selectedReportYear}-${String(index + 1).padStart(2, "0")}`;
                          const active = selectedMonth === monthValue;

                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => {
                                setSelectedMonth(monthValue);
                                setScope("month");
                                setReportPickerOpen(false);
                              }}
                              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                active
                                  ? "bg-emerald-700 text-white"
                                  : "bg-emerald-50 text-slate-700 hover:bg-emerald-100"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={TrendingUp}
              label="Receitas"
              value={formatCurrency(income)}
              tone="emerald"
              caption={`${filteredTransactions.filter((item) => item.type === "income").length} entradas`}
            />
            <MetricCard
              icon={TrendingDown}
              label="Despesas"
              value={formatCurrency(expenses)}
              tone="amber"
              caption={`${filteredTransactions.filter((item) => item.type === "expense").length} saidas`}
            />
            <MetricCard
              icon={Wallet}
              label="Saldo"
              value={formatCurrency(balance)}
              tone="teal"
              caption={balance >= 0 ? "Acima do planejado" : "Precisa de ajuste"}
            />
            <MetricCard
              icon={BarChart3}
              label="Economia"
              value={formatPercent(savingsRate)}
              tone="slate"
              caption="Receita preservada"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
            <Panel title="Fluxo anual" icon={BarChart3}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlySeries} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="income" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expense" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#dbe7df" strokeDasharray="4 6" />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      tickFormatter={(value) => `${Number(value) / 1000}k`}
                    />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Area type="monotone" dataKey="receitas" stroke="#16a34a" fill="url(#income)" strokeWidth={3} />
                    <Area type="monotone" dataKey="despesas" stroke="#f59e0b" fill="url(#expense)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Categorias" icon={CircleDollarSign}>
              {categorySeries.length ? (
                <div className="grid gap-4 sm:grid-cols-[0.9fr_1fr] xl:grid-cols-1">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categorySeries} dataKey="value" innerRadius={62} outerRadius={94} paddingAngle={4}>
                          {categorySeries.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {categorySeries.slice(0, 5).map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="truncate">{entry.name}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-950">{formatCurrency(entry.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                    <CircleDollarSign className="h-6 w-6" />
                  </div>
                  <p className="mt-4 font-bold text-slate-950">
                    Nenhuma despesa neste periodo
                  </p>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
                    Adicione uma despesa ou escolha outro mes para ver a distribuicao por categoria.
                  </p>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div ref={transactionFormRef} className="scroll-mt-24">
              <Panel title={editingTransactionId ? "Editar lancamento" : "Novo lancamento"} icon={Plus}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {editingTransactionId ? (
                    <div className="sm:col-span-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      Voce esta alterando um lancamento existente. Para recorrencias, a alteracao vale apenas para o item selecionado.
                    </div>
                  ) : null}
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
                  Descricao
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                    className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                    placeholder="Mercado, salario, aluguel..."
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  {!editingTransactionId && draft.recurrenceMode === "installments" ? "Valor total" : "Valor"}
                  <input
                    value={draft.amount}
                    inputMode="decimal"
                    onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                    className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                    placeholder="0,00"
                  />
                  {!editingTransactionId && draft.recurrenceMode === "installments" ? (
                    <span className="text-xs font-semibold text-emerald-700">
                      Informe o total da compra; ele sera dividido pelas parcelas.
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Data
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                    className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Categoria
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                    className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Conta
                  <select
                    value={draft.account}
                    onChange={(event) => setDraft((current) => ({ ...current, account: event.target.value }))}
                    className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                  >
                    {accounts.map((account) => (
                      <option key={account}>{account}</option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    onClick={() => setDraft((current) => ({ ...current, type: "expense" }))}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      draft.type === "expense" ? "bg-slate-950 text-white" : "bg-emerald-50 text-slate-700"
                    }`}
                  >
                    Despesa
                  </button>
                  <button
                    onClick={() => setDraft((current) => ({ ...current, type: "income" }))}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      draft.type === "income" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-slate-700"
                    }`}
                  >
                    Receita
                  </button>
                </div>
                {!editingTransactionId ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 sm:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800">
                      Recorrencia
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">
                      {draftOccurrenceCount}x
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {recurrenceOptions.map((option) => (
                      <button
                        key={option.mode}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            recurrenceMode: option.mode,
                          }))
                        }
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          draft.recurrenceMode === option.mode
                            ? "bg-emerald-700 text-white"
                            : "bg-white text-slate-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {draft.recurrenceMode === "installments" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.3fr]">
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        Parcelas
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={draft.installmentCount}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              installmentCount: Number(event.target.value),
                            }))
                          }
                          className="h-11 rounded-xl border border-emerald-100 bg-white px-3 text-slate-950 outline-none transition focus:border-emerald-500"
                        />
                      </label>
                      <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700">
                        <span className="block text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                          Divisao automatica
                        </span>
                        <strong className="mt-1 block text-slate-950">
                          {draftAmount > 0
                            ? `${formatCurrency(draftAmount)} em ${draftOccurrenceCount}x de aprox. ${formatCurrency(installmentPreviewAmount)}`
                            : "Digite o valor total da compra"}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {draft.recurrenceMode !== "single" ? (
                    <p className="mt-3 text-sm font-medium text-emerald-800">
                      Primeira em {new Date(`${draft.date}T12:00:00`).toLocaleDateString("pt-BR")}
                    </p>
                  ) : null}
                </div>
                ) : null}
                <button
                  onClick={addTransaction}
                  className="sm:col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800"
                >
                  <Plus className="h-4 w-4" />
                  {editingTransactionId
                    ? "Salvar alterações"
                    : draft.recurrenceMode === "installments"
                    ? `Adicionar ${draftOccurrenceCount} parcelas`
                    : `Adicionar ${draftOccurrenceCount > 1 ? `${draftOccurrenceCount}x` : ""}`}
                </button>
                {editingTransactionId ? (
                  <button
                    onClick={cancelEdit}
                    className="sm:col-span-2 inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-emerald-300"
                  >
                    Cancelar edição
                  </button>
                ) : null}
                {draftFeedback ? (
                  <p className="sm:col-span-2 text-sm font-medium text-emerald-700">
                    {draftFeedback}
                  </p>
                ) : null}
              </div>
              </Panel>
            </div>

            <Panel title="Entrada rapida" icon={MessageCircle}>
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">Texto livre, sem API paga</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    O parser local identifica valor, categoria provavel e tipo. Depois ele pode virar ponte com Telegram, WhatsApp manual ou OCR.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={quickEntry}
                    onChange={(event) => setQuickEntry(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addQuickEntry();
                      }
                    }}
                    className="h-12 flex-1 rounded-xl border border-emerald-100 bg-white px-4 text-slate-950 outline-none transition focus:border-emerald-500"
                    placeholder="mercado 42,90 cartao"
                  />
                  <button
                    onClick={addQuickEntry}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    <Sparkles className="h-4 w-4" />
                    Salvar
                  </button>
                </div>
                {quickFeedback ? <p className="text-sm font-medium text-emerald-700">{quickFeedback}</p> : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["WhatsApp", "atalho manual"],
                    ["Foto", "OCR futuro"],
                    ["Nota fiscal", "importacao"],
                  ].map(([title, text]) => (
                    <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 text-sm text-slate-500">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Panel title="Orcamentos" icon={ShieldCheck}>
              <div className="space-y-4">
                {budgetRows.map((budget) => (
                  <div key={budget.category}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-800">{budget.category}</span>
                      <span className="font-medium text-slate-600">
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: budget.accent }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${budget.percentage}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Relatorios e portabilidade" icon={Database}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                onChange={handleImportFile}
                className="hidden"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ActionButton icon={FileJson} label="Exportar JSON" onClick={exportJson} />
                <ActionButton icon={Table2} label="Exportar CSV" onClick={exportCsv} />
                <ActionButton icon={FileSpreadsheet} label="Exportar Excel" onClick={exportXlsx} />
                <ActionButton icon={Upload} label="Importar arquivo" onClick={() => fileInputRef.current?.click()} />
                <ActionButton icon={Printer} label="PDF / imprimir" onClick={() => window.print()} />
                <ActionButton icon={Download} label="Backup completo" onClick={exportJson} />
              </div>
              {importFeedback ? <p className="mt-4 text-sm font-medium text-emerald-700">{importFeedback}</p> : null}
              <div className="mt-5 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 6" />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="saldo" fill="#16a34a" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Ultimos lancamentos" icon={Receipt}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-3 py-2">Descricao</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Conta</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransactions.length ? latestTransactions.map((transaction) => (
                    <tr key={transaction.id} className="rounded-xl bg-white shadow-sm">
                      <td className="rounded-l-xl px-3 py-3">
                        <div className="font-semibold text-slate-950">{transaction.description}</div>
                        <div className="text-xs text-slate-500">
                          {transaction.source}
                          {transaction.recurrenceLabel
                            ? ` · ${transaction.recurrenceLabel}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">{transaction.category}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{transaction.account}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {new Date(`${transaction.date}T12:00:00`).toLocaleDateString("pt-BR")}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-bold ${
                          transaction.type === "income" ? "text-emerald-700" : "text-slate-950"
                        }`}
                      >
                        {transaction.type === "income" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="rounded-r-xl px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editTransaction(transaction)}
                            className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                            aria-label="Editar lancamento"
                            title="Editar lancamento"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteTransaction(transaction.id)}
                            className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                            aria-label="Excluir lancamento"
                            title="Excluir lancamento"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {transaction.recurrenceId ? (
                            <button
                              type="button"
                              onClick={() => void deleteRecurrence(transaction.recurrenceId!)}
                              className="rounded-full border border-rose-100 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                              title="Excluir toda a recorrencia"
                            >
                              serie
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="rounded-xl bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhum lancamento cadastrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <Preloader visible={booting || status === "loading"} />
      <LandingHeader
        mobileOpen={mobileOpen}
        onMobile={() => setMobileOpen((open) => !open)}
        onLogin={() => openAuth("login")}
        onSignup={() => openAuth("signup")}
      />
      <Hero onSignup={() => openAuth("signup")} onLogin={() => openAuth("login")} />
      <LandingSections onSignup={() => openAuth("signup")} />
      <AuthDialog
        mode={authMode}
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onMode={setAuthMode}
        onFinish={finishAuth}
      />
    </main>
  );
}

function Preloader({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <div
          className="preloader-shell fixed inset-0 z-[100] grid place-items-center bg-white"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-50">
              <motion.div
                className="absolute inset-1 rounded-full border-2 border-emerald-600 border-r-transparent"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <Wallet className="h-8 w-8 text-emerald-700" />
            </div>
            <p className="text-sm font-semibold tracking-[0.28em] text-emerald-700">VERDEFLUX</p>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function LandingHeader({
  mobileOpen,
  onMobile,
  onLogin,
  onSignup,
}: {
  mobileOpen: boolean;
  onMobile: () => void;
  onLogin: () => void;
  onSignup: () => void;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 border-b border-emerald-100/70 bg-white/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2 font-bold text-slate-950">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white">
            <Wallet className="h-5 w-5" />
          </span>
          VerdeFlux
        </a>
        <div className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
          <a href="#metricas" className="transition hover:text-emerald-700">
            Metricas
          </a>
          <a href="#relatorios" className="transition hover:text-emerald-700">
            Relatorios
          </a>
          <a href="#stack" className="transition hover:text-emerald-700">
            Stack
          </a>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={onLogin} className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:text-emerald-700">
            Entrar
          </button>
          <button onClick={onSignup} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
            Criar conta
          </button>
        </div>
        <button
          onClick={onMobile}
          className="grid h-10 w-10 place-items-center rounded-full border border-emerald-100 text-slate-700 md:hidden"
          aria-label="Abrir menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="border-t border-emerald-100 bg-white px-4 py-4 md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-700">
              <a href="#metricas">Metricas</a>
              <a href="#relatorios">Relatorios</a>
              <a href="#stack">Stack</a>
              <button onClick={onLogin} className="mt-2 rounded-xl border border-emerald-100 px-4 py-3 text-left">
                Entrar
              </button>
              <button onClick={onSignup} className="rounded-xl bg-emerald-700 px-4 py-3 text-left text-white">
                Criar conta
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function Hero({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <section className="relative flex min-h-[800px] overflow-hidden bg-[#eef8f0] pt-16 md:min-h-[78vh] lg:min-h-[82vh]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#ffffff_0%,#f2fbf4_40%,#dff4e7_100%)]" />
      <div className="absolute inset-0 opacity-80">
        <HeroDashboardBackground />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pb-10 pt-28 sm:px-6 lg:px-8 lg:pb-14 lg:pt-24">
        <motion.div
          className="max-w-3xl"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm">
            <Sparkles className="h-4 w-4" />
            Controle financeiro moderno
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            VerdeFlux
          </h1>
          <p className="mt-6 max-w-[22rem] break-words text-lg leading-8 text-slate-700 sm:max-w-[32rem] sm:text-xl">
            Um painel minimalista para organizar receitas, despesas, orcamentos, importacoes e relatorios em PDF, JSON, CSV e Excel.
          </p>
          <div className="mt-8 flex max-w-[22rem] flex-col gap-3 sm:max-w-none sm:flex-row">
            <button
              onClick={onSignup}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-emerald-900/15 transition hover:bg-emerald-800 sm:w-auto"
            >
              Comecar agora
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onLogin}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-6 py-4 text-sm font-bold text-slate-800 backdrop-blur transition hover:border-emerald-400 sm:w-auto"
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </button>
          </div>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-white" />
    </section>
  );
}

function HeroDashboardBackground() {
  const { scrollYProgress } = useScroll();
  const rawPanelY = useTransform(scrollYProgress, [0, 0.22], [0, -44]);
  const rawRailY = useTransform(scrollYProgress, [0, 0.22], [0, 26]);
  const panelY = useSpring(rawPanelY, { stiffness: 90, damping: 26 });
  const railY = useSpring(rawRailY, { stiffness: 80, damping: 24 });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.svg
        aria-hidden="true"
        className="absolute left-[8%] top-32 hidden h-[360px] w-[58%] text-emerald-300/60 lg:block"
        fill="none"
        viewBox="0 0 760 360"
        style={{ y: railY }}
      >
        <motion.path
          d="M18 292 C 130 120, 254 284, 370 144 S 584 84, 724 206"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.35 }}
        />
        <motion.path
          d="M58 188 C 182 94, 296 180, 428 92 S 632 132, 730 56"
          stroke="#0f766e"
          strokeDasharray="7 15"
          strokeLinecap="round"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.65 }}
          transition={{ duration: 1.9, ease: "easeOut", delay: 0.55 }}
        />
      </motion.svg>
      <motion.div
        className="hero-panel group absolute top-32 hidden rounded-[2rem] border border-white/80 bg-white/78 p-5 shadow-2xl shadow-emerald-900/10 backdrop-blur md:block"
        style={{
          right: "max(1.5rem, calc((100vw - 80rem) / 2 + 1.5rem))",
          width: "min(43vw, 700px)",
          y: panelY,
        }}
        initial={false}
        animate={{ opacity: 1, x: 0, rotate: [-0.8, -1.2, -0.6] }}
        whileHover={{ rotate: 0, y: -8 }}
        transition={{ duration: 7, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
        <motion.div
          className="pointer-events-none absolute left-0 top-0 h-full w-20 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          animate={{ x: ["-120%", "760%"] }}
          transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
        />
        <FloatingChip
          className="-left-16 top-20"
          label="Pix recebido"
          value="+ R$ 410"
          delay={0.2}
          tone="income"
        />
        <FloatingChip
          className="-bottom-8 left-14"
          label="Meta mensal"
          value="72%"
          delay={0.75}
          tone="goal"
        />
        <FloatingChip
          className="-right-8 bottom-24"
          label="PDF pronto"
          value="Junho"
          delay={1.1}
          tone="report"
        />
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 rounded-full bg-slate-200" />
            <motion.div
              className="h-9 w-28 rounded-full bg-emerald-700"
              animate={{ scaleX: [0.88, 1, 0.92] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[72, 56, 88].map((width, index) => (
              <motion.div
                key={width}
                className="rounded-2xl border border-emerald-100 bg-white p-4"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4.4 + index * 0.35, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
              >
                <div className="h-3 w-20 rounded-full bg-slate-200" />
                <div className="mt-4 h-7 rounded-full bg-emerald-100" style={{ width: `${width}%` }} />
                <div className={`mt-4 h-16 rounded-2xl ${index === 1 ? "bg-amber-100" : "bg-emerald-100"}`} />
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-white p-4">
              <div className="flex h-48 items-end gap-3">
                {[34, 64, 48, 78, 58, 92, 70, 82].map((height, index) => (
                  <motion.div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-xl bg-emerald-600"
                    style={{ height: `${height}%` }}
                    animate={{ scaleY: [0.82, 1, 0.92] }}
                    transition={{ repeat: Infinity, duration: 3 + index * 0.15, delay: index * 0.08 }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-4">
              <motion.div
                className="mx-auto h-40 w-40 rounded-full border-[28px] border-emerald-600 border-r-amber-400 border-t-teal-600"
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              />
              <div className="mt-4 space-y-2">
                <div className="h-3 rounded-full bg-slate-200" />
                <div className="h-3 w-2/3 rounded-full bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="pointer-events-none absolute left-4 top-24 w-[calc(100%-2rem)] rounded-[1.6rem] border border-emerald-100 bg-white/70 p-4 opacity-55 shadow-xl shadow-emerald-900/10 backdrop-blur md:hidden"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="mt-3 h-6 w-36 rounded-full bg-emerald-100" />
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-700" />
        </div>
        <div className="mt-5 flex h-28 items-end gap-2">
          {[30, 70, 42, 88, 64, 76].map((height) => (
            <div key={height} className="flex-1 rounded-t-lg bg-emerald-600" style={{ height: `${height}%` }} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function FloatingChip({
  className,
  label,
  value,
  delay,
  tone,
}: {
  className: string;
  label: string;
  value: string;
  delay: number;
  tone: "income" | "goal" | "report";
}) {
  const tones = {
    income: "border-emerald-200 bg-white/90 text-emerald-800",
    goal: "border-teal-200 bg-white/90 text-teal-800",
    report: "border-amber-200 bg-white/90 text-amber-700",
  };

  return (
    <motion.div
      className={`pointer-events-none absolute z-10 hidden rounded-2xl border px-4 py-3 shadow-xl shadow-emerald-900/10 backdrop-blur lg:block ${tones[tone]} ${className}`}
      animate={{ y: [0, -12, 0], opacity: [0.82, 1, 0.82] }}
      transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </motion.div>
  );
}

function LandingSections({ onSignup }: { onSignup: () => void }) {
  return (
    <>
      <section id="metricas" className="relative overflow-hidden bg-white py-16">
        <ScrollPath />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            {
              icon: BarChart3,
              title: "Metricas claras",
              text: "Fluxo mensal, saldo anual, categorias e orcamentos em um painel unico.",
            },
            {
              icon: MessageCircle,
              title: "Entrada rapida",
              text: "Digite uma frase com valor e categoria para acelerar lancamentos pequenos.",
            },
            {
              icon: ArrowDownToLine,
              title: "Portabilidade",
              text: "Exportacao JSON, CSV, Excel e impressao em PDF direto pelo navegador.",
            },
          ].map((item, index) => (
            <motion.article
              key={item.title}
              className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm"
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <item.icon className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="relatorios" className="bg-[#f5faf6] py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Relatorios</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Dados seus, em formatos simples de levar para qualquer lugar.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              A tela ja nasce pensando em plano gratuito: backup em arquivo, reimportacao em outra conta, planilha e PDF para impressao.
            </p>
            <button
              onClick={onSignup}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-4 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Testar painel
              <ChevronRight className="h-4 w-4" />
            </button>
          </motion.div>
          <motion.div
            className="grid gap-3 sm:grid-cols-2"
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            {[
              [FileJson, "JSON", "Backup completo e reimportavel"],
              [Table2, "CSV", "Planilha leve e universal"],
              [FileSpreadsheet, "Excel", "Workbook para analise"],
              [Printer, "PDF", "Impressao do relatorio atual"],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
                <Icon className="h-6 w-6 text-emerald-700" />
                <p className="mt-5 text-lg font-semibold text-slate-950">{title as string}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text as string}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="stack" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
            {[
              ["Next.js + React", "App Router, TypeScript, Tailwind e componentes animados."],
              ["Postgres + Prisma", "Modelo relacional pronto para Neon, categorias, contas e transacoes."],
              ["Google OAuth", "NextAuth preparado para usar credenciais do Google Cloud."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                <h2 className="mt-5 text-xl font-semibold text-slate-950">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function AuthDialog({
  mode,
  open,
  onClose,
  onMode,
  onFinish,
}: {
  mode: "login" | "signup";
  open: boolean;
  onClose: () => void;
  onMode: (mode: "login" | "signup") => void;
  onFinish: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      if (!open) {
        return;
      }

      setFeedback("");
      setPassword("");
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [mode, open]);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password || (mode === "signup" && !name.trim())) {
      setFeedback("Preencha todos os campos.");
      return;
    }

    if (password.length < 8) {
      setFeedback("Use uma senha com pelo menos 8 caracteres.");
      return;
    }

    setPending(true);

    try {
      if (mode === "signup") {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: normalizedEmail,
            password,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? "Nao foi possivel criar a conta.");
        }
      }

      const result = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Email ou senha invalidos.");
      }

      onFinish();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel autenticar.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleSignIn() {
    setFeedback("");
    setPending(true);
    await signIn("google", { callbackUrl: "/" });
    setPending(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
                  {mode === "signup" ? "Cadastro" : "Login"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {mode === "signup" ? "Crie sua conta" : "Entre no painel"}
                </h2>
              </div>
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-6 space-y-3"
              onSubmit={handleCredentialsSubmit}
            >
              {mode === "signup" ? (
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500"
                  placeholder="Nome"
                  autoComplete="name"
                />
              ) : null}
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500"
                placeholder="Email"
                autoComplete="email"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none transition focus:border-emerald-500"
                placeholder="Senha"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {feedback ? (
                <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {feedback}
                </p>
              ) : null}
              <button
                disabled={pending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LogIn className="h-4 w-4" />
                {pending
                  ? "Processando..."
                  : mode === "signup"
                    ? "Criar conta"
                    : "Entrar"}
              </button>
            </form>
            <button
              onClick={() => void handleGoogleSignIn()}
              disabled={pending}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
              </svg>
              Entrar com Google
            </button>
            <p className="mt-5 text-center text-sm text-slate-600">
              {mode === "signup" ? "Ja tem conta?" : "Ainda sem conta?"}{" "}
              <button
                onClick={() => onMode(mode === "signup" ? "login" : "signup")}
                className="font-bold text-emerald-700"
              >
                {mode === "signup" ? "Entrar" : "Criar cadastro"}
              </button>
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DashboardHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="no-print fixed left-0 right-0 top-0 z-40 border-b border-emerald-100 bg-white/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2 font-bold text-slate-950">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white">
            <Wallet className="h-5 w-5" />
          </span>
          VerdeFlux
        </a>
        <div className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="#report-surface" className="transition hover:text-emerald-700">
            Dashboard
          </a>
          <a href="#report-surface" className="transition hover:text-emerald-700">
            Relatorios
          </a>
        </div>
        <button onClick={onLogout} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300">
          Sair
        </button>
      </nav>
    </header>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  caption: string;
  tone: "emerald" | "amber" | "teal" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-700 text-white",
    amber: "bg-amber-500 text-white",
    teal: "bg-teal-700 text-white",
    slate: "bg-slate-950 text-white",
  };

  return (
    <motion.article
      className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{caption}</p>
    </motion.article>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Wallet;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45 }}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-bold text-slate-800 transition hover:border-emerald-300 hover:bg-white"
    >
      <Icon className="h-4 w-4 text-emerald-700" />
      {label}
    </button>
  );
}
