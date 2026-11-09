import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyReport } from "../scripts/verify-report.mjs";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const report = await read("evidence/browser-1794256500335.json");
const model = await read("public/model.json");
const fixtures = await read("data/fixtures.json");
const manifest = await read("public/manifest.json");
test("recorded real browser report is internally consistent", () =>
  assert.equal(verifyReport(report, model, fixtures, manifest), true));
test("report verification rejects changed scores, missing checks and unsupported offline claims", () => {
  const mutations = [
    (r) => {
      r.online[0].samples[0].scores[0] += 1;
    },
    (r) => {
      r.offline[1].samples.pop();
    },
    (r) => {
      r.checks.malformedWasm.passed = false;
    },
    (r) => {
      r.harness.deniedRequests = [];
    },
    (r) => {
      r.online[0].injectedDeviceLoss.info.reason = "unknown";
    },
    (r) => {
      r.downloads[0].bytes = 0;
    },
    (r) => {
      r.context.token = "must-not-be-published";
    },
    (r) => {
      r.manifest["public/model.json"].sha256 = "changed";
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(report);
    mutate(copy);
    assert.throws(() => verifyReport(copy, model, fixtures, manifest));
  }
});
