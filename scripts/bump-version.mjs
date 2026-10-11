// Bumps the version once five changelog entries have accumulated.
//
//   node scripts/bump-version.mjs            move 5 pending items into a release
//   node scripts/bump-version.mjs --dry      show what would happen
//
// Entries live in public/assets/data/changelog.json under `pending`. Whenever
// five of them are waiting, they are folded into a new release, the patch
// number of the version moves forward by one (0.1.0 -> 0.1.1), and both
// package.json and assets/js/core.js are rewritten to match.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CHANGELOG = path.join(ROOT, "public", "assets", "data", "changelog.json");
const PACKAGE = path.join(ROOT, "package.json");
const CORE = path.join(ROOT, "public", "assets", "js", "core.js");
const PER_RELEASE = 5;
const dry = process.argv.includes("--dry");

const read = (file) => readFile(file, "utf8");
const write = (file, text) => (dry ? Promise.resolve() : writeFile(file, text));

const bumpPatch = (version) => {
  const parts = String(version).split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
};

const changelog = JSON.parse(await read(CHANGELOG));
const pending = Array.isArray(changelog.pending) ? changelog.pending : [];

if (pending.length < PER_RELEASE) {
  console.log(`[BUMP] ${pending.length}/${PER_RELEASE} changes waiting. Nothing to do — still v${changelog.version}.`);
  process.exit(0);
}

const released = pending.slice(0, PER_RELEASE);
changelog.pending = pending.slice(PER_RELEASE);
const next = bumpPatch(changelog.version);
changelog.version = next;
changelog.releases = [{ version: next, date: new Date().toISOString().slice(0, 10), items: released }, ...(changelog.releases || [])];

const packageText = await read(PACKAGE);
const coreText = await read(CORE);

await write(CHANGELOG, JSON.stringify(changelog, null, 2) + "\n");
await write(PACKAGE, packageText.replace(/"version":\s*"[^"]+"/, `"version": "${next}"`));
await write(
  CORE,
  coreText.replace(/const VERSION = "[^"]+";/, `const VERSION = "${next}";`)
);

console.log(`[BUMP] v${changelog.version} -> v${next} (${released.length} changes released, ${changelog.pending.length} still pending)${dry ? " [dry run]" : ""}`);
for (const item of released) console.log(`  - [${item.kind}] ${item.text}`);
