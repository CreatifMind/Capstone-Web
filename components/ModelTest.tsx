"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { MODEL_CONFIG } from "@/lib/inference/model-config";
import { runModel } from "@/lib/inference/onnx-session";
import { postprocessOutput } from "@/lib/inference/postprocess";
import { preprocessImage } from "@/lib/inference/preprocess";
import type { Detection, LetterboxInfo, PostprocessResult } from "@/lib/inference/types";
import styles from "@/app/model-test/model-test.module.css";

type DebugInfo = {
  filename: string;
  letterbox: LetterboxInfo;
  modelLoadTimeMs: number;
  inferenceTimeMs: number;
  executionProvider: string;
  output: PostprocessResult;
};

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(source: string, filename: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error(`"${filename}" has invalid image dimensions.`));
    image.onerror = () => reject(new Error(`"${filename}" could not be decoded. The file may be corrupted or use an unsupported format.`));
    image.src = source;
  });
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export default function ModelTest() {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const selectionTokenRef = useRef(0);
  const runningRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Choose one image to begin.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [debug, setDebug] = useState<DebugInfo | null>(null);

  useEffect(() => () => {
    selectionTokenRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }, []);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  };

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;
    const selectionToken = ++selectionTokenRef.current;

    revokePreviewUrl();
    setFile(null);
    setPreviewUrl("");
    setImage(null);
    setDebug(null);
    setError("");

    if (!supportedTypes.has(selected.type)) {
      input.value = "";
      setError(`"${selected.name}" is not a supported image. Choose JPG, JPEG, PNG, or WEBP.`);
      setStatus("Image rejected.");
      return;
    }
    if (!selected.size) {
      input.value = "";
      setError(`"${selected.name}" is empty and cannot be decoded.`);
      setStatus("Image rejected.");
      return;
    }

    setStatus("Validating image…");
    const nextPreviewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreviewUrl;
    try {
      const nextImage = await loadImage(nextPreviewUrl, selected.name);
      if (selectionToken !== selectionTokenRef.current) return;
      setFile(selected);
      setPreviewUrl(nextPreviewUrl);
      setImage(nextImage);
      setStatus("Image ready. Run detection when ready.");
    } catch (nextError) {
      if (selectionToken !== selectionTokenRef.current) return;
      revokePreviewUrl();
      input.value = "";
      setError(nextError instanceof Error ? nextError.message : "Unable to read image.");
      setStatus("Image rejected.");
    }
  };

  const runDetection = async () => {
    if (!file || !image || runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    setError("");
    setStatus("Loading ONNX model and running browser inference…");
    try {
      const preprocessed = preprocessImage(image);
      const result = await runModel(preprocessed.data);
      const output = postprocessOutput(result.output, preprocessed.letterbox);
      setSessionLoaded(true);
      setDebug({
        filename: file.name,
        letterbox: preprocessed.letterbox,
        modelLoadTimeMs: result.sessionInfo.loadTimeMs,
        inferenceTimeMs: result.inferenceTimeMs,
        executionProvider: result.sessionInfo.executionProvider,
        output
      });
      setStatus(output.detections.length
        ? `Detection complete: ${output.detections.length} bounding box${output.detections.length === 1 ? "" : "es"}.`
        : `Detection complete: no detections met confidence ${MODEL_CONFIG.confidenceThreshold}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ONNX inference failed.");
      setStatus("Detection failed.");
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  const reset = () => {
    if (runningRef.current) return;
    selectionTokenRef.current += 1;
    revokePreviewUrl();
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setPreviewUrl("");
    setImage(null);
    setDebug(null);
    setError("");
    setStatus("Choose one image to begin.");
  };

  const exportDebugJson = () => {
    if (!debug) return;
    const { letterbox, output } = debug;
    const payload = {
      filename: debug.filename,
      originalWidth: letterbox.originalWidth,
      originalHeight: letterbox.originalHeight,
      resizedWidth: letterbox.resizedWidth,
      resizedHeight: letterbox.resizedHeight,
      letterboxScale: letterbox.scale,
      padX: letterbox.padX,
      padY: letterbox.padY,
      modelLoadTimeMs: debug.modelLoadTimeMs,
      inferenceTimeMs: debug.inferenceTimeMs,
      confidenceThreshold: MODEL_CONFIG.confidenceThreshold,
      nmsIouThreshold: MODEL_CONFIG.nmsIouThreshold,
      nmsMode: "class-aware",
      executionProvider: debug.executionProvider,
      rawCandidateCount: output.rawCandidates,
      confidenceCandidateCount: output.confidenceCandidates,
      finalDetectionCount: output.detections.length,
      detections: output.detections.map(({ classId, className, confidence, x1, y1, x2, y2 }) => ({
        classId, className, confidence, x1, y1, x2, y2
      }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${debug.filename.replace(/\.[^.]+$/, "") || "model-test"}-debug.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Development proof of concept</p>
            <h1>Browser ONNX Model Test</h1>
            <p>Isolated client-side detection. No Upload, backend, Drive, Supabase, or batch workflow integration.</p>
          </div>
          <a href="/" className={styles.backLink}>Back to site</a>
        </header>

        <section className={styles.controls} aria-label="Model test controls">
          <label className={`${styles.primaryButton} ${isRunning ? styles.disabled : ""}`} aria-disabled={isRunning}>
            Select image
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={selectImage} disabled={isRunning} />
          </label>
          <button type="button" className={styles.primaryButton} onClick={runDetection} disabled={!image || isRunning}>
            {isRunning ? "Running…" : "Run detection"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={reset} disabled={isRunning}>Reset</button>
          <button type="button" className={styles.secondaryButton} onClick={exportDebugJson} disabled={!debug || isRunning}>Export Debug JSON</button>
        </section>

        <p className={styles.status} role="status">{status}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <section className={styles.content}>
          <article className={styles.card}>
            <h2>Original image</h2>
            {previewUrl && image ? (
              <div className={styles.imageStage}>
                <img src={previewUrl} alt={file?.name || "Selected upload"} />
                <svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} preserveAspectRatio="none" aria-label="Detection boxes" role="img">
                  {debug?.output.detections.map(detection => <DetectionBox key={`${detection.classId}-${detection.x1}-${detection.y1}`} detection={detection} />)}
                </svg>
              </div>
            ) : <p className={styles.empty}>No image selected.</p>}
          </article>

          <article className={styles.card}>
            <h2>Detections</h2>
            {!debug && <p className={styles.empty}>Run detection to see bounding boxes and confidence values.</p>}
            {debug && !debug.output.detections.length && <p className={styles.empty}>No detections meet confidence {MODEL_CONFIG.confidenceThreshold}.</p>}
            <ol className={styles.detectionList}>
              {debug?.output.detections.map(detection => (
                <li key={`${detection.classId}-${detection.x1}-${detection.y1}`}>
                  <strong>{detection.className}</strong>
                  <span>{(detection.confidence * 100).toFixed(1)}%</span>
                  <small>[{detection.x1.toFixed(1)}, {detection.y1.toFixed(1)}, {detection.x2.toFixed(1)}, {detection.y2.toFixed(1)}]</small>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className={styles.card}>
          <h2>Debug information</h2>
          <dl className={styles.debugGrid}>
            <DebugRow label="Model status" value={isRunning ? "Running" : error ? "Error" : sessionLoaded ? "Loaded (cached)" : "Not loaded"} />
            <DebugRow label="Selected filename" value={file?.name || "—"} />
            <DebugRow label="Original dimensions" value={debug ? `${debug.letterbox.originalWidth} × ${debug.letterbox.originalHeight}` : "—"} />
            <DebugRow label="Letterbox scale" value={debug ? debug.letterbox.scale.toFixed(6) : "—"} />
            <DebugRow label="Resized dimensions" value={debug ? `${debug.letterbox.resizedWidth} × ${debug.letterbox.resizedHeight}` : "—"} />
            <DebugRow label="Horizontal / vertical padding" value={debug ? `${debug.letterbox.padX} / ${debug.letterbox.padY}` : "—"} />
            <DebugRow label="Model load time" value={debug ? formatMs(debug.modelLoadTimeMs) : "—"} />
            <DebugRow label="Inference time" value={debug ? formatMs(debug.inferenceTimeMs) : "—"} />
            <DebugRow label="Raw / confidence / NMS candidates" value={debug ? `${debug.output.rawCandidates} / ${debug.output.confidenceCandidates} / ${debug.output.detections.length}` : "—"} />
            <DebugRow label="Execution provider" value={debug?.executionProvider || MODEL_CONFIG.executionProvider} />
            <DebugRow label="Final classes" value={debug ? debug.output.detections.map(item => `${item.classId}: ${item.className}`).join(", ") || "None" : "—"} />
          </dl>
        </section>
      </section>
    </main>
  );
}

function DetectionBox({ detection }: { detection: Detection }) {
  const width = detection.x2 - detection.x1;
  const height = detection.y2 - detection.y1;
  const label = `${detection.className} ${(detection.confidence * 100).toFixed(1)}%`;
  return <g className={styles.box}>
    <rect x={detection.x1} y={detection.y1} width={width} height={height} />
    <rect className={styles.boxLabel} x={detection.x1} y={Math.max(0, detection.y1 - 24)} width={Math.max(108, label.length * 7)} height="22" />
    <text x={detection.x1 + 5} y={Math.max(15, detection.y1 - 8)}>{label}</text>
  </g>;
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
