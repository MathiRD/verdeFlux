import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(80),
  email: z.string().trim().toLowerCase().email("Email invalido."),
  password: z.string().min(8, "Use pelo menos 8 caracteres.").max(128),
});

export async function POST(request: Request) {
  const payload = registerSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.issues[0]?.message ?? "Dados invalidos." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: payload.data.email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Este email ja esta cadastrado." },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      name: payload.data.name,
      email: payload.data.email,
      passwordHash: await hashPassword(payload.data.password),
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
