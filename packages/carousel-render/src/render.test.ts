import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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

describe("renderCarousel image references", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  /** A host on this machine, standing in for anything internal. Counts who reaches it. */
  async function internalHost(handler: (url: string) => { status: number; location?: string } = () => ({ status: 200 })) {
    const hits: string[] = [];
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      const { status, location } = handler(req.url ?? "");
      res.writeHead(status, location ? { location } : { "content-type": "image/png" });
      res.end();
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits };
  }

  it("never connects to an internal host from any image field, and still renders", async () => {
    const { base, hits } = await internalHost();
    const slides = await renderCarousel({
      caption: "",
      hashtags: [],
      slides: [
        { role: "hook", headline: "Plate", bgImageUrl: `${base}/bg` },
        { role: "body", headline: "Card", card: { kind: "repo", title: "a/b", avatarUrl: `${base}/avatar` } },
      ],
    }, { style: "gradient-pop" });
    expect(hits).toEqual([]);
    expect(slides).toHaveLength(2);
    for (const s of slides) expect(Array.from(s.data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  }, 30000);

  it("renders an inline image plate", async () => {
    const plate = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#d00000" } }).png().toBuffer();
    const spec = (bgImageUrl?: string): CarouselSpec => ({
      caption: "",
      hashtags: [],
      slides: [{ role: "hook", headline: "Plate", ...(bgImageUrl ? { bgImageUrl } : {}) }],
    });
    const [withPlate] = await renderCarousel(spec(`data:image/png;base64,${plate.toString("base64")}`));
    const [without] = await renderCarousel(spec());
    expect(Buffer.from(withPlate!.data).equals(Buffer.from(without!.data))).toBe(false);
  }, 30000);
});
