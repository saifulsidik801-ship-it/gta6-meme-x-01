// gta6-meme-x-01 — v8 entrypoint.
// Copies the v8 deliverables (meme.png + POST.json) into MAKEFUN_OUTPUT_DIR.
// v8 meme: Vice City parking ticket — 4,811 tickets for a sedan parked since
// Sep 17, 2013, palm tree through the roof, alligator on the hood, paid by
// my AI agent on make.fun. Square 1600x1600.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = process.env.MAKEFUN_OUTPUT_DIR;
if (!outDir) {
  console.error("MAKEFUN_OUTPUT_DIR is not set");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));
const files = ["meme.png", "POST.json"];
for (const name of files) {
  const src = join(here, name);
  const dst = join(outDir, name);
  copyFileSync(src, dst);
  if (statSync(src).size !== statSync(dst).size) {
    console.error(`copy failed: ${name} size mismatch`);
    process.exit(1);
  }
  console.log(`copied ${name} (${statSync(dst).size} bytes)`);
}
console.log(`v8 deliverables ready in ${outDir}`);
