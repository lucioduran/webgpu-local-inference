import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { verifyReport } from "./verify-report.mjs";
import { createEngine } from "../src/engine.js";
import { features, reference } from "../src/model.js";
const model = JSON.parse(await readFile("public/model.json", "utf8"));
const fixtures = JSON.parse(await readFile("data/fixtures.json", "utf8"));
const wasmBytes = await readFile("public/kernel.wasm");
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
for (const [path, entry] of Object.entries(manifest))
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    entry.sha256,
    path,
  );
const engine = await createEngine(model, { backend: "wasm", wasmBytes });
let count = 0;
for (const [expected, text] of fixtures.evaluation) {
  const result = await engine.predict(text);
  assert.equal(result.label, expected);
  assert.deepEqual(result.scores, reference(model, features(model, text)));
  count++;
}
engine.dispose();
const browserFiles = (await readdir("evidence")).filter((name) =>
  /^browser-\d+\.json$/.test(name),
);
for (const file of browserFiles) {
  const report = JSON.parse(await readFile(`evidence/${file}`, "utf8"));
  verifyReport(report, model, fixtures, manifest);
}
console.log(
  `Offline replay: ${count}/${count} synthetic cases correct in Node WASM, exact float32 reference agreement.`,
);
console.log(
  `Browser reports checked: ${browserFiles.length}. Consistency checks do not establish authenticity or compatibility.`,
);
if (!browserFiles.length)
  console.log(
    "Browser WebGPU, browser WASM and offline startup remain UNVERIFIED. See evidence/browser-blocker.json.",
  );
