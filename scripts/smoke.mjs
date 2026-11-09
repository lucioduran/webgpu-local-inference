import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
await mkdir("work", { recursive: true });
const dir = await mkdtemp(resolve("work/package-smoke-"));
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", dir], {
    encoding: "utf8",
  }),
)[0];
execFileSync(
  "npm",
  [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    dir,
    resolve(dir, pack.filename),
  ],
  { stdio: "pipe" },
);
const root = resolve(dir, "node_modules/webgpu-local-inference");
const { createEngine } = await import(
  pathToFileURL(resolve(root, "src/engine.js"))
);
const model = JSON.parse(
  await readFile(resolve(root, "public/model.json"), "utf8"),
);
const wasmBytes = await readFile(resolve(root, "public/kernel.wasm"));
const engine = await createEngine(model, { backend: "wasm", wasmBytes });
assert.equal((await engine.predict("refund payment")).label, "billing");
engine.dispose();
for (const path of [
  "index.html",
  "sw.js",
  "data/fixtures.json",
  "src/benchmark.js",
])
  assert.ok((await readFile(resolve(root, path))).length > 0);
console.log(
  "Installed tarball offline: real WASM prediction and browser assets passed.",
);
