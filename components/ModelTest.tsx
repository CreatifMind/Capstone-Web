"use client";

import { ChangeEvent, useRef, useState } from "react";
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

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Selected image could not be loaded."));
    image.src = source;
  });
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export default function ModelTest() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Choose one image to begin.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [debug, setDebug] = useState<DebugInfo | null>(null);

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!supportedTypes.has(selected.type)) {
      setError("Choose one JPG, JPEG, PNG, or WEBP image.");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selected);
    try {
      const nextImage = await loadImage(nextPreviewUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(selected);
      setPreviewUrl(nextPreviewUrl);
      setImage(nextImage);
      setDebug(null);
      setError("");
      setStatus("Image ready. Run detection when ready.");
    } catch (nextError) {
      URL.revokeObjectURL(nextPreviewUrl);
      setError(nextError instanceof Error ? nextError.message : "Unable to read image.");
    }
  };

  const runDetection = async () => {
    if (!file || !image) return;
    setIsRunning(true);
    setError("");
    setStatus("Loading ONNX model and running browser inference…");
    try {
      const preprocessed = preprocessImage(image);
      const result = await runModel(preprocessed.data);
      const output = postprocessOutput(result.output, preprocessed.letterbox);
      setDebug({
        filename: file.name,
        letterbox: preprocessed.letterbox,
        modelLoadTimeMs: result.sessionInfo.loadTimeMs,
        inferenceTimeMs: result.inferenceTimeMs,
        executionProvider: result.sessionInfo.executionProvider,
        output
      });
      setStatus(`Detection complete: ${output.detections.length} bounding box${output.detections.length === 1 ? "" : "es"}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ONNX inference failed.");
      setStatus("Detection failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setPreviewUrl("");
    setImage(null);
    setDebug(null);
    setError("");
    setStatus("Choose one image to begin.");
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
          <label className={styles.primaryButton}>
            Select image
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={selectImage} />
          </label>
          <button type="button" className={styles.primaryButton} onClick={runDetection} disabled={!image || isRunning}>
            {isRunning ? "Running…" : "Run detection"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={reset} disabled={isRunning}>Reset</button>
        </section>

        <p className={styles.status} role="status">{status}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <section className={styles.content}>
          <article className={styles.card}>
            <h2>Original image</h2>
            {previewUrl && image ? (
              <div className={styles.imageStage}>
                <img src={previewUrl} alt={file?.name || "Selected upload"} />
                <svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} aria-label="Detection boxes" role="img">
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
            <DebugRow label="Model status" value={isRunning ? "Running" : error ? "Error" : debug ? "Loaded" : "Not loaded"} />
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
