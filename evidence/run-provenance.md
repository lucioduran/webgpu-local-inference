# Browser run provenance

The first connection attempt failed before browser execution. Its raw tool
responses are preserved in `browser-blocker.json`. That record describes the
failed attempt, not the final project status.

The coordinator had a working supported CUA connection to the in-app browser.
This project's foreground harness acquired the shared benchmark lock, then the
coordinator opened `http://127.0.0.1:8025`, clicked **Run fixed browser evaluation**,
observed the automatic `/?stage=offline` navigation and the final **Evaluation
complete** status. No measured inference was run outside that harness lifetime.

Command executed from this repository:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
python3 /Users/luchoduran/Sites/open-source-projects/.coordination/benchmark_lock.py \
node scripts/server.mjs --benchmark
```

Observed foreground output:

```text
Waiting for the shared benchmark lock...
Benchmark lock acquired.
Open http://127.0.0.1:8025 and click Run fixed browser evaluation. Lock must remain held.
Saved evidence/browser-1794256500335.json. Browser workload complete; releasing server and lock.
```

The process exited with code 0 after receiving the final report. The harness
started at 2026-11-09T20:34:26.446Z. The browser workload began at
2026-11-09T20:35:00.011Z, finished at 20:35:00.330Z and the server received it at
20:35:00.334Z. The lock covered browser initialization, all online workloads,
cache population, offline reload, all offline workloads and report receipt.
The server remained in the foreground throughout; the lock was not a separate
placeholder process. Browser process scheduling and graphics-driver internal
thread counts are controlled by the browser, not the CPU environment variables.

The raw JSON was written by the harness, not transcribed. It excludes the
one-use local report token. Its source commit is recorded in the JSON. The
summary is derived with `node scripts/summarize.mjs`; replay recomputes expected
scores from immutable fixtures and verifies checks. These consistency tests do
not constitute independent authentication of the measurements.

This is one physical device and one real browser environment. Chromium reports
version 157.0.0.0 and an AMD RDNA 1 adapter; the device and description fields are
empty. It is not a Safari result. Hardware details come from local system tools.
No Internet inference service or billable compute was used. Electricity, power,
energy, total process memory and monetary costs were not measured.
