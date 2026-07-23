import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const sourceDir = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const targetDir = path.join(process.cwd(), "public", "onnxruntime");
const assets = (await readdir(sourceDir, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /^ort-wasm.*\.(?:wasm|mjs)$/.test(entry.name))
  .map(entry => entry.name)
  .sort();

if (!assets.length) throw new Error(`No ONNX Runtime WASM assets found in ${sourceDir}`);

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await Promise.all(assets.map(name => copyFile(path.join(sourceDir, name), path.join(targetDir, name))));

console.log(`Copied ${assets.length} ONNX Runtime assets: ${assets.join(", ")}`);
