// Copy onnxruntime-web's browser runtime into public/engine/ort/ so the
// human-bot worker can load it like Stockfish: a plain file, no bundler.
// Runs before `dev` and `build`; the output is gitignored (~11 MB of WASM
// that is always reproducible from node_modules).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "onnxruntime-web", "dist");
const dest = join(root, "public", "engine", "ort");
const files = ["ort.wasm.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`copied ${files.length} onnxruntime-web files -> public/engine/ort/`);
