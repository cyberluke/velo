#!/usr/bin/env node
/**
 * Emit `latest.json` for the fork's GitHub releases after a branded build.
 *
 * `tauri build` signs the updater artifacts (`*.sig`) when
 * `bundle.createUpdaterArtifacts` is enabled, but the bundled CLI does not
 * produce the `latest.json` manifest the updater checks. This script reads
 * the signed bundles from `src-tauri/target/release/bundle` and writes
 * `latest.json` next to them.
 *
 * Run on the naiised tree (inside `npm run build:nai`, i.e. with the
 * branded product name and endpoint in tauri.conf.json):
 *
 *   node scripts/updater-json.mjs
 *
 * The asset URLs are derived from `plugins.updater.endpoints` (the trailing
 * `latest.json` is replaced by the installer file name). Upload
 * `latest.json` together with the signed installers to the same GitHub
 * release.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const config = JSON.parse(
  readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);
const endpoint = config.plugins?.updater?.endpoints?.[0];
if (!endpoint) {
  console.error("updater-json: plugins.updater.endpoints[0] is not set in tauri.conf.json");
  process.exit(1);
}
// https://github.com/<owner>/<repo>/releases/latest/download/latest.json
// -> https://github.com/<owner>/<repo>/releases/latest/download/
const assetBase = endpoint.replace(/latest\.json$/, "");

const version = config.version;
const bundleDir = join(ROOT, "src-tauri", "target", "release", "bundle");

const candidates = readdirSync(bundleDir, { recursive: true })
  .filter((f) => /\.(msi|exe|app\.tar\.gz|deb)$/.test(f))
  .map((f) => join(bundleDir, f))
  .filter((p) => {
    try {
      return readFileSync(`${p}.sig`, "utf8").length > 0;
    } catch {
      return false; // unsigned (updater artifacts disabled) — skip
    }
  });

if (candidates.length === 0) {
  console.error(
    "updater-json: no signed updater artifacts found under",
    bundleDir,
    "\n(build with bundle.createUpdaterArtifacts: true and the signing key set)",
  );
  process.exit(1);
}

function platformKey(file) {
  const name = basename(file);
  if (name.endsWith(".msi") || name.endsWith("-setup.exe")) return "windows-x86_64";
  if (name.endsWith(".app.tar.gz")) {
    return name.includes("aarch64") ? "darwin-aarch64" : "darwin-x86_64";
  }
  if (name.endsWith(".deb")) {
    return name.includes("arm64") ? "linux-aarch64" : "linux-x86_64";
  }
  return null;
}

// Windows may produce both MSI and NSIS; JSON keys are unique, so the NSIS
// installer wins (passive/quiet install, the usual updater choice).
const byPlatform = new Map();
for (const file of candidates) {
  const key = platformKey(file);
  if (!key) continue;
  const entry = {
    signature: readFileSync(`${file}.sig`, "utf8").trim(),
    url: `${assetBase}${basename(file)}`,
  };
  const current = byPlatform.get(key);
  if (!current || (current.url.endsWith(".msi") && file.endsWith("-setup.exe"))) {
    byPlatform.set(key, entry);
  }
}

const latest = {
  version,
  notes: version,
  pub_date: new Date().toISOString(),
  platforms: Object.fromEntries(byPlatform),
};

const outPath = join(bundleDir, "latest.json");
writeFileSync(outPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(
  `updater-json: wrote ${outPath} (${version}) for ` +
    `${[...byPlatform.keys()].join(", ")}`,
);