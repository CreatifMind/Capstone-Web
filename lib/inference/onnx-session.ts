import { MODEL_CONFIG } from "./model-config";
import type { ModelSessionInfo } from "./types";

type OrtModule = typeof import("onnxruntime-web/wasm");
type SessionContext = {
  info: ModelSessionInfo;
  ort: OrtModule;
  session: import("onnxruntime-web/wasm").InferenceSession;
};

let sessionPromise: Promise<SessionContext> | null = null;

export async function getModelSession() {
  if (typeof window === "undefined") throw new Error("ONNX Runtime is browser-only.");

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = "/onnxruntime/";
      ort.env.wasm.numThreads = 1;

      const startedAt = performance.now();
      const session = await ort.InferenceSession.create(MODEL_CONFIG.modelPath, {
        executionProviders: ["wasm"]
      });
      return {
        session,
        ort,
        info: { loadTimeMs: performance.now() - startedAt, executionProvider: "wasm" }
      };
    })().catch(error => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

export async function runModel(input: Float32Array) {
  const { session, ort, info } = await getModelSession();
  const startedAt = performance.now();
  const outputs = await session.run({
    [MODEL_CONFIG.inputName]: new ort.Tensor("float32", input, [...MODEL_CONFIG.inputShape])
  });
  const output = outputs[MODEL_CONFIG.outputName];
  if (!output || !(output.data instanceof Float32Array)) throw new Error("Model did not return float32 output0.");
  return { output: output.data, inferenceTimeMs: performance.now() - startedAt, sessionInfo: info };
}
