import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildTikTokClient, saveConnection } from "@/lib/tiktok-service";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/callback — TikTok redirects here with ?code&state after the
 * creator authorizes. Verifies the CSRF state, exchanges the code for tokens,
 * persists the connection, and bounces back to /settings.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = `${url.origin}/settings`;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return NextResponse.redirect(`${settings}?tiktok=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code) return NextResponse.redirect(`${settings}?tiktok=error&reason=missing_code`);

  const store = await cookies();
  const expected = store.get("tiktok_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(`${settings}?tiktok=error&reason=bad_state`);
  }

  try {
    const tokens = await buildTikTokClient().exchangeCode({ code, redirectUri: env.tiktokRedirectUri() });
    await saveConnection(tokens);
    const res = NextResponse.redirect(`${settings}?tiktok=connected`);
    res.cookies.delete("tiktok_oauth_state");
    return res;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(`${settings}?tiktok=error&reason=${encodeURIComponent(reason)}`);
  }
}
