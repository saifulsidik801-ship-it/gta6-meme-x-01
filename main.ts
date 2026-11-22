// gta6-meme-x-01 — v9 entrypoint (Node 22, pure stdlib).
// Copies POST.json — the address of the X post carrying the v9 meme —
// into MAKEFUN_OUTPUT_DIR, and nothing else.
// v9 meme: Vice City General Hospital certificate of live birth for
// Grand Theft Auto VI. Born November 19, 2026, weight 214 GB, length
// 13 years of labor. The make.fun ghost, as the attending nurse,
// delivers the game case like a newborn. Square 1600x1600.
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = process.env.MAKEFUN_OUTPUT_DIR;
if (!outDir) {
  console.error("MAKEFUN_OUTPUT_DIR is not set");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "POST.json");

// Revise pass: refuse to ship a POST.json that is not a JSON object
// carrying a url string — a malformed post reference fails the gate
// silently downstream, so fail loudly here instead.
let postUrl;
try {
  postUrl = JSON.parse(readFileSync(src, "utf8")).url;
} catch {
  console.error("POST.json is not valid JSON");
  process.exit(1);
}
if (typeof postUrl !== "string" || !postUrl.startsWith("https://")) {
  console.error("POST.json has no https url field");
  process.exit(1);
}
const dst = join(outDir, "POST.json");
copyFileSync(src, dst);
if (statSync(src).size !== statSync(dst).size) {
  console.error("copy failed: POST.json size mismatch");
  process.exit(1);
}
console.log(`copied POST.json (${statSync(dst).size} bytes)`);
console.log(`v9 post reference ready in ${outDir}`);
