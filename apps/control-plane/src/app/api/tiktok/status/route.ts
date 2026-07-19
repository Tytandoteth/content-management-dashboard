import { NextResponse } from "next/server";
import { getConnection, isTikTokConfigured } from "@/lib/tiktok-service";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/status — does the dashboard have TikTok wired and connected?
 * Drives the "Connect TikTok" vs "Push to TikTok" UI. Never returns tokens.
 */
export async function GET() {
  const configured = isTikTokConfigured();
  const conn = configured ? await getConnection() : null;
  return NextResponse.json({
    configured,
    connected: Boolean(conn),
    label: conn?.label ?? null,
    openId: conn?.openId ?? null,
    publicBaseUrlSet: Boolean(env.publicBaseUrl()),
  });
}
