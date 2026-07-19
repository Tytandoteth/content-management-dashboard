/**
 * Seed/refresh the AI tools catalog. Idempotent - upserts by name, so it's safe
 * to re-run after editing the list. The carousel composer draws fresh (least-used)
 * tools from here so every post features new ones.
 *
 *   DATABASE_URL=... pnpm dlx tsx scripts/seed-tools.mts
 */
import { prisma } from "@cmd/db";

type Seed = {
  name: string;
  domain: string;
  category: string;
  oneLiner: string;
  payoff: string;
  pricing?: "free" | "freemium" | "paid";
  tags?: string[];
};

const TOOLS: Seed[] = [
  // --- writing ---
  { name: "ChatGPT", domain: "chatgpt.com", category: "writing", oneLiner: "General AI assistant for writing, analysis, and ideas.", payoff: "Replaces hours of drafting and research for $0 on the free tier." },
  { name: "Claude", domain: "claude.ai", category: "writing", oneLiner: "AI assistant that's strong at long-form writing and reasoning.", payoff: "Drafts reports and emails in seconds you'd spend an hour on." },
  { name: "Grammarly", domain: "grammarly.com", category: "writing", oneLiner: "AI grammar, tone, and clarity checker.", payoff: "Catches mistakes a $40/hr editor would - for free." },
  { name: "QuillBot", domain: "quillbot.com", category: "writing", oneLiner: "Paraphraser, summarizer, and grammar fixer.", payoff: "Rewrites and shortens text instantly - no writer needed." },
  { name: "Copy.ai", domain: "copy.ai", category: "writing", oneLiner: "AI copywriter for marketing and sales copy.", payoff: "Spins out ad and email copy that replaces a freelance copywriter." },
  { name: "Sudowrite", domain: "sudowrite.com", category: "writing", oneLiner: "AI writing partner built for fiction and storytelling.", payoff: "Beats writer's block and drafts chapters in minutes." },

  // --- meetings & notes ---
  { name: "Fireflies.ai", domain: "fireflies.ai", category: "meetings", oneLiner: "AI notetaker that joins calls and transcribes them.", payoff: "Auto-writes meeting notes - saves 5+ hours a week." },
  { name: "Otter.ai", domain: "otter.ai", category: "meetings", oneLiner: "Live transcription and meeting summaries.", payoff: "Never take manual notes again; recap calls in seconds." },
  { name: "Fathom", domain: "fathom.video", category: "meetings", oneLiner: "Free AI meeting recorder and summarizer.", payoff: "Records, transcribes, and summarizes calls for $0." },
  { name: "tl;dv", domain: "tldv.io", category: "meetings", oneLiner: "Meeting recorder with AI summaries and clips.", payoff: "Turns hour-long calls into a 2-minute recap." },
  { name: "Granola", domain: "granola.ai", category: "meetings", oneLiner: "AI notepad that enhances your own meeting notes.", payoff: "Cleans up rough notes into shareable summaries instantly." },

  // --- video ---
  { name: "Opus Clip", domain: "opus.pro", category: "video", oneLiner: "Turns long videos into short viral clips automatically.", payoff: "One upload → 10 ready-to-post clips, saving hours of editing." },
  { name: "Descript", domain: "descript.com", category: "video", oneLiner: "Edit video by editing the transcript text.", payoff: "Cuts editing time in half - no timeline scrubbing." },
  { name: "CapCut", domain: "capcut.com", category: "video", oneLiner: "Free video editor with AI captions and effects.", payoff: "Pro-level edits and auto-captions for $0." },
  { name: "Runway", domain: "runwayml.com", category: "video", oneLiner: "AI video generation and editing suite.", payoff: "Generate b-roll and VFX without a production budget." },
  { name: "HeyGen", domain: "heygen.com", category: "video", oneLiner: "AI avatars and video translation.", payoff: "Make spokesperson videos without filming or a studio." },
  { name: "Synthesia", domain: "synthesia.io", category: "video", oneLiner: "AI avatar videos from a script.", payoff: "Replaces a video crew for training and explainer content." },
  { name: "Captions", domain: "captions.ai", category: "video", oneLiner: "AI camera app for talking-head videos and captions.", payoff: "Studio-quality short-form on your phone, free to start." },
  { name: "Higgsfield", domain: "higgsfield.ai", category: "video", oneLiner: "AI video generator with cinematic camera motion.", payoff: "Scroll-stopping AI clips without a camera or actors." },

  // --- image & design ---
  { name: "Midjourney", domain: "midjourney.com", category: "image", oneLiner: "Best-in-class AI image generation.", payoff: "Agency-quality visuals without hiring a designer." },
  { name: "Ideogram", domain: "ideogram.ai", category: "image", oneLiner: "AI image generator that nails text in images.", payoff: "Make logos and posters with readable text for free." },
  { name: "Leonardo.ai", domain: "leonardo.ai", category: "image", oneLiner: "AI image generation with fine creative control.", payoff: "Daily free credits replace stock photo subscriptions." },
  { name: "Canva", domain: "canva.com", category: "design", oneLiner: "Design tool with AI Magic Studio built in.", payoff: "Design anything without a designer - free tier is huge." },
  { name: "Adobe Firefly", domain: "firefly.adobe.com", category: "image", oneLiner: "Commercially-safe AI image generation.", payoff: "License-safe visuals you can actually use in ads." },
  { name: "Krea", domain: "krea.ai", category: "image", oneLiner: "Real-time AI image generation and upscaling.", payoff: "Iterate on visuals live instead of paying per render." },
  { name: "Recraft", domain: "recraft.ai", category: "design", oneLiner: "AI design tool for icons, illustrations, and brand sets.", payoff: "Generate a consistent icon set in minutes, not days." },
  { name: "Looka", domain: "looka.com", category: "design", oneLiner: "AI logo and brand-kit maker.", payoff: "A logo for a few dollars instead of a $500 designer." },

  // --- audio & voice ---
  { name: "ElevenLabs", domain: "elevenlabs.io", category: "audio", oneLiner: "Realistic AI text-to-speech and voice cloning.", payoff: "Voiceovers without a mic or voice actor." },
  { name: "Suno", domain: "suno.com", category: "audio", oneLiner: "Generate full songs from a text prompt.", payoff: "Custom royalty-free music - no licensing fees." },
  { name: "Udio", domain: "udio.com", category: "audio", oneLiner: "AI music generator with high audio quality.", payoff: "Original tracks for content without paying for stock music." },
  { name: "Adobe Podcast", domain: "podcast.adobe.com", category: "audio", oneLiner: "AI audio cleanup that makes mics sound studio-grade.", payoff: "Studio-quality audio for free - no acoustic treatment." },
  { name: "Murf", domain: "murf.ai", category: "audio", oneLiner: "AI voice generator for narration and ads.", payoff: "Pro voiceovers without booking talent." },

  // --- automation & agents ---
  { name: "Zapier", domain: "zapier.com", category: "automation", oneLiner: "Connects 7,000+ apps to automate workflows.", payoff: "Automate busywork - buy back hours every week." },
  { name: "Make", domain: "make.com", category: "automation", oneLiner: "Visual automation builder for complex workflows.", payoff: "Replace repetitive manual ops with one scenario." },
  { name: "n8n", domain: "n8n.io", category: "automation", oneLiner: "Open-source, self-hostable workflow automation.", payoff: "Powerful automations with no per-task fees." },
  { name: "Gumloop", domain: "gumloop.com", category: "automation", oneLiner: "No-code AI automation for data and content tasks.", payoff: "Build an AI assistant for your workflow without code." },
  { name: "Lindy", domain: "lindy.ai", category: "automation", oneLiner: "AI agents that handle email, scheduling, and tasks.", payoff: "An AI assistant that works while you sleep." },

  // --- dev & app-building ---
  { name: "Cursor", domain: "cursor.com", category: "dev", oneLiner: "AI-first code editor.", payoff: "Ship features faster - like a senior pair-programmer." },
  { name: "GitHub Copilot", domain: "github.com/features/copilot", category: "dev", oneLiner: "AI autocomplete and chat inside your editor.", payoff: "Writes boilerplate so you code 30%+ faster." },
  { name: "v0", domain: "v0.dev", category: "dev", oneLiner: "Generate UI and React code from a prompt.", payoff: "Go from idea to working UI without a front-end dev." },
  { name: "Bolt", domain: "bolt.new", category: "dev", oneLiner: "Build and deploy full-stack apps in the browser.", payoff: "Launch a working app without a dev team." },
  { name: "Lovable", domain: "lovable.dev", category: "dev", oneLiner: "Prompt-to-app builder for full-stack web apps.", payoff: "Build a real product without writing code." },
  { name: "Replit", domain: "replit.com", category: "dev", oneLiner: "Cloud IDE with an AI agent that builds apps.", payoff: "Build and host an app from your phone, free to start." },

  // --- research & search ---
  { name: "Perplexity", domain: "perplexity.ai", category: "research", oneLiner: "AI answer engine with live cited sources.", payoff: "Research in minutes with sources - skip the rabbit hole." },
  { name: "NotebookLM", domain: "notebooklm.google.com", category: "research", oneLiner: "Google's AI research notebook over your own docs.", payoff: "Turn your files into an instant expert - and a podcast." },
  { name: "Consensus", domain: "consensus.app", category: "research", oneLiner: "AI search over peer-reviewed research.", payoff: "Get science-backed answers without reading 50 papers." },
  { name: "Elicit", domain: "elicit.com", category: "research", oneLiner: "AI research assistant for literature review.", payoff: "Summarize dozens of studies in the time for one." },

  // --- productivity & presentations ---
  { name: "Gamma", domain: "gamma.app", category: "productivity", oneLiner: "Generate decks, docs, and sites from a prompt.", payoff: "A polished pitch deck in minutes, not a weekend." },
  { name: "Notion", domain: "notion.com", category: "productivity", oneLiner: "All-in-one workspace with built-in AI.", payoff: "Draft, summarize, and organize without switching apps." },
  { name: "Gemini", domain: "gemini.google.com", category: "productivity", oneLiner: "Google's AI assistant across Search, Docs, and Gmail.", payoff: "AI inside the tools you already use, free." },
  { name: "Motion", domain: "usemotion.com", category: "productivity", oneLiner: "AI calendar that auto-plans your day.", payoff: "Reclaim hours by letting AI schedule your tasks." },

  // --- marketing & social ---
  { name: "vidIQ", domain: "vidiq.com", category: "marketing", oneLiner: "AI YouTube growth and keyword tool.", payoff: "Find winning video ideas without guessing." },
  { name: "AdCreative.ai", domain: "adcreative.ai", category: "marketing", oneLiner: "Generate high-converting ad creatives.", payoff: "Ad creative that performs - without a design agency." },
  { name: "Taplio", domain: "taplio.com", category: "marketing", oneLiner: "AI tool to grow a LinkedIn audience.", payoff: "Build a personal brand on autopilot." },

  // --- data & spreadsheets ---
  { name: "Julius", domain: "julius.ai", category: "data", oneLiner: "Chat with your data to analyze and chart it.", payoff: "Run analysis like a data scientist - just ask." },
  { name: "Rows", domain: "rows.com", category: "data", oneLiner: "Spreadsheet with AI and live data integrations.", payoff: "Automate reports that used to eat your afternoon." },

  // --- web builders ---
  { name: "Framer", domain: "framer.com", category: "web", oneLiner: "Design and publish sites with AI.", payoff: "Launch a pro website without a developer." },
  { name: "Durable", domain: "durable.co", category: "web", oneLiner: "Generate a business website in 30 seconds.", payoff: "A live site for your side hustle in under a minute." },

  // --- translation ---
  { name: "DeepL", domain: "deepl.com", category: "translation", oneLiner: "High-accuracy AI translation.", payoff: "Beats paid translators on nuance - free tier covers most needs." },
];

async function main() {
  console.log(`Seeding ${TOOLS.length} AI tools…`);
  let created = 0;
  let updated = 0;
  for (const t of TOOLS) {
    const existing = await prisma.aiTool.findUnique({ where: { name: t.name } });
    await prisma.aiTool.upsert({
      where: { name: t.name },
      create: {
        name: t.name,
        domain: t.domain,
        url: `https://${t.domain}`,
        category: t.category,
        oneLiner: t.oneLiner,
        payoff: t.payoff,
        pricing: t.pricing ?? "freemium",
        tags: t.tags ?? [],
      },
      // Refresh catalog fields but PRESERVE rotation bookkeeping (useCount/lastUsedAt).
      update: {
        domain: t.domain,
        url: `https://${t.domain}`,
        category: t.category,
        oneLiner: t.oneLiner,
        payoff: t.payoff,
        pricing: t.pricing ?? "freemium",
        tags: t.tags ?? [],
      },
    });
    if (existing) updated++;
    else created++;
  }
  const total = await prisma.aiTool.count();
  console.log(`Done: ${created} created, ${updated} updated. Catalog now holds ${total} tools.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
