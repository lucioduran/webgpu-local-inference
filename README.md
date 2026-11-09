# WebGPU local inference

A transparent support-ticket classifier with native WebGPU compute and real
WebAssembly kernels. No runtime dependencies, external model downloads or hosted
inference.

**Browser verification is blocked. This is an experimental prerelease, not a
verified WebGPU release.** Node WASM works; no browser inference or offline
startup result is claimed. See [the preserved blocker](evidence/browser-blocker.json).

## Problem

Browser inference examples often hide fallback behavior or omit reproducible
inputs. This project makes the model, numerical kernels, backend selection and
measurement protocol small enough to inspect.

## Scope

Classify English support tickets into billing, access or delivery using a
multinomial naive Bayes model trained on 12 original synthetic examples. Inputs
without any known word return unknown. This is a narrow pipeline demonstration,
not a general language model or production support router.

## Quick start

Use Node 24.8.0, pinned in `.nvmrc`. The committed model and WASM binary need no
installation or network access to run:

```sh
npm run serve
```

Open `http://127.0.0.1:8025`. Enter a ticket and choose Automatic, WebGPU required,
or WebAssembly. First-party assets come from your local server. The application
sends no ticket data to an external service.

## Usage

Automatic mode tries WebGPU and reports a fallback reason if initialization
fails. Strict WebGPU never silently switches to CPU. Click **Cache for offline
use** before relying on offline startup. Browser storage eviction can remove
that cache. Cancel discards a pending result; it cannot preempt submitted work.
An engine that loses its device must be recreated, optionally in WASM mode.

```js
import { createEngine } from "./src/engine.js";
const model = await (await fetch("/public/model.json")).json();
const wasmBytes = await (await fetch("/public/kernel.wasm")).arrayBuffer();
const engine = await createEngine(model, { backend: "auto", wasmBytes });
try {
  console.log(await engine.predict("Please refund this payment"));
} finally {
  engine.dispose();
}
```

## Architecture

- `src/model.js`: deterministic training, tokenization and float32 reference.
- `src/engine.js`: native WGSL dot products and WASM execution with shared weights.
- `src/kernel.wat`: auditable scalar WASM kernel, compiled by wabt 1.0.37.
- `sw.js`: explicit local asset caching.
- `src/benchmark.js`: fixed browser workload and failure checks.
- `scripts/server.mjs`: loopback harness, static asset outage and evidence capture.

See [design](docs/design.md) and [frozen protocol](docs/protocol.md).
The custom engine revision is the Git commit; artifact hashes are in
[the manifest](public/manifest.json). No ONNX Runtime dependency is used.

## Reproduction

For builds and development checks, install exact dependencies from the lockfile:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run replay
```

Lightweight offline replay needs only Node and the checkout:

```sh
node scripts/replay.mjs
```

It runs the actual WASM kernel and validates artifact hashes. If browser reports
exist, it checks their numerical and structural consistency. Saved-report
verification does not prove measurement authenticity.

Every measured browser run must hold the shared exclusive lock for the entire
harness lifetime. In the authorized project workspace:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
python3 /Users/luchoduran/Sites/open-source-projects/.coordination/benchmark_lock.py \
node scripts/server.mjs --benchmark
```

After the lock is acquired, open the loopback URL with a supported browser and
click **Run fixed browser evaluation**. The harness runs three fixed rounds per
backend, caches the app, denies static downloads, reloads, reruns both backends,
receives the final report and exits. No detached measured process is used.
Reports are written to `evidence/browser-TIMESTAMP.json`. For independent users
without the shared project wrapper, provide an equivalent exclusive scheduler
around `node scripts/server.mjs --benchmark`; do not bypass the project lock in
this workspace.

## Results

Actual local tests: 12/12 evaluation tickets classified correctly by Node WASM,
with exact agreement against the float32 reference. These are synthetic,
vocabulary-overlapping fixtures, not a real-world accuracy estimate.

| Environment                | WebGPU                               | WASM              | Offline browser startup |
| -------------------------- | ------------------------------------ | ----------------- | ----------------------- |
| Node 24.8.0, macOS 26.7.1  | Not a browser test                   | Unit tests passed | Not applicable          |
| In-app browser             | Provider unavailable                 | Not run           | Not run                 |
| Safari native connection   | Connection failed before page access | Not run           | Not run                 |
| Other browsers and devices | Not tested                           | Not tested        | Not tested              |

One physical machine: Mac Pro, 8-core Intel Xeon W, 48 GB RAM, AMD Radeon Pro
W5700X with 16 GB VRAM. This host inventory does not establish WebGPU adapter
availability. Browser version and adapter identity were not observable.

[Raw blocker observations](evidence/browser-blocker.json) and
[hardware inventory](evidence/hardware.json) preserve the limitations. No browser
download timing, initialization timing, inference timing, measured memory,
speedup, power, cost or cross-backend browser accuracy is reported.

## Testing

```sh
npm run lint
npm run format
npm run build
npm run check
npm test
npm run replay
npm run smoke
```

Tests cover deterministic training, disjoint partitions, exact real WASM scores,
abstention, bad input, cancellation, malformed binary, unavailable adapters,
strict-backend errors, disposal and HTTP serving. The installed-package smoke
test packs and installs the tarball offline, executes WASM and checks app assets.
CI does not substitute for browser GPU testing.

## Limitations

Browser automation exposed no providers; Safari native access failed twice.
Actual browser WebGPU, WASM fallback, cancellation, explicit device loss and
cached offline startup remain unverified. The harness implements these checks
but implementation is not execution evidence. No spontaneous device loss was
observed. Adapter failure injection and deliberate destruction are labeled tests.

Only one host was available. No mobile, cross-browser or cross-device claims.
Tiny dot products will often be dominated by GPU dispatch overhead. ASCII
vocabulary, bag-of-words features and synthetic training do not handle negation,
multilingual text, ambiguity or distribution shift reliably. Scores are not
probabilities. GPU predictions must be sequential. Allocated buffer sizes are
not total process or GPU memory. Offline tests simulate an origin asset outage,
not OS network disconnection or a browser restart.

## Contributing

Keep fixtures, partitions and numerical tolerance frozen before measurement.
Preserve failures, record browser and adapter details, run the locked harness
and attach unedited raw reports. Add meaningful regression tests for fixes.
Use English throughout and avoid em dash punctuation.

## License

MIT for code, original fixtures and trained model. See [LICENSE](LICENSE).
Build dependencies retain their own licenses: wabt Apache-2.0, Prettier MIT,
ESLint MIT and globals MIT. There are no runtime third-party dependencies.
