import type { SlideCard } from "@cmd/carousel-render";
import { noEmDash } from "@cmd/brand";

/**
 * Build a GitHub-style repo card (rendered by the styled carousel templates)
 * from LIVE GitHub data: owner/repo, description, avatar, Contributors / Issues /
 * Stars / Forks, the dominant language, and a language color bar. Reuses the same
 * public REST API as the site's `fetchRepos`. Unauthenticated is fine for a
 * handful of repos; set GITHUB_TOKEN to raise the rate limit.
 */

const GH_HEADERS: Record<string, string> = {
  accept: "application/vnd.github+json",
  "user-agent": "content-management-dashboard",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

/** A tiny slice of GitHub's linguist color map (top languages we actually hit). */
const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Markdown: "#083fa1",
  MDX: "#fcb32c",
  Jupyter: "#DA5B0B",
  "Jupyter Notebook": "#DA5B0B",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  PHP: "#4F5D95",
  Lua: "#000080",
  Makefile: "#427819",
  Nix: "#7e7eff",
};
const LANG_FALLBACK = "#8b949e";

/** Compact numbers like GitHub: 215000 → "215k", 9000 → "9k", 1500 → "1.5k". */
function human(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${rounded}k`;
  }
  return String(n);
}

/** Read a repo's contributor count from the paginated endpoint's Link header. */
async function contributorCount(owner: string, repo: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=1`, { headers: GH_HEADERS });
    if (!res.ok) return null;
    const link = res.headers.get("link");
    if (link) {
      const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
      if (m) return parseInt(m[1]!, 10);
    }
    // No Link header → 0 or 1 contributors; count the returned array.
    const arr = (await res.json()) as unknown[];
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}

/** Top languages as color-bar segments (by bytes), capped to 6, plus the name of
 * the single dominant language (for the terminal-dev card's CLI summary line). */
async function languages(owner: string, repo: string): Promise<{ bar?: SlideCard["languageBar"]; top?: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers: GH_HEADERS });
    if (!res.ok) return {};
    const langs = (await res.json()) as Record<string, number>;
    const entries = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (!total) return {};
    return {
      bar: entries.map(([name, bytes]) => ({ color: LANG_COLORS[name] ?? LANG_FALLBACK, pct: (bytes / total) * 100 })),
      top: entries[0]?.[0],
    };
  } catch {
    return {};
  }
}

/** Fetch a full repo card for "owner/repo". Throws if the repo can't be read. */
export async function fetchRepoCard(fullName: string): Promise<SlideCard> {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`fetchRepoCard: expected "owner/repo", got "${fullName}"`);

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${fullName}`);
  const r = (await res.json()) as Record<string, unknown>;

  const [contributors, langs] = await Promise.all([contributorCount(owner, repo), languages(owner, repo)]);

  const stats: SlideCard["stats"] = [];
  if (contributors != null) stats.push({ label: "Contributors", value: human(contributors) });
  stats.push({ label: "Issues", value: human(Number(r.open_issues_count ?? 0)) });
  stats.push({ label: "Stars", value: human(Number(r.stargazers_count ?? 0)) });
  stats.push({ label: "Forks", value: human(Number(r.forks_count ?? 0)) });

  const avatar = (r.owner as Record<string, unknown> | undefined)?.avatar_url;

  return {
    kind: "repo",
    title: `${owner}/${repo}`,
    // Not our words, but it renders on our slides, so it obeys our copy rules.
    subtitle: typeof r.description === "string" ? noEmDash(r.description) : undefined,
    avatarUrl: avatar ? `${String(avatar)}${String(avatar).includes("?") ? "&" : "?"}s=200` : undefined,
    stats,
    language: langs.top,
    languageBar: langs.bar,
  };
}
