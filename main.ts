// gta6-meme-x-01 entry: copy the meme image and the X post link into the
// output directory the harness reads. Node 22, standard library only.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR;
if (!outDir) {
  console.error("MAKEFUN_OUTPUT_DIR is not set");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const name of ["meme.png", "POST.json"]) {
  copyFileSync(join(here, name), join(outDir, name));
  console.log(`copied ${name} -> ${join(outDir, name)}`);
}
