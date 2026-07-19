import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderCarousel } from "./render.js";
import type { CarouselSpec, CarouselStyle } from "./types.js";

const SPEC: CarouselSpec = {
  topic: "Fireflies.ai note-taker",
  caption: "The free AI that takes your meeting notes for you.",
  hashtags: ["#ai", "#aitools"],
  slides: [
    { role: "hook", kicker: "Fireflies.ai", coverStat: "10 hrs/wk", headline: "saved on meeting notes", tool: "Fireflies" },
    { role: "body", kicker: "Step 1", headline: "Add the AI note-taker", body: "Connect your calendar once.", tool: "Fireflies" },
    { role: "body", kicker: "Step 2", headline: "Get the summary", body: "Action items land in your inbox." },
    { role: "cta", headline: "Want the setup?", body: "Follow and grab it from my bio." },
  ],
};

describe("renderCarousel", () => {
  it("renders TikTok-ready JPEGs at 1080×1920 (the photo API's accepted spec)", async () => {
    const slides = await renderCarousel(SPEC);
    expect(slides).toHaveLength(4);
    for (const s of slides) {
      expect(s.ext).toBe("jpg");
      // JPEG magic bytes.
      expect(Array.from(s.data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
      const meta = await sharp(Buffer.from(s.data)).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
    }
  }, 30000);

  // A repo-card + terminal deck that also carries emoji and a "→" arrow in the
  // copy, so every style must survive text sanitization (no tofu / crash).
  const STYLED_SPEC: CarouselSpec = {
    caption: "",
    hashtags: [],
    slides: [
      { role: "hook", kicker: "Claude Code", coverStat: "7 repos", headline: "I install on every machine" },
      {
        role: "body",
        kicker: "01",
        headline: "superpowers",
        body: "A full dev methodology → in Claude skills 🚀",
        card: {
          kind: "repo",
          title: "obra/superpowers",
          subtitle: "An agentic skills framework.",
          stats: [
            { label: "Stars", value: "245k" },
            { label: "Forks", value: "22k" },
          ],
          language: "TypeScript",
          languageBar: [
            { color: "#3178c6", pct: 70 },
            { color: "#f1e05a", pct: 30 },
          ],
        },
        terminal: {
          title: "~/ setup",
          lines: [
            { text: "$ npx superpowers init", kind: "prompt" },
            { text: "✓ installed", kind: "ok" },
          ],
        },
      },
      { role: "cta", headline: "Save this for your next build", body: "Which one first?" },
    ],
  };

  const STYLES: CarouselStyle[] = ["gradient-pop", "paper-light", "terminal-dev"];
  const FORMATS = [
    { format: "tiktok" as const, width: 1080, height: 1920 },
    { format: "instagram" as const, width: 1080, height: 1350 },
  ];

  for (const style of STYLES) {
    for (const { format, width, height } of FORMATS) {
      it(`renders the ${style} style (repo card + terminal) at ${width}×${height} (${format})`, async () => {
        const slides = await renderCarousel(STYLED_SPEC, { style, format });
        expect(slides).toHaveLength(3);
        for (const s of slides) {
          // JPEG magic bytes — proves no crash/tofu on the card, → and emoji.
          expect(Array.from(s.data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
          const meta = await sharp(Buffer.from(s.data)).metadata();
          expect(meta.format).toBe("jpeg");
          expect(meta.width).toBe(width);
          expect(meta.height).toBe(height);
        }
      }, 30000);
    }
  }
});
