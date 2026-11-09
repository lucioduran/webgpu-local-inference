import { features, classify } from "./model.js";

export function validateModel(model) {
  const n = model?.vocabulary?.length;
  const c = model?.labels?.length;
  if (
    !n ||
    !c ||
    n > 2048 ||
    c > 16 ||
    model.weights?.length !== n * c ||
    !model.weights.every(Number.isFinite) ||
    !Number.isFinite(model.prior) ||
    (n * (c + 1) + c) * 4 > 65536
  )
    throw new Error("Invalid model");
}

export async function createEngine(
  model,
  { backend = "auto", gpu = globalThis.navigator?.gpu, wasmBytes, signal } = {},
) {
  validateModel(model);
  signal?.throwIfAborted();
  if (!["auto", "webgpu", "wasm"].includes(backend))
    throw new Error("Unknown backend");
  let fallbackReason = null;
  if (backend !== "wasm") {
    try {
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter");
      const engine = await gpuEngine(model, adapter, signal);
      return engine;
    } catch (error) {
      signal?.throwIfAborted();
      if (backend === "webgpu") throw error;
      fallbackReason = String(error);
    }
  }
  signal?.throwIfAborted();
  const { instance } = await WebAssembly.instantiate(wasmBytes);
  const n = model.vocabulary.length;
  const c = model.labels.length;
  const memory = new Float32Array(instance.exports.memory.buffer);
  memory.set(model.weights, n);
  let disposed = false;
  return {
    backend: "wasm",
    fallbackReason,
    allocatedBytes: 65536,
    async predict(text, { signal } = {}) {
      signal?.throwIfAborted();
      if (disposed) throw new Error("Engine disposed");
      const vector = features(model, text);
      memory.set(vector);
      instance.exports.score(n, c, model.prior);
      signal?.throwIfAborted();
      return classify(
        model,
        vector,
        memory.slice(n * (c + 1), n * (c + 1) + c),
      );
    },
    dispose() {
      disposed = true;
    },
  };
}

async function gpuEngine(model, adapter, signal) {
  const device = await adapter.requestDevice();
  const n = model.vocabulary.length;
  const c = model.labels.length;
  const buffers = [];
  let lost = null;
  let busy = false;
  let disposed = false;
  device.lost.then((info) => {
    lost = { reason: info.reason, message: info.message };
  });
  const buffer = (size, usage) => {
    const result = device.createBuffer({ size, usage });
    buffers.push(result);
    return result;
  };
  try {
    signal?.throwIfAborted();
    const input = buffer(
      n * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    const weights = buffer(
      n * c * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    const output = buffer(
      c * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    );
    const readback = buffer(
      c * 4,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    );
    device.queue.writeBuffer(weights, 0, new Float32Array(model.weights));
    const code = `
      @group(0) @binding(0) var<storage, read> x: array<f32>;
      @group(0) @binding(1) var<storage, read> w: array<f32>;
      @group(0) @binding(2) var<storage, read_write> y: array<f32>;
      @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let c = id.x;
        var sum: f32 = ${model.prior};
        for (var i: u32 = 0u; i < ${n}u; i++) { sum = sum + x[i] * w[c * ${n}u + i]; }
        y[c] = sum;
      }`;
    const shader = device.createShaderModule({ code });
    const compilation = await shader.getCompilationInfo();
    if (compilation.messages.some((message) => message.type === "error"))
      throw new Error("Shader compilation failed");
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: shader, entryPoint: "main" },
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [input, weights, output].map((value, binding) => ({
        binding,
        resource: { buffer: value },
      })),
    });
    return {
      backend: "webgpu",
      fallbackReason: null,
      adapter: {
        vendor: adapter.info?.vendor,
        architecture: adapter.info?.architecture,
        device: adapter.info?.device,
        description: adapter.info?.description,
      },
      allocatedBytes: (n + n * c + 2 * c) * 4,
      get loss() {
        return lost;
      },
      async predict(text, { signal } = {}) {
        signal?.throwIfAborted();
        if (disposed || lost) throw new Error("WebGPU device unavailable");
        if (busy) throw new Error("Concurrent prediction is not supported");
        const vector = features(model, text);
        busy = true;
        try {
          device.queue.writeBuffer(input, 0, vector);
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, group);
          pass.dispatchWorkgroups(c);
          pass.end();
          encoder.copyBufferToBuffer(output, 0, readback, 0, c * 4);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(GPUMapMode.READ);
          const scores = new Float32Array(readback.getMappedRange()).slice();
          readback.unmap();
          signal?.throwIfAborted();
          return classify(model, vector, scores);
        } finally {
          busy = false;
        }
      },
      async destroyForTest() {
        device.destroy();
        await device.lost;
        return lost;
      },
      dispose() {
        disposed = true;
        for (const value of buffers) value.destroy();
        device.destroy();
      },
    };
  } catch (error) {
    for (const value of buffers) value.destroy();
    device.destroy();
    throw error;
  }
}
