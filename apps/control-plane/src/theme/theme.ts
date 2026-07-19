/**
 * App theme — the single UI brand-token source.
 *
 * Re-skinning Postiz and theming the control plane both pull from here so the
 * two read as one coherent product (roadmap §5: "not a forked tool with a
 * different look"). A mirror of these tokens for the Postiz reskin lives in
 * infra/postiz/theme.json — keep them in sync.
 *
 * These are a dark UI + teal accent scheme. Swap in your own hex values to
 * re-skin the dashboard; the token shape is what the Tailwind config consumes.
 */
export const appTheme = {
  colors: {
    // Teal accent ramp.
    teal: {
      50: "#e6fbf6",
      100: "#c1f5e9",
      200: "#86ecd4",
      300: "#43dcba",
      400: "#16c79e",
      500: "#03a98a", // primary brand teal
      600: "#028870",
      700: "#066b59",
      800: "#0a5448",
      900: "#0c463d",
    },
    // Dark "ink" surfaces.
    ink: {
      950: "#08090c",
      900: "#0d0f14",
      800: "#13161d",
      700: "#1c212b",
      600: "#272d3a",
      500: "#3a4151",
    },
  },
} as const;

export type AppTheme = typeof appTheme;
