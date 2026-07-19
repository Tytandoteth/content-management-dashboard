import { NextResponse } from "next/server";
import { CONTENT_TYPES } from "@cmd/contracts";
import { prisma, type Prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** GET /api/recipes — list saved recipes. */
export async function GET() {
  const recipes = await prisma.recipe.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ recipes });
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * POST /api/recipes — create a recipe (the builder).
 * Body: { name, description?, slug?, spec: { brief:{type,prompt,brandSurface?,sourceUrl?},
 *         count, schedule:{kind, hour?, minute?} } }.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = body.name;
  const spec = body.spec as { brief?: { type?: string } } | undefined;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!spec || typeof spec !== "object" || !spec.brief || !CONTENT_TYPES.includes(spec.brief.type as never)) {
    return NextResponse.json({ error: "spec.brief.type must be a valid content type" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);
  if (await prisma.recipe.findUnique({ where: { slug } })) {
    return NextResponse.json({ error: `recipe slug "${slug}" already exists` }, { status: 409 });
  }

  const recipe = await prisma.recipe.create({
    data: {
      slug,
      name,
      description: typeof body.description === "string" ? body.description : null,
      spec: spec as unknown as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ recipe }, { status: 201 });
}
