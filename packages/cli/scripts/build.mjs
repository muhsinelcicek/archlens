#!/usr/bin/env node
/**
 * Build pipeline for archlens-studio:
 *  1. Clean dist/
 *  2. Bundle src/index.ts with esbuild — @archlens/* workspace deps are inlined,
 *     native (tree-sitter) and complex (MCP SDK) deps stay external.
 *  3. Copy packages/web/dist → dist/web so `archlens-studio serve` ships the UI.
 */
import { build } from "esbuild";
import { readFile, rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");
const distDir = path.join(cliRoot, "dist");
const webDist = path.join(repoRoot, "packages/web/dist");

// ── Read package.json to derive externals ────────────────────────────
const pkg = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf-8"));
// External everything in `dependencies` — keep workspace @archlens/* bundled
const external = Object.keys(pkg.dependencies ?? {});

console.log(`[build] cleaning ${distDir}`);
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

// ── Bundle CLI ───────────────────────────────────────────────────────
console.log(`[build] bundling src/index.ts → dist/index.js`);
console.log(`[build]   external: ${external.join(", ")}`);

// Alias workspace packages to their TS source so we bypass their tsc builds
// (MCP's strict zod generics cause TS2589 — esbuild doesn't type-check).
const alias = {
  "@archlens/core": path.join(repoRoot, "packages/core/src/index.ts"),
  "@archlens/mcp": path.join(repoRoot, "packages/mcp/src/index.ts"),
};

await build({
  entryPoints: [path.join(cliRoot, "src/index.ts")],
  outfile: path.join(distDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  external,
  alias,
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'module';\nconst require = __createRequire(import.meta.url);" },
  logLevel: "info",
  treeShaking: true,
  sourcemap: false,
  minify: false,
});

// ── Copy web dist ────────────────────────────────────────────────────
if (existsSync(webDist)) {
  console.log(`[build] copying ${webDist} → dist/web`);
  await cp(webDist, path.join(distDir, "web"), { recursive: true });
} else {
  console.warn(`[build] ⚠ packages/web/dist not found — build web first with 'pnpm --filter @archlens/web build'`);
}

console.log(`[build] ✓ done`);
