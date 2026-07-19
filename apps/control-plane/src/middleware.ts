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

export default authDisabled ? () => undefined : clerk;

export const config = {
  matcher: [
    // Run on everything except static files and _next internals.
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|glb|mp4)).*)",
    "/(api|trpc)(.*)",
  ],
};
