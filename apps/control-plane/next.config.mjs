import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadRootEnv } from "dotenv";

// The whole monorepo is configured from ONE .env at the repo root. Next.js only
// reads .env from the app directory, so load the root file here (existing
// process env — e.g. from a deploy platform — always wins; dotenv never overrides).
loadRootEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The control plane imports TS workspace packages directly; let Next transpile them.
  transpilePackages: [
    "@cmd/contracts",
    "@cmd/db",
    "@cmd/generation",
    "@cmd/integrations",
    "@cmd/orchestrator",
    "@cmd/brand",
    "@cmd/carousel-render",
  ],
  // Prisma's client and the native/heavy render libs stay outside the bundle.
  serverExternalPackages: ["@prisma/client", "@resvg/resvg-js", "satori", "sharp"],
  // Serve runtime-rendered slides from the storage dir/volume when no static
  // file matches (afterFiles = static public/ wins first; this is the fallback).
  async rewrites() {
    return { afterFiles: [{ source: "/carousels/:path*", destination: "/api/carousels/:path*" }] };
  },
  // Workspace packages use ESM-style `.js` import specifiers that point at `.ts`
  // source. Map them back so webpack resolves the TypeScript files.
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    // @resvg/resvg-js ships a native .node binary. Because the renderer lives in
    // a transpilePackages workspace, webpack would otherwise try to bundle that
    // binary. Keep it external so Node require()s it at runtime (server only).
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        { "@resvg/resvg-js": "commonjs @resvg/resvg-js", sharp: "commonjs sharp" },
      ];
    }
    return config;
  },
};

export default nextConfig;
