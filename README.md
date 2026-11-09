# WebGPU local inference

A transparent support-ticket classifier with native WebGPU compute and real
WebAssembly kernels. No runtime dependencies, external model downloads or hosted
inference.

**Verified on one physical device in in-app Chromium 157:** native WebGPU and
browser WASM produced identical scores on the fixed synthetic task, online and
after a cached reload during a static origin outage. See [raw evidence](evidence/browser-1794256500335.json).

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

The locked browser run on 2026-11-09 used source commit
`615e4051094b1b9ec865d920503a1516947cae71`, with a clean tree at harness start.
The released model, fixture, WASM, WGSL engine and browser workload are unchanged
from that run. Subsequent changes concern reports, replay checks, packaging and
Git metadata handling. Each row below contains three fixed rounds of 12 tickets,
with no warm-up exclusion. All 144 browser predictions had the expected label
and exact float32 reference scores (maximum absolute error 0).

| Phase         | Backend | Correct | Initialization | First inference        | Median inference       | p95 inference |
| ------------- | ------- | ------- | -------------- | ---------------------- | ---------------------- | ------------- |
| Online        | WebGPU  | 36/36   | 49.2 ms        | 7.3 ms                 | 0.4 ms                 | 1.5 ms        |
| Online        | WASM    | 36/36   | 0.6 ms         | 0.2 ms                 | Below timer resolution | 0.1 ms        |
| Cached reload | WebGPU  | 36/36   | 6.0 ms         | 0.7 ms                 | 0.4 ms                 | 0.7 ms        |
| Cached reload | WASM    | 36/36   | 0.3 ms         | Below timer resolution | Below timer resolution | 0.1 ms        |

In each WASM phase, 34/36 durations were reported as zero by the browser timer.
These values do not mean instantaneous computation, and no speedup ratio is
justified. The median averages the two central values; p95 uses nearest rank.
Download response bodies were 3,951 bytes for model JSON (3.5 ms) and 158 bytes
for WASM (3.1 ms), from loopback, not an Internet download. Resource timing
entries also preserve transfer and encoded body sizes for runtime JavaScript.
Explicit GPU buffer allocation was 712 bytes; WASM linear memory was 65,536
bytes. These are logical allocation sizes, not measured process or GPU memory.

| Environment                           | WebGPU             | WASM         | Offline browser startup                      |
| ------------------------------------- | ------------------ | ------------ | -------------------------------------------- |
| In-app Chromium 157.0.0.0 on this Mac | Passed, AMD RDNA 1 | Passed       | Both passed with origin static assets denied |
| Node 24.8.0 on this Mac               | Not a browser test | Tests passed | Not applicable                               |
| Safari native connection              | Page access failed | Not run      | Not run                                      |
| Other browsers and devices            | Not tested         | Not tested   | Not tested                                   |

One physical machine: Mac Pro, 8-core Intel Xeon W, 48 GB RAM, AMD Radeon Pro
W5700X with 16 GB VRAM, macOS 26.7.1. Browser adapter fields reported vendor
`amd` and architecture `rdna-1`; device and description were empty. The browser
user agent masks the OS version, so host OS comes from `sw_vers`.

Actual browser checks passed for unknown inputs, pre-cancellation, GPU in-flight
cancellation, concurrent call rejection, deliberately destroyed GPU device,
injected unavailable-adapter fallback to real WASM, malformed WASM, invalid
model, strict adapter failure and HTTP 404. Device destruction and adapter
unavailability were injected tests, not spontaneous failures.

The offline phase loaded a fresh document from the service-worker cache while
the server rejected eight asset requests, including both model and WASM. The
local report endpoint remained available. This does not establish offline
behavior after OS disconnection, storage eviction or browser restart.

See [raw report](evidence/browser-1794256500335.json),
[derived summary](evidence/summary.json), [run provenance](evidence/run-provenance.md)
and [hardware inventory](evidence/hardware.json). The initial project-chat
connection failures are preserved in [the failed attempt](evidence/browser-blocker.json).
The coordinator's working CUA browser connection subsequently completed the run.

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

The project chat initially lacked browser access; the coordinator operated the
real in-app Chromium UI through supported CUA APIs while this project's harness
held the shared lock. Safari was not tested. No spontaneous device loss was
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
