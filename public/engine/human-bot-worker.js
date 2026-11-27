/* Human-bot inference worker. Runs the trained ONNX model off the main
 * thread (same isolation as Stockfish), so the board never stutters.
 *
 * The worker only does inference: planes in, 4096 logits out. Encoding,
 * legal-move masking and sampling live in lib/engine/human-encoding.ts,
 * where they are unit-tested against the Python training code.
 *
 * Messages in:  { id, type: "init", modelUrl }
 *               { id, type: "infer", planes: Float32Array(1088), elo, oppElo }
 * Messages out: { id, ok: true, ms?, logits? }  |  { id, ok: false, error }
 */
importScripts("/engine/ort/ort.wasm.min.js");

// Single-threaded WASM: multi-threading needs COOP/COEP headers, which the
// app does not set (Stockfish runs single-threaded for the same reason).
// The model is ~0.5M parameters, so one thread is a few milliseconds.
ort.env.wasm.wasmPaths = "/engine/ort/";
ort.env.wasm.numThreads = 1;

let session = null;

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "init") {
      const t0 = performance.now();
      session = await ort.InferenceSession.create(event.data.modelUrl, {
        executionProviders: ["wasm"],
      });
      self.postMessage({ id, ok: true, ms: performance.now() - t0 });
      return;
    }
    if (type === "infer") {
      if (!session) throw new Error("model not loaded");
      const { planes, elo, oppElo } = event.data;
      const t0 = performance.now();
      const out = await session.run({
        planes: new ort.Tensor("float32", planes, [1, 17, 8, 8]),
        elo: new ort.Tensor("float32", Float32Array.of(elo), [1]),
        opp_elo: new ort.Tensor("float32", Float32Array.of(oppElo), [1]),
      });
      // copy out of the runtime's memory before transferring the buffer
      const logits = new Float32Array(out.logits.data);
      self.postMessage({ id, ok: true, ms: performance.now() - t0, logits }, [logits.buffer]);
      return;
    }
    throw new Error(`unknown message type ${type}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
