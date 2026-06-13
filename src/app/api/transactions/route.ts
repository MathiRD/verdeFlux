import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const transactionSchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: z.coerce.number().positive(),
  currency: z.string().default("BRL"),
  occurredAt: z.coerce.date(),
  description: z.string().min(2),
  merchant: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    include: { account: true, category: true },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ transactions });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = transactionSchema.parse(await request.json());

  const transaction = await prisma.transaction.create({
    data: {
      ...payload,
      userId: session.user.id,
      amount: new Prisma.Decimal(payload.amount),
    },
  });

  return NextResponse.json({ transaction }, { status: 201 });
}
