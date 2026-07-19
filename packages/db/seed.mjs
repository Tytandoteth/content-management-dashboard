#!/usr/bin/env node
/**
 * Seed the control-plane DB with the canonical example recipes (roadmap §5.3).
 * Idempotent: re-running upserts each recipe by slug.
 *
 *   DATABASE_URL=... node packages/db/seed.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Recipes (roadmap §5.3) — the canonical example workflows.
  const RECIPES = [
    {
      slug: "podcast-to-clips",
      name: "Podcast → 10 clips",
      description: "Clip the latest podcast into 10 shorts, scheduled weekdays at noon, held for approval.",
      spec: {
        brief: { type: "clip", prompt: "Cut the most engaging moments into 9:16 shorts", brandSurface: "default" },
        count: 10,
        schedule: { kind: "weekday_slots", hour: 12, minute: 0 },
      },
    },
    {
      slug: "daily-x-thread",
      name: "Daily X thread",
      description: "Generate a thread from a topic, scheduled for the next weekday noon, held for approval.",
      spec: {
        brief: { type: "thread", prompt: "Write a punchy X thread on the topic", brandSurface: "default" },
        count: 1,
        schedule: { kind: "weekday_slots", hour: 12, minute: 0 },
      },
    },
  ];
  for (const r of RECIPES) {
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      update: { name: r.name, description: r.description, spec: r.spec },
      create: r,
    });
  }
  console.log(`seeded ${RECIPES.length} recipes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
