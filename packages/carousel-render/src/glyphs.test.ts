import satori from "satori";
import { describe, expect, it } from "vitest";
import { loadBrandFonts } from "./fonts.js";
import { renderCarousel } from "./render.js";

/**
 * Text has to come out as the letters it says. When a font fails to parse,
 * nothing throws: every character renders as the same "no glyph" box at the
 * right canvas size, so size and format checks all still pass. That happened
 * once, from a dependency bump under the font parser. Different letters drawing
 * different shapes is what tells real glyphs from the box.
 */
const draw = (family: string, weight: number, text: string, fonts: Awaited<ReturnType<typeof loadBrandFonts>>) =>
  satori(
    { type: "div", props: { style: { fontFamily: family, fontWeight: weight, fontSize: 40 }, children: text } } as never,
    { width: 400, height: 100, fonts: fonts as never },
  );

describe("bundled fonts draw real glyphs", () => {
  it("draws different letters differently in every face", async () => {
    const fonts = await loadBrandFonts();
    expect(fonts.length).toBeGreaterThan(0);
    for (const { name, weight } of fonts) {
      const [a, b] = await Promise.all([draw(name, weight, "HHHHH", fonts), draw(name, weight, "OOOOO", fonts)]);
      expect(a, `${name} ${weight}`).not.toBe(b);
    }
  });

  it("carries the words through a full slide render", async () => {
    const slide = (headline: string) => ({ topic: "t", slides: [{ role: "hook", headline }] }) as never;
    const [a] = await renderCarousel(slide("HHHHHHHH"));
    const [b] = await renderCarousel(slide("OOOOOOOO"));
    expect(Buffer.from(a!.data).equals(Buffer.from(b!.data))).toBe(false);
  });
});
