import { createEngine } from "./engine.js";
import { benchmark, offlineStage } from "./benchmark.js";
const status = document.querySelector("#status");
const show = (value) => {
  status.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
};
let controller;
let running = false;
export async function loadAssets() {
  const observations = [];
  const load = async (path) => {
    const start = performance.now();
    const response = await fetch(path);
    if (!response.ok)
      throw new Error(`Download failed: ${path} ${response.status}`);
    const bytes = await response.arrayBuffer();
    observations.push({
      path,
      bytes: bytes.byteLength,
      milliseconds: performance.now() - start,
    });
    return bytes;
  };
  const model = JSON.parse(
    new TextDecoder().decode(await load("/public/model.json")),
  );
  const wasmBytes = await load("/public/kernel.wasm");
  return { model, wasmBytes, observations };
}
export async function cacheApp() {
  if (!navigator.serviceWorker) throw new Error("Service workers unavailable");
  await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller)
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {
        once: true,
      }),
    );
}
async function action(fn) {
  if (running) return;
  running = true;
  try {
    await fn();
  } catch (error) {
    show({ error: String(error) });
  } finally {
    running = false;
  }
}
document.querySelector("#predict").onclick = () =>
  action(async () => {
    controller = new AbortController();
    show("Loading local model...");
    const assets = await loadAssets();
    const engine = await createEngine(assets.model, {
      ...assets,
      backend: document.querySelector("#backend").value,
      signal: controller.signal,
    });
    try {
      show({
        backend: engine.backend,
        fallbackReason: engine.fallbackReason,
        ...(await engine.predict(document.querySelector("#text").value, {
          signal: controller.signal,
        })),
      });
    } finally {
      engine.dispose();
    }
  });
document.querySelector("#cancel").onclick = () => controller?.abort();
document.querySelector("#cache").onclick = () =>
  action(async () => {
    await cacheApp();
    show(
      "Offline cache ready. This browser can reopen the app at this address.",
    );
  });
document.querySelector("#benchmark").onclick = () =>
  action(() => benchmark(show));
if (new URL(location.href).searchParams.get("stage") === "offline")
  action(() => offlineStage(show));
