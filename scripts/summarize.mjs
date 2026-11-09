import { readFile, writeFile } from "node:fs/promises";
const report = JSON.parse(
  await readFile("evidence/browser-1794256500335.json", "utf8"),
);
const summary = { source: "browser-1794256500335.json", runs: [] };
for (const phase of ["online", "offline"])
  for (const run of report[phase]) {
    const values = run.samples.map((s) => s.milliseconds).sort((a, b) => a - b);
    summary.runs.push({
      phase,
      backend: run.backend,
      correct: run.samples.filter((s) => s.label === s.expected).length,
      total: values.length,
      initializationMs: run.initializationMs,
      firstInferenceMs: run.samples[0].milliseconds,
      medianMs: (values[17] + values[18]) / 2,
      p95Ms: values[Math.ceil(values.length * 0.95) - 1],
      zeroDurationSamples: values.filter((x) => x === 0).length,
      maxAbsoluteError: Math.max(...run.samples.map((s) => s.maxAbsoluteError)),
    });
  }
await writeFile(
  "evidence/summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
