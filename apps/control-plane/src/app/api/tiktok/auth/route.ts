import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildTikTokClient, isTikTokConfigured } from "@/lib/tiktok-service";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/auth — start the TikTok Login Kit OAuth flow. Redirects the
 * creator to TikTok to authorize the `video.upload` scope, with a CSRF state.
 */
export async function GET() {
  if (!isTikTokConfigured()) {
    return NextResponse.json({ error: "TikTok not configured", code: "tiktok_not_configured" }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const url = buildTikTokClient().buildAuthorizeUrl({ redirectUri: env.tiktokRedirectUri(), state });
  const res = NextResponse.redirect(url);
  res.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600,
    path: "/",
  });
  return res;
}
