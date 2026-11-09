# Design

A small transparent model makes backend comparison inspectable. Training emits
class-major float32 log likelihoods. Both backends compute the same dot products
plus uniform log prior. WebGPU dispatches one invocation per class. WASM executes
an explicit scalar float32 loop compiled from checked-in WAT by pinned wabt.
There is no runtime CDN, hosted inference, telemetry or third-party model.

Auto mode attempts a real adapter and falls back on initialization failure.
Strict WebGPU fails visibly instead of silently benchmarking CPU. Device loss
after initialization is reported to the caller; callers can explicitly recreate
an engine in WASM mode. GPU calls are serialized and concurrent calls rejected.
Cancellation discards results, but cannot preempt a submitted GPU command or a
synchronous WASM call. Dispose releases GPU resources. A WASM instance becomes
collectable after callers release it. Raw scores are not calibrated probabilities.

The local harness binds only loopback, accepts same-origin reports with a bounded
body, and uses a random run token. It exits only after receiving the final report
or a timeout. Its static outage mode denies asset requests but keeps report APIs
reachable. The service worker only serves an explicit manifest of local files.

Primary API references consulted 2026-11-09:
- https://www.w3.org/TR/webgpu/
- https://webassembly.github.io/spec/core/
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

ONNX Runtime Web was considered, but this repository uses its own narrow,
versioned kernels. It does not claim ONNX compatibility or transformer support.
