/**
 * Tool/company logo resolution for social proof on slides. Maps the tool names
 * the composer mentions (e.g. "Opus Clips") to a domain, then to a logo URL via
 * Google's favicon service — a free, reliable source that returns a clean
 * 128×128 PNG (app-icon style) for virtually any company domain.
 *
 * Editorial/nominative use: showing a product's logo to refer to that product
 * in how-to content is standard. Keep logos to genuine references.
 */

/** Known AI tools the brand covers → their domain. Extend freely. */
export const LOGO_DOMAINS: Record<string, string> = {
  "opus clips": "opus.pro",
  opusclip: "opus.pro",
  higgsfield: "higgsfield.ai",
  fireflies: "fireflies.ai",
  "chatgpt": "openai.com",
  "gpt": "openai.com",
  "gpt image": "openai.com",
  "dall-e": "openai.com",
  openai: "openai.com",
  codex: "openai.com",
  claude: "claude.ai",
  anthropic: "claude.ai",
  "claude code": "claude.ai",
  whisper: "openai.com",
  ollama: "ollama.com",
  python: "python.org",
  mcp: "modelcontextprotocol.io",
  "model context protocol": "modelcontextprotocol.io",
  gemini: "gemini.google.com",
  grok: "x.ai",
  perplexity: "perplexity.ai",
  midjourney: "midjourney.com",
  "stable diffusion": "stability.ai",
  canva: "canva.com",
  notion: "notion.so",
  zapier: "zapier.com",
  make: "make.com",
  n8n: "n8n.io",
  leon: "getleon.ai",
  arwes: "arwes.dev",
  composio: "composio.dev",
  livekit: "livekit.io",
  firecrawl: "firecrawl.dev",
  crewai: "crewai.com",
  dify: "dify.ai",
  gmail: "gmail.com",
  slack: "slack.com",
  github: "github.com",
  linear: "linear.app",
  elevenlabs: "elevenlabs.io",
  runway: "runwayml.com",
  pika: "pika.art",
  gamma: "gamma.app",
  capcut: "capcut.com",
  descript: "descript.com",
  suno: "suno.com",
  udio: "udio.com",
  heygen: "heygen.com",
  synthesia: "synthesia.io",
  v0: "v0.dev",
  cursor: "cursor.com",
  lovable: "lovable.dev",
  bolt: "bolt.new",
  replit: "replit.com",
  framer: "framer.com",
  webflow: "webflow.com",
  wix: "wix.com",
};

/**
 * Resolve a tool name (or a raw domain) to a domain. Returns null if we can't
 * confidently map it — better no logo than the wrong one.
 */
export function logoDomainFor(toolOrDomain: string | undefined): string | null {
  if (!toolOrDomain) return null;
  const t = toolOrDomain.trim().toLowerCase();
  if (!t) return null;
  // Already a domain (has a dot, no spaces).
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) return t;
  if (LOGO_DOMAINS[t]) return LOGO_DOMAINS[t];
  // Fuzzy contains-match against known tool names.
  for (const [name, domain] of Object.entries(LOGO_DOMAINS)) {
    if (t.includes(name) || name.includes(t)) return domain;
  }
  return null;
}

/** A logo image URL (128×128 PNG) for a domain, via Google's favicon service. */
export function logoUrlForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/**
 * The canonical https:// homepage for a tool (or raw domain), or null when we
 * can't confidently map it. Used to turn the tools a carousel mentions into real
 * "where to get it" links in the long-form resource articles.
 */
export function toolUrlFor(toolOrDomain: string | undefined): string | null {
  const domain = logoDomainFor(toolOrDomain);
  return domain ? `https://${domain}` : null;
}

/** Convenience: tool name → logo URL, or null if unknown. */
export function logoUrlForTool(toolOrDomain: string | undefined): string | null {
  const domain = logoDomainFor(toolOrDomain);
  return domain ? logoUrlForDomain(domain) : null;
}
