import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
for (const [path, entry] of Object.entries(manifest)) {
  const bytes = await readFile(path);
  assert.equal(bytes.length, entry.bytes, path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    entry.sha256,
    path,
  );
}
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const path of paths) {
  if (path.endsWith(".wasm")) continue;
  assert.ok(
    !(await readFile(path, "utf8")).includes(String.fromCharCode(0x2014)),
    `Forbidden punctuation in ${path}`,
  );
  if (/\.(js|mjs)$/.test(path))
    execFileSync(process.execPath, ["--check", path]);
}
const headings = (await readFile("README.md", "utf8"))
  .split("\n")
  .filter((line) => line.startsWith("## "))
  .map((line) => line.slice(3));
assert.deepEqual(headings, [
  "Problem",
  "Scope",
  "Quick start",
  "Usage",
  "Architecture",
  "Reproduction",
  "Results",
  "Testing",
  "Limitations",
  "Contributing",
  "License",
]);
console.log(
  `Verified ${Object.keys(manifest).length} artifact hashes, syntax, punctuation and README structure.`,
);

const browserSource = JSON.parse(
  await readFile("evidence/browser-source-manifest.json", "utf8"),
);
for (const [path, digest] of Object.entries(browserSource.files)) {
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    digest,
    `Measured browser source changed: ${path}`,
  );
}
console.log("Released browser code matches the measured source revision.");
