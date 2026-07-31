"use client";

import { ChangeEvent, useRef, useState } from "react";
import { MODEL_CONFIG } from "@/lib/inference/model-config";
import { runModel } from "@/lib/inference/onnx-session";
import { postprocessOutput } from "@/lib/inference/postprocess";
import { preprocessImage } from "@/lib/inference/preprocess";
import type { Detection } from "@/lib/inference/types";
import type { SharedStats } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

function loadImage(source: string, filename: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error(`"${filename}" has invalid image dimensions.`));
    image.onerror = () => reject(new Error(`"${filename}" could not be decoded.`));
    image.src = source;
  });
}

export default function ModelTeamPanel({ stats, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const runningRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Choose one image to begin.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("all");
  // Local display filter only — never written to MODEL_CONFIG, never affects production /upload.
  // Can only raise the effective bar above MODEL_CONFIG.confidenceThreshold (0.32), since
  // postprocessOutput already drops anything below that before this component sees it.
  const [confidenceThreshold, setConfidenceThreshold] = useState(stats.settings.confidence_threshold);
  const [suggestedLabels, setSuggestedLabels] = useState<Record<string, string>>({});
  const [retraining, setRetraining] = useState(false);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  };

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;
    revokePreviewUrl();
    setFile(null); setPreviewUrl(""); setImage(null); setDetections([]); setRunId(null); setError("");
    setStatus("Validating image…");
    const nextPreviewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreviewUrl;
    try {
      const nextImage = await loadImage(nextPreviewUrl, selected.name);
      setFile(selected); setPreviewUrl(nextPreviewUrl); setImage(nextImage);
      setStatus("Image ready. Run detection when ready.");
    } catch (nextError) {
      revokePreviewUrl(); input.value = "";
      setError(nextError instanceof Error ? nextError.message : "Unable to read image.");
      setStatus("Image rejected.");
    }
  };

  const runDetection = async () => {
    if (!file || !image || runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true); setError(""); setStatus("Loading ONNX model and running browser inference…");
    const startedAt = performance.now();
    try {
      const preprocessed = preprocessImage(image);
      const result = await runModel(preprocessed.data);
      const output = postprocessOutput(result.output, preprocessed.letterbox);
      const durationMs = performance.now() - startedAt;
      setDetections(output.detections);
      setFlaggedKeys(new Set());
      setStatus(output.detections.length
        ? `Detection complete: ${output.detections.length} bounding box${output.detections.length === 1 ? "" : "es"}.`
        : `Detection complete: no detections met confidence ${MODEL_CONFIG.confidenceThreshold}.`);

      const runResponse = await fetch("/api/model-review/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectionCount: output.detections.length, durationMs })
      });
      const runData = await runResponse.json();
      if (runResponse.ok) {
        setRunId(runData.run.id);
        onChanged();
      } else {
        setRunId(null);
        setError("Run was not recorded — flags on these detections won't be linked to a run.");
      }
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
    revokePreviewUrl();
    if (inputRef.current) inputRef.current.value = "";
    setFile(null); setPreviewUrl(""); setImage(null); setDetections([]); setRunId(null);
    setError(""); setStatus("Choose one image to begin.");
  };

  const flagDetection = async (detection: Detection, signalType: "fp" | "fn") => {
    const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
    try {
      const response = await fetch("/api/model-review/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId, className: detection.className, confidence: detection.confidence,
          x1: detection.x1, y1: detection.y1, x2: detection.x2, y2: detection.y2,
          signalType, suggestedLabel: suggestedLabels[key] || ""
        })
      });
      if (response.ok) {
        setFlaggedKeys((keys) => new Set(keys).add(key));
        onChanged();
      } else {
        setError("Unable to flag detection.");
      }
    } catch {
      setError("Unable to flag detection.");
    }
  };

  const updateConfidenceThreshold = async (value: number) => {
    setConfidenceThreshold(value);
    try {
      const response = await fetch("/api/model-review/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidenceThreshold: value })
      });
      if (!response.ok) setError("Unable to update confidence threshold.");
    } catch {
      setError("Unable to update confidence threshold.");
    }
  };

  const startRetrain = async () => {
    setRetraining(true);
    try {
      const response = await fetch("/api/model-review/retrain", { method: "POST" });
      if (response.ok) {
        onChanged();
      } else {
        setError("Unable to start retrain.");
      }
    } catch {
      setError("Unable to start retrain.");
    } finally {
      setRetraining(false);
    }
  };

  const exportFlags = async () => {
    try {
      const response = await fetch("/api/model-review/flags");
      if (!response.ok) {
        setError("Unable to export false signals.");
        return;
      }
      const data = await response.json();
      const unresolved = (data.flags || []).filter((flag: { resolved_at: string | null }) => flag.resolved_at == null);
      const blob = new Blob([JSON.stringify(unresolved, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "false-signals.json";
      document.body.appendChild(link); link.click();
      window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1000);
    } catch {
      setError("Unable to export false signals.");
    }
  };

  const visibleDetections = detections
    .filter((detection) => classFilter === "all" || detection.className === classFilter)
    .filter((detection) => detection.confidence >= confidenceThreshold);

  const readyToRetrain = stats.unresolvedFlags >= stats.settings.retrain_threshold;
  const maxDaily = Math.max(...stats.dailyBars.map((bar) => bar.count), 1);

  return (
    <>
      <section className="mrc-controls" aria-label="Model test controls">
        <label className={`mrc-btn-primary${isRunning ? " mrc-disabled" : ""}`}>
          Select image
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={selectImage} disabled={isRunning} />
        </label>
        <button type="button" className="mrc-btn-primary" onClick={runDetection} disabled={!image || isRunning}>
          {isRunning ? "Running…" : "Run detection"}
        </button>
        <button type="button" className="mrc-btn-secondary" onClick={reset} disabled={isRunning}>Reset</button>
        <button type="button" className="mrc-btn-secondary" onClick={exportFlags} disabled={stats.unresolvedFlags === 0}>Export all false signals</button>
      </section>

      <p className="mrc-status" role="status">{status}</p>
      {error && <p className="mrc-error" role="alert">{error}</p>}

      <div className="mrc-card mrc-toolbar">
        <label className="mrc-field">
          Material class
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="all">All classes</option>
            {MODEL_CONFIG.classes.map((className) => <option key={className} value={className}>{className}</option>)}
          </select>
        </label>
        <label className="mrc-field">
          Confidence threshold ({confidenceThreshold.toFixed(2)})
          <input type="range" min={0.1} max={0.9} step={0.01} value={confidenceThreshold}
            onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
            onPointerUp={(event) => updateConfidenceThreshold(Number((event.target as HTMLInputElement).value))} />
        </label>
        <div className="mrc-retrain-controls">
          <span className={`mrc-badge${readyToRetrain ? " mrc-badge-ready" : ""}`}>
            {readyToRetrain ? "Ready to retrain" : `${stats.settings.retrain_threshold - stats.unresolvedFlags} more to trigger retrain`}
          </span>
          <button type="button" className="mrc-btn-primary" onClick={startRetrain} disabled={!readyToRetrain || retraining}>
            {retraining ? "Retraining…" : "Start retrain"}
          </button>
        </div>
      </div>

      <div className="mrc-card">
        <h2>Cumulative false signals by day</h2>
        <p className="mrc-muted">{stats.unresolvedFlags} unresolved &middot; retrain at {stats.settings.retrain_threshold}</p>
        <div className="mrc-chart">
          {stats.dailyBars.map((bar) => (
            <div key={bar.day} className="mrc-chart-col">
              <span>{bar.count}</span>
              <div className="mrc-bar" style={{ height: `${Math.max(6, (bar.count / maxDaily) * 100)}%` }} />
              <span>{bar.day}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Uploaded image</h2>
          {previewUrl && image ? (
            <div className="mrc-image-stage">
              <img src={previewUrl} alt={file?.name || "Selected upload"} />
              <svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} preserveAspectRatio="none">
                {visibleDetections.map((detection) => (
                  <DetectionBox key={`${detection.classId}-${detection.x1}-${detection.y1}`} detection={detection} />
                ))}
              </svg>
            </div>
          ) : <p className="mrc-muted">No image selected yet.</p>}
        </div>

        <div className="mrc-card">
          <h2>Detections</h2>
          <p className="mrc-muted">Flag anything wrong — it routes straight to the model team.</p>
          {!detections.length && <p className="mrc-muted">Run detection to see results here.</p>}
          {!!detections.length && !visibleDetections.length && <p className="mrc-muted">No detections meet confidence {confidenceThreshold.toFixed(2)}.</p>}
          <ol className="mrc-detection-list">
            {visibleDetections.map((detection) => {
              const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
              const isFlagged = flaggedKeys.has(key);
              return (
                <li key={key}>
                  <strong>{detection.className}</strong>
                  <span className="mrc-confidence">{(detection.confidence * 100).toFixed(1)}%</span>
                  <small>[{detection.x1.toFixed(1)}, {detection.y1.toFixed(1)}, {detection.x2.toFixed(1)}, {detection.y2.toFixed(1)}]</small>
                  {isFlagged ? (
                    <span className="mrc-flagged-tag">✓ Flagged</span>
                  ) : (
                    <div className="mrc-flag-actions">
                      <input type="text" placeholder="Ops-suggested label" value={suggestedLabels[key] || ""}
                        onChange={(event) => setSuggestedLabels((labels) => ({ ...labels, [key]: event.target.value }))} />
                      <button type="button" onClick={() => flagDetection(detection, "fp")}>False positive</button>
                      <button type="button" onClick={() => flagDetection(detection, "fn")}>False negative</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}

function DetectionBox({ detection }: { detection: Detection }) {
  const width = detection.x2 - detection.x1;
  const height = detection.y2 - detection.y1;
  const label = `${detection.className} ${(detection.confidence * 100).toFixed(1)}%`;
  return (
    <g className="mrc-box">
      <rect x={detection.x1} y={detection.y1} width={width} height={height} />
      <rect className="mrc-box-label-bg" x={detection.x1} y={Math.max(0, detection.y1 - 24)} width={Math.max(108, label.length * 7)} height="22" />
      <text x={detection.x1 + 5} y={Math.max(15, detection.y1 - 8)}>{label}</text>
    </g>
  );
}
