#!/usr/bin/env node
/**
 * Product rename: upstream "Velo" -> fork "NAI E-Mail" (one-way, permanent).
 *
 * The fork is permanently branded as NAI E-Mail. The tree is committed in the
 * branded state and the upstream name is never restored, so `denaiise` is
 * disabled forever. `naiise` remains available (idempotent) so a fresh clone
 * or a rebase/merge that brought upstream names back can be re-branded in one
 * step.
 *
 *   node scripts/naiise.mjs naiise     # Velo -> NAI E-Mail (idempotent)
 *   node scripts/naiise.mjs naiise --dry-run
 *   node scripts/naiise.mjs denaiise   # ERROR — permanently disabled
 *
 * or through npm: `npm run naiise`. `npm run build` builds the branded app
 * directly (the tree is already branded; no round-trip is performed).
 *
 * Design notes:
 * - Every replacement is ordered so no token collides: the full identifier
 *   and "Velo Pro" are replaced before the boundary-matched short forms.
 *   Running the direction twice is a no-op (idempotent).
 * - Historical values that must survive are either protected strings
 *   (upstream URLs, the velomail.app domain) or, in Rust, spelled with a hex
 *   escape (`\x76elopro`) so no rule can match them — see
 *   `PREVIOUS_IDENTIFIER`/`PREVIOUS_SERVICE` in src-tauri/src.
 * - Excluded from renaming: `.git`, node_modules, .kilo worktrees, build
 *   output, `.github` release/CI infrastructure (it points at upstream
 *   repos), LICENSE/NOTICE (legal text), release-please config, the
 *   generated semantic-runtime bundle and this script itself.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MODE = process.argv[2] ?? "naiise";
const DRY_RUN = process.argv.includes("--dry-run");

if (MODE === "denaiise") {
  console.error(`denaiise is permanently disabled: the fork is NAI E-Mail and stays that way.`);
  process.exit(1);
}

if (MODE !== "naiise") {
  console.error(`Usage: node scripts/naiise.mjs naiise [--dry-run]`);
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Exact strings that must never be renamed (upstream references). */
const PROTECTED = [
  "github.com/ArneNostitz/velo",
  "github.com/avihaymenahem/velo",
  "github.com/cyberluke/velo",
  "homebrew-velo",
  "velomail.app",
];

/** Ordered [from, to] pairs. String pairs are exact; RegExp pairs use /g. */
const RULES = [
  ["com.anydaysomething.velopro", "com.anydaysomething.naiemail"],
  ["Velo Pro", "NAI E-Mail"],
  [/\bVelo\b/g, "NAI"],
  [/\bvelo\b/g, "naiemail"],
];

/** Directories skipped by name at any depth. */
const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  ".kilo",
  "dist",
  "target",
  ".github",
  "semantic-runtime",
  ".svelte-kit",
  ".wrangler",
  ".vercel",
]);

/** Exact relative paths skipped entirely. */
const EXCLUDED_FILES = new Set([
  "LICENSE",
  "NOTICE",
  "release-please-config.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "bun.lock",
  "scripts/naiise.mjs",
]);

function transform(text) {
  const sentinels = [];
  let out = text;
  PROTECTED.forEach((value, i) => {
    out = out.split(value).join(`\u0000S${i}\u0000`);
  });
  for (const [from, to] of RULES) {
    out = typeof from === "string" ? out.split(from).join(to) : out.replace(from, to);
  }
  PROTECTED.forEach((value, i) => {
    out = out.split(`\u0000S${i}\u0000`).join(value);
  });
  return out;
}

function isBinary(content) {
  return content.includes("\u0000");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (EXCLUDED_DIRS.has(entry)) continue;
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (EXCLUDED_FILES.has(rel)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

let contentChanged = 0;
let renamedFiles = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable (locked, permissions) — leave alone
  }

  if (!isBinary(content)) {
    const next = transform(content);
    if (next !== content) {
      if (!DRY_RUN) writeFileSync(file, next);
      contentChanged++;
      console.log(`  content: ${rel}`);
    }
  }

  const base = basename(file);
  const nextBase = transform(base);
  if (nextBase !== base) {
    const nextFile = join(dirname(file), nextBase);
    if (!DRY_RUN) renameSync(file, nextFile);
    renamedFiles++;
    console.log(`  rename:  ${rel} -> ${relative(ROOT, nextFile).replaceAll("\\", "/")}`);
  }
}

const direction = "Velo -> NAI E-Mail";
console.log(
  `\n${DRY_RUN ? "[dry-run] " : ""}${MODE}: ${direction} — ` +
    `${contentChanged} files with changed content, ${renamedFiles} files renamed.`,
);