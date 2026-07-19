import { NextResponse } from "next/server";
import { PostizClient } from "@cmd/integrations";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/connections — what's wired (Settings).
 * Returns connected Postiz channels (when Postiz is configured) plus a derived
 * "config status" of which integrations have env set. Never returns secrets —
 * only booleans + non-sensitive identifiers (the model id, channel names).
 */
export async function GET() {
  const config = {
    postiz: Boolean(env.postizApiUrl() && env.postizApiKey()),
    autoPublish: env.autoPublish(),
    openrouter: Boolean(env.openrouterApiKey()),
    orchestratorModel: env.orchestratorModel(),
    higgsfield: Boolean(env.higgsfieldApiUrl()),
    tiktokDirect: Boolean(env.tiktokClientKey() && env.tiktokClientSecret() && env.tiktokRedirectUri()),
  };

  let channels: unknown[] = [];
  if (config.postiz) {
    try {
      const client = new PostizClient({ baseUrl: env.postizApiUrl(), apiKey: env.postizApiKey() });
      const result = await client.listChannels();
      channels = Array.isArray(result) ? result : ((result as { integrations?: unknown[] })?.integrations ?? []);
    } catch {
      channels = [];
    }
  }

  return NextResponse.json({ config, channels });
}
