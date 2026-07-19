import { NextResponse } from "next/server";
import { buildRegistry } from "@/lib/generators/registry";

export const dynamic = "force-dynamic";

/** GET /api/generators — registered engines + live health (ops view). */
export async function GET() {
  const registry = buildRegistry();
  const generators = await Promise.all(
    registry.list().map(async (g) => ({
      name: g.name,
      engine: g.engine,
      supports: g.supports,
      manual: g.manual ?? false,
      health: await g.healthcheck().catch(() => "down" as const),
    })),
  );
  return NextResponse.json({ generators });
}
