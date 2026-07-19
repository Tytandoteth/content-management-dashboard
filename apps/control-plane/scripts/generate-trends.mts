/**
 * Batch-generate 10 trend-driven carousel drafts for the configured brand.
 *
 * Each topic is mapped from a live TikTok "Ai" search trend (see `trend`) but
 * re-framed through the brand's money/time lens by the composer. Output: 10
 * draft carousels in the spine, ready for the approval gate in the dashboard.
 *
 *   cd apps/control-plane
 *   set -a; source .env; source .env.local; set +a   # OpenRouter key + dev DB
 *   pnpm exec tsx scripts/generate-trends.mts
 */
import { runGeneration } from "../src/lib/generation-service.js";
import { prisma } from "@cmd/db";

interface TrendTopic {
  topic: string;
  count: number;
  trend: string; // the TikTok search term this rides
}

const TOPICS: TrendTopic[] = [
  { topic: "3 AI humanizers that make AI writing sound 100% human", count: 5, trend: "ai writing humanizer / best humanizer for ai (508K, +213%)" },
  { topic: "5 AI apps you need to try in 2026", count: 7, trend: "AI apps you need to try (895K)" },
  { topic: "5 cool things you can do with AI for free", count: 7, trend: "cool things you can do with AI (907K)" },
  { topic: "5 AI tools every creator needs to grow faster", count: 7, trend: "ai for creators (703K)" },
  { topic: "3 AI tools that trade crypto and stocks for you", count: 5, trend: "ai tradding (284K, +44%)" },
  { topic: "5 ChatGPT prompts that save you 10 hours a week", count: 7, trend: "ai prompts (234K)" },
  { topic: "Turn one long video into 30 viral clips with AI", count: 5, trend: "ai vids (345K, +79%)" },
  { topic: "Build a real app just by chatting with AI", count: 5, trend: "chatting with ai / open claw ai (290K, +101%)" },
  { topic: "5 AI side hustles making people real money", count: 7, trend: "the best ai / ai people (631K, +310%)" },
  { topic: "AI meal planning that saves $300 a month on groceries", count: 5, trend: "ai cooking (275K)" },
];

async function main() {
  console.log(`Generating ${TOPICS.length} trend-driven carousel drafts...\n`);
  const created: { id: string; topic: string; slides: number; trend: string }[] = [];
  let failures = 0;

  for (const [i, t] of TOPICS.entries()) {
    const n = `${i + 1}`.padStart(2, "0");
    process.stdout.write(`[${n}/${TOPICS.length}] ${t.topic}\n        trend: ${t.trend}\n`);
    try {
      const out = await runGeneration(
        { type: "carousel", brandSurface: "default", prompt: t.topic, count: t.count },
        { createdBy: "trend-batch-2026-06" },
      );
      const item = out.items[0];
      const meta = (item?.payload as { generationMetadata?: { slideCount?: number; spec?: { hashtags?: string[]; slides?: { coverStat?: string; headline?: string }[] } } })?.generationMetadata;
      const slides = meta?.slideCount ?? (Array.isArray(item?.assetUrls) ? (item!.assetUrls as string[]).length : 0);
      const hook = meta?.spec?.slides?.[0];
      const tags = meta?.spec?.hashtags ?? [];
      console.log(`        ✓ draft ${item?.id}  (${slides} slides, engine ${out.engine})`);
      if (hook) console.log(`        hook: "${hook.coverStat ?? ""}" ${hook.headline ?? ""}`.trimEnd());
      if (tags.length) console.log(`        tags: ${tags.join(" ")}`);
      console.log("");
      if (item) created.push({ id: item.id, topic: t.topic, slides, trend: t.trend });
      else failures++;
    } catch (err) {
      failures++;
      console.log(`        ✗ FAILED: ${(err as Error).message}\n`);
    }
  }

  console.log("─".repeat(60));
  console.log(`Done: ${created.length}/${TOPICS.length} drafts created, ${failures} failed.`);
  console.log("All land as `draft` carousels behind the approval gate (dashboard → review → approve → stage).");
  await prisma.$disconnect();
  if (failures) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
