import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { FinanceTransaction } from "@/lib/finance-demo";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const financeTransactionSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  account: z.string().trim().min(1),
  type: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["Manual", "Importado", "Entrada rapida", "OCR", "Recorrente"]),
  recurrenceId: z.string().optional(),
  recurrenceMode: z.enum(["single", "installments", "monthly-year", "monthly-open"]).optional(),
  recurrenceLabel: z.string().optional(),
  installmentIndex: z.number().int().positive().optional(),
  installmentTotal: z.number().int().positive().optional(),
});

const writeSchema = z.object({
  transactions: z.array(financeTransactionSchema).min(1),
});

const updateSchema = z.object({
  transaction: financeTransactionSchema,
});

const typeToDb = {
  income: "INCOME",
  expense: "EXPENSE",
} as const;

const dbToType = {
  INCOME: "income",
  EXPENSE: "expense",
  TRANSFER: "expense",
} as const;

const sourceToDb = {
  Manual: "MANUAL",
  Importado: "IMPORT",
  "Entrada rapida": "QUICK_TEXT",
  OCR: "OCR",
  Recorrente: "RECURRING",
} as const;

const dbToSource = {
  MANUAL: "Manual",
  IMPORT: "Importado",
  QUICK_TEXT: "Entrada rapida",
  OCR: "OCR",
  RECURRING: "Recorrente",
  WHATSAPP_BRIDGE: "Entrada rapida",
} as const;

function toDbData(transaction: FinanceTransaction, userId: string) {
  return {
    id: transaction.id,
    userId,
    type: typeToDb[transaction.type],
    source: sourceToDb[transaction.source],
    amount: new Prisma.Decimal(transaction.amount),
    currency: "BRL",
    occurredAt: new Date(`${transaction.date}T12:00:00`),
    description: transaction.description,
    installmentIndex: transaction.installmentIndex,
    installmentTotal: transaction.installmentTotal,
    rawPayload: transaction as unknown as Prisma.InputJsonValue,
  };
}

function toFinanceTransaction(transaction: {
  id: string;
  type: keyof typeof dbToType;
  source: keyof typeof dbToSource;
  amount: Prisma.Decimal;
  occurredAt: Date;
  description: string;
  installmentIndex: number | null;
  installmentTotal: number | null;
  rawPayload: Prisma.JsonValue;
}): FinanceTransaction {
  const payload =
    transaction.rawPayload &&
    typeof transaction.rawPayload === "object" &&
    !Array.isArray(transaction.rawPayload)
      ? (transaction.rawPayload as Partial<FinanceTransaction>)
      : {};

  return {
    id: transaction.id,
    description: payload.description ?? transaction.description,
    category: payload.category ?? "Sem categoria",
    account: payload.account ?? "Conta principal",
    type: payload.type ?? dbToType[transaction.type],
    amount: Number(transaction.amount),
    date: payload.date ?? transaction.occurredAt.toISOString().slice(0, 10),
    source: payload.source ?? dbToSource[transaction.source],
    recurrenceId: payload.recurrenceId,
    recurrenceMode: payload.recurrenceMode,
    recurrenceLabel: payload.recurrenceLabel,
    installmentIndex: payload.installmentIndex ?? transaction.installmentIndex ?? undefined,
    installmentTotal: payload.installmentTotal ?? transaction.installmentTotal ?? undefined,
  };
}

async function requireUserId() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return session.user.id;
}

export async function GET() {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: 1000,
  });

  return NextResponse.json({
    transactions: transactions.map(toFinanceTransaction),
  });
}

export async function POST(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = writeSchema.parse(await request.json());

  const transactions = await prisma.$transaction(
    payload.transactions.map((transaction) =>
      prisma.transaction.upsert({
        where: { id: transaction.id },
        update: toDbData(transaction, userId),
        create: toDbData(transaction, userId),
      }),
    ),
  );

  return NextResponse.json(
    { transactions: transactions.map(toFinanceTransaction) },
    { status: 201 },
  );
}

export async function PUT(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = updateSchema.parse(await request.json());
  const data = toDbData(payload.transaction, userId);

  const result = await prisma.transaction.updateMany({
    where: {
      id: payload.transaction.id,
      userId,
    },
    data,
  });

  if (!result.count) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: payload.transaction.id },
  });

  return NextResponse.json({ transaction: toFinanceTransaction(transaction) });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const recurrenceId = searchParams.get("recurrenceId");

  if (!id && !recurrenceId) {
    return NextResponse.json(
      { error: "Missing id or recurrenceId" },
      { status: 400 },
    );
  }

  const result = recurrenceId
    ? await prisma.transaction.deleteMany({
        where: {
          userId,
          rawPayload: {
            path: ["recurrenceId"],
            equals: recurrenceId,
          },
        },
      })
    : await prisma.transaction.deleteMany({
        where: {
          userId,
          id: id!,
        },
      });

  return NextResponse.json({ deleted: result.count });
}
