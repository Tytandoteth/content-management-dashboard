import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** GET /api/recipes/:slug — single recipe (builder preview). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = await prisma.recipe.findUnique({ where: { slug } });
  if (!recipe) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ recipe });
}

/** PATCH /api/recipes/:slug — edit name/description/spec. */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const existing = await prisma.recipe.findUnique({ where: { slug } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Prisma.RecipeUpdateInput = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name;
  if (body.description !== undefined) data.description = typeof body.description === "string" ? body.description : null;
  if (body.spec !== undefined) data.spec = body.spec as Prisma.InputJsonValue;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const recipe = await prisma.recipe.update({ where: { slug }, data });
  return NextResponse.json({ recipe });
}

/** DELETE /api/recipes/:slug */
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const existing = await prisma.recipe.findUnique({ where: { slug } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.recipe.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
