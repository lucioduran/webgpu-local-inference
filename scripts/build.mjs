import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import wabtFactory from "wabt";
import { train } from "../src/model.js";
await mkdir("public", { recursive: true });
const fixtures = JSON.parse(await readFile("data/fixtures.json", "utf8"));
await writeFile(
  "public/model.json",
  JSON.stringify(train(fixtures), null, 2) + "\n",
);
const wabt = await wabtFactory();
const module = wabt.parseWat(
  "kernel.wat",
  await readFile("src/kernel.wat", "utf8"),
);
module.validate();
await writeFile(
  "public/kernel.wasm",
  module.toBinary({ canonicalize_lebs: true }).buffer,
);
module.destroy();
const files = [
  "data/fixtures.json",
  "public/model.json",
  "public/kernel.wasm",
  "src/kernel.wat",
  "src/model.js",
  "src/engine.js",
];
const manifest = {};
for (const path of files) {
  const bytes = await readFile(path);
  manifest[path] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
await writeFile(
  "public/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
