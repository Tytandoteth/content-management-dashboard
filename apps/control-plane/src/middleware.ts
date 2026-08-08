import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Team auth (Clerk). Everything requires a signed-in team member EXCEPT:
 *  - the sign-in/up pages themselves
 *  - /api/health (monitoring)
 *  - the machine endpoints (cron/connectors), which enforce their own
 *    x-cmd-signature token (CONTROL_PLANE_API_TOKEN) in the route handler
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/api/scheduler/tick",
  "/api/outbox/drain",
  "/api/analytics/tick",
  // TikTok redirects back here with no session; the route validates a CSRF state.
  "/api/tiktok/callback",
  // TikTok's servers POST event notifications here with no session. A 401 reads
  // as a delivery failure on their side and triggers retries.
  "/api/tiktok/webhook",
  // Public resource articles (linked from TikTok bios — viewers aren't logged in).
  "/r(.*)",
]);

// Local-dev escape hatch: set NEXT_PUBLIC_DISABLE_AUTH=true to browse the
// dashboard without Clerk keys. Never enable this in a deployed environment.
const authDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Machine access: automation (smoke tests, n8n, connectors) may call any API
  // with the shared service token instead of a Clerk session.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const token = process.env.CONTROL_PLANE_API_TOKEN;
    if (token && req.headers.get("x-cmd-signature") === token) return;
  }

  const { userId, redirectToSignIn } = await auth();
  if (userId) return;

  // APIs get a clean 401; pages get the sign-in redirect.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return redirectToSignIn();
});

/**
 * Fail CLOSED, not fatal. If Clerk itself throws — an unverifiable session
 * cookie, a key/instance mismatch, its API being unreachable — an unguarded
 * middleware turns every authenticated request into an opaque 500
 * (`x-vercel-error: MIDDLEWARE_INVOCATION_FAILED`) with nothing in the response
 * to explain it. That is what happened on 2026-08-07: production was running a
 * Clerk DEVELOPMENT instance (logical-martin-1.clerk.accounts.dev) against a
 * *.vercel.app origin, so `dev-browser-missing` made verification throw and the
 * whole dashboard 500-ed for a signed-in user while /api/health stayed green.
 *
 * Treating the failure as "signed out" denies access (never grants it), so this
 * is strictly safe: APIs get a 401 they can report, pages bounce to sign-in.
 * It makes the failure legible instead of fatal — it does NOT substitute for
 * running a real Clerk production instance.
 */
const guarded = async (...args: Parameters<typeof clerk>) => {
  try {
    return await clerk(...args);
  } catch (err) {
    const req = args[0];
    console.error(
      `[middleware] auth failed for ${req.nextUrl.pathname}: ${err instanceof Error ? err.message : err}`,
    );
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "auth unavailable", code: "auth_error" }, { status: 401 });
    }
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    return NextResponse.redirect(signIn);
  }
};

export default authDisabled ? () => undefined : guarded;

export const config = {
  matcher: [
    // Run on everything except static files and _next internals.
    // `txt` is in the list so platform site-verification files served from
    // public/ (TikTok, Google, etc.) stay reachable — Clerk would otherwise 401
    // the verifier and the domain check would fail.
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|docx?|xlsx?|zip|webmanifest|glb|mp4)).*)",
    "/(api|trpc)(.*)",
  ],
};
