import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness + control-plane DB reachability. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", db: "down", error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
