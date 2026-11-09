import { createEngine } from "./engine.js";
import { features, reference } from "./model.js";
import { loadAssets, cacheApp } from "./app.js";
const pendingKey = "ticket-benchmark-pending";
async function expectError(fn) {
  try {
    await fn();
    return { passed: false, error: null };
  } catch (error) {
    return { passed: true, error: String(error) };
  }
}
async function runBackend(backend, assets, fixtures) {
  const start = performance.now();
  let engine;
  try {
    engine = await createEngine(assets.model, { ...assets, backend });
    const initializationMs = performance.now() - start;
    const samples = [];
    for (let round = 0; round < 3; round++)
      for (const [expected, text] of fixtures.evaluation) {
        const started = performance.now();
        const result = await engine.predict(text);
        const milliseconds = performance.now() - started;
        const expectedScores = reference(
          assets.model,
          features(assets.model, text),
        );
        samples.push({
          round,
          text,
          expected,
          ...result,
          milliseconds,
          maxAbsoluteError: Math.max(
            ...result.scores.map((s, i) => Math.abs(s - expectedScores[i])),
          ),
        });
      }
    const unknown = [];
    for (const text of fixtures.abstention)
      unknown.push({ text, ...(await engine.predict(text)) });
    const abort = new AbortController();
    abort.abort();
    const preCancellation = await expectError(() =>
      engine.predict("invoice", { signal: abort.signal }),
    );
    let inFlightCancellation = null;
    let injectedDeviceLoss = null;
    let concurrentPrediction = null;
    if (backend === "webgpu") {
      const inFlight = new AbortController();
      const prediction = engine.predict("invoice", { signal: inFlight.signal });
      inFlight.abort();
      inFlightCancellation = await expectError(() => prediction);
      const first = engine.predict("password");
      concurrentPrediction = await expectError(() => engine.predict("parcel"));
      await first;
      const info = await engine.destroyForTest();
      injectedDeviceLoss = {
        kind: "explicit device.destroy, not spontaneous",
        info,
        ...(await expectError(() => engine.predict("invoice"))),
      };
    }
    return {
      backend,
      status: "ok",
      initializationMs,
      adapter: engine.adapter ?? null,
      allocatedBytes: engine.allocatedBytes,
      samples,
      unknown,
      preCancellation,
      inFlightCancellation,
      concurrentPrediction,
      injectedDeviceLoss,
    };
  } catch (error) {
    return { backend, status: "blocked", error: String(error) };
  } finally {
    engine?.dispose();
  }
}
export async function benchmark(show) {
  show(
    "Running fixed workload. Keep this tab open through the offline reload.",
  );
  const contextResponse = await fetch("/api/context");
  if (!contextResponse.ok)
    throw new Error("Start the locked harness before evaluation");
  const context = await contextResponse.json();
  const assets = await loadAssets();
  const fixtures = await (await fetch("/data/fixtures.json")).json();
  const manifest = await (await fetch("/public/manifest.json")).json();
  const report = {
    schema: 1,
    context,
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    secureContext: isSecureContext,
    manifest,
    downloads: assets.observations,
    online: [],
    checks: {},
  };
  for (const backend of ["webgpu", "wasm"])
    report.online.push(await runBackend(backend, assets, fixtures));
  const fallback = await createEngine(assets.model, {
    ...assets,
    gpu: { requestAdapter: async () => null },
  });
  report.checks.injectedUnavailableAdapter = {
    backend: fallback.backend,
    reason: fallback.fallbackReason,
    result: await fallback.predict("refund invoice"),
  };
  fallback.dispose();
  report.checks.invalidModel = await expectError(() =>
    createEngine({}, assets),
  );
  report.checks.malformedWasm = await expectError(() =>
    createEngine(assets.model, {
      backend: "wasm",
      wasmBytes: new Uint8Array([0, 1, 2]),
    }),
  );
  report.checks.strictUnavailableAdapter = await expectError(() =>
    createEngine(assets.model, {
      ...assets,
      backend: "webgpu",
      gpu: { requestAdapter: async () => null },
    }),
  );
  report.checks.http404 = await expectError(async () => {
    const r = await fetch("/missing-model.json");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  await cacheApp();
  report.cacheReady = Boolean(navigator.serviceWorker.controller);
  report.resourceTimings = performance
    .getEntriesByType("resource")
    .map(({ name, transferSize, encodedBodySize, duration }) => ({
      path: new URL(name).pathname,
      transferSize,
      encodedBodySize,
      duration,
    }));
  sessionStorage.setItem(pendingKey, JSON.stringify(report));
  await fetch("/api/offline", {
    method: "POST",
    headers: { "X-Run-Token": context.token },
  });
  location.href = "/?stage=offline";
}
export async function offlineStage(show) {
  show(
    "Running from cached assets while the origin denies static downloads...",
  );
  const report = JSON.parse(sessionStorage.getItem(pendingKey));
  if (!report) throw new Error("No pending evaluation");
  try {
    const assets = await loadAssets();
    const fixtures = await (await fetch("/data/fixtures.json")).json();
    report.offline = [];
    for (const backend of ["webgpu", "wasm"])
      report.offline.push(await runBackend(backend, assets, fixtures));
    report.offlineDownloads = assets.observations;
    report.offlineControlled = Boolean(navigator.serviceWorker.controller);
  } catch (error) {
    report.offlineError = String(error);
  }
  report.finishedAt = new Date().toISOString();
  const response = await fetch("/api/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Run-Token": report.context.token,
    },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`Report rejected ${response.status}`);
  sessionStorage.removeItem(pendingKey);
  show({
    message: "Evaluation complete. Raw report saved by the locked harness.",
    online: report.online.map(({ backend, status, samples, error }) => ({
      backend,
      status,
      correct: samples?.filter((s) => s.label === s.expected).length,
      total: samples?.length,
      error,
    })),
    offline: report.offline?.map(({ backend, status }) => ({
      backend,
      status,
    })),
    checks: report.checks,
  });
}
