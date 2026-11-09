import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
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
  assert.equal(report.schema, 1);
  assert.deepEqual(report.manifest, manifest);
  for (const phase of ["online", "offline"]) {
    assert.equal(report[phase].length, 2);
    for (const run of report[phase]) {
      if (run.status === "blocked") {
        assert.equal(typeof run.error, "string");
        continue;
      }
      assert.equal(run.status, "ok");
      assert.equal(run.samples.length, 36);
      for (let i = 0; i < 36; i++) {
        const sample = run.samples[i];
        const [label, text] = fixtures.evaluation[i % 12];
        assert.equal(sample.text, text);
        assert.equal(sample.expected, label);
        assert.equal(sample.label, label);
        assert.equal(sample.round, Math.floor(i / 12));
        const scores = reference(model, features(model, text));
        assert.equal(sample.scores.length, 3);
        sample.scores.forEach((value, j) =>
          assert.ok(
            Number.isFinite(value) && Math.abs(value - scores[j]) <= 0.0001,
          ),
        );
        assert.ok(
          Number.isFinite(sample.milliseconds) && sample.milliseconds >= 0,
        );
      }
      assert.ok(run.unknown.every((value) => value.label === "unknown"));
      assert.equal(run.preCancellation.passed, true);
      if (run.backend === "webgpu")
        for (const name of [
          "inFlightCancellation",
          "concurrentPrediction",
          "injectedDeviceLoss",
        ])
          assert.equal(run[name].passed, true);
    }
  }
  assert.equal(report.harness.staticOutage, true);
  assert.ok(
    report.harness.deniedRequests.some(
      (item) => item.path === "/public/model.json",
    ),
  );
  assert.ok(
    report.harness.deniedRequests.some(
      (item) => item.path === "/public/kernel.wasm",
    ),
  );
  assert.equal(report.offlineControlled, true);
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
