import { NextResponse } from "next/server";
import { prisma } from "@cmd/db";

export const dynamic = "force-dynamic";

/** GET /api/orchestration-runs — recent orchestrator runs (Chat history). */
export async function GET() {
  const runs = await prisma.orchestrationRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ runs });
}
