# Frozen measurement protocol

Freeze this file, fixtures, model and kernels in Git before browser measurement.
No random sampling or training seed: deterministic multinomial naive Bayes with
Laplace alpha 1, uniform class prior and lowercase ASCII word counts. Train only
on the train partition. Development examples are for manual demonstration.
Evaluation contains 12 original synthetic tickets, four per class. Three unknown
inputs must abstain. Fixtures and model are MIT licensed. Vocabulary overlap is
intentional. This is a pipeline correctness fixture, not a representative quality
benchmark. No held-out customer data or general language understanding claim.

Run three rounds in fixed evaluation order per backend, no warm-up exclusion.
Preserve every output and wall-clock latency, including the first prediction.
Record initialization separately, download response body bytes and wall time,
user agent, adapter fields exposed by the browser and resource timings.
Compare scores to float32 JavaScript reference at absolute tolerance 0.0001 and
require equal labels. Unknown inputs abstain only if no vocabulary word matches.
No confidence threshold is calibrated or claimed. Performance memory counters
are optional. Buffer allocations are logical sizes, not measured total memory.

Run strict WebGPU, strict WASM, injected unavailable adapter auto fallback,
invalid model, malformed WASM, pre-cancellation, in-flight cancellation where
asynchronous GPU completion permits, repeated inference and deliberately
requested GPU device destruction. A destroyed test device is not a spontaneous
hardware failure. No spontaneous loss is induced or claimed.

Explicitly cache the complete app before offline testing. Then have the harness
server deny all static assets, navigate to a new document and run both backends
from service-worker cached resources. The report endpoint remains reachable for
local evidence collection. This is an origin-asset outage, not a disconnected OS
network or browser restart. The harness holds the exclusive benchmark lock from
server start through receipt of the final report after offline inference.

No speed target. Tiny inputs emphasize dispatch overhead and cannot establish
WebGPU speedups for larger neural models. One physical device is available.
