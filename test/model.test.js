import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  train,
  tokenize,
  features,
  reference,
  classify,
} from "../src/model.js";
import { createEngine } from "../src/engine.js";
const fixtures = JSON.parse(
  await readFile(new URL("../data/fixtures.json", import.meta.url)),
);
const model = JSON.parse(
  await readFile(new URL("../public/model.json", import.meta.url)),
);
const wasmBytes = await readFile(
  new URL("../public/kernel.wasm", import.meta.url),
);
test("deterministic training uses only the training partition", () => {
  assert.deepEqual(train(fixtures), model);
  assert.deepEqual(
    train({ ...fixtures, evaluation: [], development: [] }),
    model,
  );
});
test("tokenizer validates and normalizes", () => {
  assert.deepEqual(tokenize("CARD, Reset! 12"), ["card", "reset"]);
  assert.throws(() => tokenize(null));
  assert.throws(() => tokenize("x".repeat(10001)));
});
test("partitions are distinct", () => {
  const rows = [
    ...fixtures.train,
    ...fixtures.development,
    ...fixtures.evaluation,
  ].map(([, text]) => text);
  assert.equal(new Set(rows).size, rows.length);
});
test("real WASM matches float32 reference on all fixed cases", async () => {
  const engine = await createEngine(model, { backend: "wasm", wasmBytes });
  for (const [expected, text] of [
    ...fixtures.development,
    ...fixtures.evaluation,
  ]) {
    const result = await engine.predict(text);
    assert.equal(result.label, expected);
    assert.deepEqual(result.scores, reference(model, features(model, text)));
  }
  for (const text of fixtures.abstention)
    assert.equal((await engine.predict(text)).label, "unknown");
  engine.dispose();
  await assert.rejects(() => engine.predict("invoice"), /disposed/);
});
test("unknown inputs abstain and ties choose first class", () => {
  assert.equal(
    classify(model, features(model, ""), [1, 1, 1]).label,
    "unknown",
  );
  assert.equal(
    classify(model, features(model, "card"), [1, 1, 1]).label,
    "billing",
  );
});
test("unavailable and throwing adapters fall back only in auto mode", async () => {
  for (const gpu of [
    { requestAdapter: async () => null },
    {
      requestAdapter: async () => {
        throw Error("denied");
      },
    },
  ]) {
    const engine = await createEngine(model, { wasmBytes, gpu });
    assert.equal(engine.backend, "wasm");
    assert.ok(engine.fallbackReason);
    engine.dispose();
    await assert.rejects(() =>
      createEngine(model, { backend: "webgpu", wasmBytes, gpu }),
    );
  }
});
test("invalid model, backend, WASM, input and cancellation reject", async () => {
  await assert.rejects(() => createEngine({}, {}), /Invalid model/);
  await assert.rejects(
    () => createEngine({ ...model, weights: [NaN] }, {}),
    /Invalid model/,
  );
  await assert.rejects(
    () => createEngine(model, { backend: "fake" }),
    /Unknown backend/,
  );
  await assert.rejects(() =>
    createEngine(model, { backend: "wasm", wasmBytes: new Uint8Array([1]) }),
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    () => createEngine(model, { wasmBytes, signal: abort.signal }),
    { name: "AbortError" },
  );
  const engine = await createEngine(model, { backend: "wasm", wasmBytes });
  await assert.rejects(
    () => engine.predict("invoice", { signal: abort.signal }),
    { name: "AbortError" },
  );
  await assert.rejects(() => engine.predict(null), TypeError);
  engine.dispose();
});
