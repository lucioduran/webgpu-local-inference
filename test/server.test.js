import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
test("static server serves app, rejects missing paths and disables report APIs", async () => {
  const child = spawn(process.execPath, ["scripts/server.mjs"], {
    env: {
      ...process.env,
      PORT: "18025",
      GIT_DIR: "work/nonexistent-git-metadata",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(Error("Server startup timeout")),
          5000,
        );
        t.unref();
      }),
    ]);
    const root = "http://127.0.0.1:18025";
    assert.match(await (await fetch(root)).text(), /Local ticket inference/);
    assert.equal(
      (await fetch(root + "/public/kernel.wasm")).headers.get("content-type"),
      "application/wasm",
    );
    assert.equal((await fetch(root + "/not-present")).status, 404);
    assert.equal((await fetch(root + "/api/context")).status, 403);
    assert.equal((await fetch(root + "/package.json")).status, 404);
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
