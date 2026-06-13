import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { categoryColors, demoBudgets } from "@/lib/finance-demo";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const sentinelName = "__verdeflux_budget_initialized__";

const budgetSchema = z.object({
  category: z.string().trim().min(1),
  limit: z.coerce.number().positive(),
  accent: z.string().trim().default("#16a34a"),
});

async function requireUserId() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return session.user.id;
}

async function ensureSentinel(userId: string) {
  await prisma.category.upsert({
    where: {
      userId_name_type: {
        userId,
        name: sentinelName,
        type: "EXPENSE",
      },
    },
    create: {
      userId,
      name: sentinelName,
      type: "EXPENSE",
      color: "#16a34a",
      monthlyLimit: new Prisma.Decimal(0),
    },
    update: {},
  });
}

async function getBudgetCategories(userId: string) {
  return prisma.category.findMany({
    where: {
      userId,
      type: "EXPENSE",
      monthlyLimit: {
        not: null,
      },
      NOT: {
        name: sentinelName,
      },
    },
    orderBy: { name: "asc" },
  });
}

function toBudget(category: Awaited<ReturnType<typeof getBudgetCategories>>[number]) {
  return {
    category: category.name,
    limit: Number(category.monthlyLimit ?? 0),
    accent: category.color,
  };
}

export async function GET() {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sentinel = await prisma.category.findUnique({
    where: {
      userId_name_type: {
        userId,
        name: sentinelName,
        type: "EXPENSE",
      },
    },
    select: { id: true },
  });

  if (!sentinel) {
    await ensureSentinel(userId);
    await prisma.$transaction(
      demoBudgets.map((budget) =>
        prisma.category.upsert({
          where: {
            userId_name_type: {
              userId,
              name: budget.category,
              type: "EXPENSE",
            },
          },
          create: {
            userId,
            name: budget.category,
            type: "EXPENSE",
            color: budget.accent,
            monthlyLimit: new Prisma.Decimal(budget.limit),
          },
          update: {
            color: budget.accent,
            monthlyLimit: new Prisma.Decimal(budget.limit),
          },
        }),
      ),
    );
  }

  const budgets = await getBudgetCategories(userId);

  return NextResponse.json({ budgets: budgets.map(toBudget) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const budget = budgetSchema.parse(await request.json());
  await ensureSentinel(userId);

  const category = await prisma.category.upsert({
    where: {
      userId_name_type: {
        userId,
        name: budget.category,
        type: "EXPENSE",
      },
    },
    create: {
      userId,
      name: budget.category,
      type: "EXPENSE",
      color: categoryColors[budget.category] ?? budget.accent,
      monthlyLimit: new Prisma.Decimal(budget.limit),
    },
    update: {
      color: categoryColors[budget.category] ?? budget.accent,
      monthlyLimit: new Prisma.Decimal(budget.limit),
    },
  });

  return NextResponse.json({ budget: toBudget(category) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  if (!category) {
    return NextResponse.json({ error: "Missing category" }, { status: 400 });
  }

  await ensureSentinel(userId);
  await prisma.category.updateMany({
    where: {
      userId,
      name: category,
      type: "EXPENSE",
    },
    data: {
      monthlyLimit: null,
    },
  });

  return NextResponse.json({ deleted: true });
}
