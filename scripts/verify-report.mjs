import assert from "node:assert/strict";
import { features, reference } from "../src/model.js";
export function verifyReport(report, model, fixtures, manifest) {
  assert.equal(report.schema, 1);
  assert.deepEqual(report.manifest, manifest);
  assert.match(report.context.commit, /^[a-f0-9]{40}$/);
  assert.equal(report.context.dirty, false);
  assert.ok(!("token" in report.context));
  for (const phase of ["online", "offline"]) {
    assert.deepEqual(
      report[phase].map((run) => run.backend),
      ["webgpu", "wasm"],
    );
    for (const run of report[phase]) {
      if (run.status === "blocked") {
        assert.equal(typeof run.error, "string");
        continue;
      }
      assert.equal(run.status, "ok");
      assert.equal(run.samples.length, 3 * fixtures.evaluation.length);
      for (let i = 0; i < run.samples.length; i++) {
        const sample = run.samples[i];
        const [label, text] =
          fixtures.evaluation[i % fixtures.evaluation.length];
        assert.equal(sample.text, text);
        assert.equal(sample.expected, label);
        assert.equal(sample.label, label);
        assert.equal(sample.round, Math.floor(i / fixtures.evaluation.length));
        const scores = reference(model, features(model, text));
        assert.equal(sample.scores.length, model.labels.length);
        const error = Math.max(
          ...sample.scores.map((value, j) => Math.abs(value - scores[j])),
        );
        assert.ok(Number.isFinite(error) && error <= 0.0001);
        assert.equal(sample.maxAbsoluteError, error);
        assert.ok(
          Number.isFinite(sample.milliseconds) && sample.milliseconds >= 0,
        );
      }
      assert.equal(run.unknown.length, fixtures.abstention.length);
      run.unknown.forEach((sample, i) => {
        assert.equal(sample.text, fixtures.abstention[i]);
        assert.equal(sample.label, "unknown");
        assert.deepEqual(
          sample.scores,
          reference(model, features(model, sample.text)),
        );
      });
      assert.equal(run.preCancellation.passed, true);
      if (run.backend === "webgpu") {
        for (const name of [
          "inFlightCancellation",
          "concurrentPrediction",
          "injectedDeviceLoss",
        ])
          assert.equal(run[name].passed, true);
        assert.equal(run.injectedDeviceLoss.info.reason, "destroyed");
      }
    }
  }
  assert.equal(report.checks.injectedUnavailableAdapter.backend, "wasm");
  assert.equal(
    report.checks.injectedUnavailableAdapter.result.label,
    "billing",
  );
  for (const name of [
    "invalidModel",
    "malformedWasm",
    "strictUnavailableAdapter",
    "http404",
  ])
    assert.equal(report.checks[name].passed, true);
  for (const key of ["downloads", "offlineDownloads"]) {
    assert.equal(report[key].length, 2);
    for (const asset of report[key]) {
      assert.equal(asset.bytes, manifest[asset.path.slice(1)].bytes);
      assert.ok(Number.isFinite(asset.milliseconds) && asset.milliseconds >= 0);
    }
  }
  assert.equal(report.harness.staticOutage, true);
  for (const path of [
    "/",
    "/src/app.js",
    "/public/model.json",
    "/public/kernel.wasm",
  ])
    assert.ok(report.harness.deniedRequests.some((item) => item.path === path));
  assert.equal(report.offlineControlled, true);
  assert.equal(report.cacheReady, true);
  assert.ok(Date.parse(report.finishedAt) >= Date.parse(report.startedAt));
  return true;
}
