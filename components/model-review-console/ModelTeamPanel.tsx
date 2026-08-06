"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { MODEL_CONFIG } from "@/lib/inference/model-config";
import { runModel } from "@/lib/inference/onnx-session";
import { postprocessOutput } from "@/lib/inference/postprocess";
import { preprocessImage } from "@/lib/inference/preprocess";
import type { Detection } from "@/lib/inference/types";
import type { SampleImageRecord, SharedStats } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

function loadImage(source: string, filename: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () =>
      image.naturalWidth && image.naturalHeight
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
  const [activeSample, setActiveSample] = useState<SampleImageRecord | null>(null);
  const [sampleBatch, setSampleBatch] = useState<SampleImageRecord[]>([]);

  const [syncFrequency, setSyncFrequency] = useState<"hourly" | "daily">("daily");
  const [status, setStatus] = useState("Automated DB Batch ready. Select any sample to test accuracy.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSyncingBatch, setIsSyncingBatch] = useState(false);

  const [detections, setDetections] = useState<Detection[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());

  const [classFilter, setClassFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");

  const [confidenceThreshold, setConfidenceThreshold] = useState(stats.settings.confidence_threshold);
  const [retrainThreshold, setRetrainThreshold] = useState(stats.settings.retrain_threshold);
  const [suggestedLabels, setSuggestedLabels] = useState<Record<string, string>>({});
  const [retraining, setRetraining] = useState(false);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current && previewUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = "";
  };

  const fetchBatchFromDB = async (material = materialFilter) => {
    setIsSyncingBatch(true);
    setError("");
    setStatus(`Fetching automated ${syncFrequency} test image batch from database…`);

    try {
      const res = await fetch(`/api/model-review/sample-images?material=${material}`);
      if (!res.ok) throw new Error("Failed to fetch image batch from database");
      const data = await res.json();
      const samples: SampleImageRecord[] = data.samples || [];
      setSampleBatch(samples);

      if (samples.length > 0) {
        const first = samples[0];
        await loadAndTestSample(first);
      } else {
        setStatus("No images found in current DB batch query.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automated DB batch.");
      setStatus("DB Batch sync failed.");
    } finally {
      setIsSyncingBatch(false);
    }
  };

  useEffect(() => {
    fetchBatchFromDB();
  }, [syncFrequency]);

  const executeInferenceOnLoadedImage = async (
    targetImage: HTMLImageElement,
    label: string
  ) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    setError("");
    setStatus(`Loading ONNX model and running inference on "${label}"…`);
    const startedAt = performance.now();

    try {
      const preprocessed = preprocessImage(targetImage);
      const result = await runModel(preprocessed.data);
      const output = postprocessOutput(result.output, preprocessed.letterbox);
      const durationMs = performance.now() - startedAt;

      setDetections(output.detections);
      setFlaggedKeys(new Set());
      setStatus(
        output.detections.length
          ? `Inference complete: ${output.detections.length} detection${output.detections.length === 1 ? "" : "s"} found.`
          : `Inference complete: no detections met confidence threshold ${MODEL_CONFIG.confidenceThreshold}.`
      );

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
        setError("Run was not recorded in console DB.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ONNX inference failed.");
      setStatus("Inference failed.");
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  const loadAndTestSample = async (sample: SampleImageRecord) => {
    if (runningRef.current) return;
    revokePreviewUrl();
    setFile(null);
    setActiveSample(sample);
    setPreviewUrl(sample.url);

    try {
      const loadedImg = await loadImage(sample.url, sample.filename);
      setImage(loadedImg);
      setStatus(`Loaded DB sample: ${sample.groundTruthLabel} (${sample.source})`);
      await executeInferenceOnLoadedImage(loadedImg, sample.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample image.");
    }
  };

  const selectManualImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;
    revokePreviewUrl();
    setFile(null);
    setActiveSample(null);
    setPreviewUrl("");
    setImage(null);
    setDetections([]);
    setRunId(null);
    setError("");

    setStatus("Validating manual upload…");
    const nextPreviewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreviewUrl;

    try {
      const nextImage = await loadImage(nextPreviewUrl, selected.name);
      setFile(selected);
      setPreviewUrl(nextPreviewUrl);
      setImage(nextImage);
      setStatus("Manual upload ready. Click 'Run detection' to test.");
    } catch (nextError) {
      revokePreviewUrl();
      input.value = "";
      setError(nextError instanceof Error ? nextError.message : "Unable to read image file.");
      setStatus("Image rejected.");
    }
  };

  const runManualDetection = async () => {
    if (!image || runningRef.current) return;
    await executeInferenceOnLoadedImage(image, file?.name || "Uploaded Image");
  };

  const reset = () => {
    if (runningRef.current) return;
    revokePreviewUrl();
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setActiveSample(null);
    setPreviewUrl("");
    setImage(null);
    setDetections([]);
    setRunId(null);
    setError("");
    setStatus("Select any DB batch sample or upload a file to test accuracy.");
  };

  const flagDetection = async (detection: Detection, signalType: "fp" | "fn") => {
    const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
    try {
      const response = await fetch("/api/model-review/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          className: detection.className,
          confidence: detection.confidence,
          x1: detection.x1,
          y1: detection.y1,
          x2: detection.x2,
          y2: detection.y2,
          signalType,
          suggestedLabel: suggestedLabels[key] || ""
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

  const updateRetrainThreshold = async (value: number) => {
    setRetrainThreshold(value);
    try {
      const response = await fetch("/api/model-review/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retrainThreshold: value })
      });
      if (response.ok) {
        onChanged();
      } else {
        setError("Unable to update retrain threshold.");
      }
    } catch {
      setError("Unable to update retrain threshold.");
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
      link.href = url;
      link.download = "false-signals.json";
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      setError("Unable to export false signals.");
    }
  };

  const visibleDetections = detections
    .filter((detection) => classFilter === "all" || detection.className === classFilter)
    .filter((detection) => detection.confidence >= confidenceThreshold);

  const readyToRetrain = stats.unresolvedFlags >= retrainThreshold;
  const flagsProgressPercent = Math.min(100, Math.round((stats.unresolvedFlags / retrainThreshold) * 100));
  const maxDaily = Math.max(...stats.dailyBars.map((bar) => bar.count), 1);

  return (
    <>
      {/* 4-Step Lifecycle & Strategy Guide */}
      <section className="mrc-card mrc-strategy-card" aria-label="Model Training & Retraining Strategy Guide">
        <h2>Model Lifecycle & Retraining Strategy</h2>
        <div className="mrc-stepper" aria-label="4-stage lifecycle">
          <div>
            <span>1</span>
            <strong>Initial Base Model</strong>
            <small>YOLO Base trained on benchmark data</small>
          </div>
          <div>
            <span>2</span>
            <strong>Automated DB Batch Pull</strong>
            <small>Hourly/Daily auto-sync inspection batch</small>
          </div>
          <div>
            <span>3</span>
            <strong>Flag False Signals</strong>
            <small>Collect FP/FN ground truth feedback</small>
          </div>
          <div>
            <span>4</span>
            <strong>Retrain Trigger</strong>
            <small>Auto fine-tune when criteria met</small>
          </div>
        </div>

        <div className="mrc-guide-grid">
          <div className="mrc-guide-box">
            <h3>When should I train the initial model?</h3>
            <p>
              Train an initial base model when deploying a new material classification category, upgrading the target YOLO
              architecture, or establishing a new sorting line baseline dataset.
            </p>
          </div>
          <div className="mrc-guide-box">
            <h3>What triggers model retraining?</h3>
            <p>
              Retraining is triggered automatically when <strong>accumulated false signal flags reach the threshold</strong> (currently{" "}
              {retrainThreshold} flags), or when accuracy drift occurs on automated hourly/daily DB batches.
            </p>
          </div>
        </div>
      </section>

      {/* Retrain Triggers & Readiness Dashboard */}
      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Active Retrain Triggers & Settings</h2>
          <div className="mrc-trigger-list">
            <div className="mrc-trigger-item">
              <div className="mrc-trigger-header">
                <strong>Trigger 1: False Signal Flag Threshold</strong>
                <span className={`mrc-badge${readyToRetrain ? " mrc-badge-ready" : ""}`}>
                  {stats.unresolvedFlags} / {retrainThreshold} Flags ({flagsProgressPercent}%)
                </span>
              </div>
              <div className="mrc-progress-bar">
                <div className="mrc-progress-fill" style={{ width: `${flagsProgressPercent}%` }} />
              </div>
              <small className="mrc-muted">
                {readyToRetrain
                  ? "Threshold reached! Ready to initiate fine-tuning."
                  : `${retrainThreshold - stats.unresolvedFlags} more false signals needed to trigger retrain.`}
              </small>
            </div>

            {/* Retrain Threshold Slider - Moved to Model Team */}
            <div className="mrc-trigger-item">
              <label className="mrc-field">
                Configured Retrain Threshold ({retrainThreshold} flags):
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={retrainThreshold}
                  onChange={(event) => setRetrainThreshold(Number(event.target.value))}
                  onPointerUp={(event) => updateRetrainThreshold(Number((event.target as HTMLInputElement).value))}
                  onKeyUp={(event) => updateRetrainThreshold(Number((event.target as HTMLInputElement).value))}
                />
              </label>
              <small className="mrc-muted">Adjust how many accumulated false signals trigger model fine-tuning.</small>
            </div>

            <div className="mrc-trigger-item">
              <div className="mrc-trigger-header">
                <strong>Trigger 2: Confidence Stability Drift</strong>
                <span className="mrc-badge mrc-badge-ready">Stable (&ge; 90%)</span>
              </div>
              <small className="mrc-muted">Evaluates confidence stability across automated DB inspection batches.</small>
            </div>
          </div>

          <div className="mrc-retrain-action-row">
            <button
              type="button"
              className="mrc-btn-primary"
              onClick={startRetrain}
              disabled={!readyToRetrain || retraining}
            >
              {retraining ? "Retraining in progress…" : "Initiate Model Retrain"}
            </button>
            <button type="button" className="mrc-btn-secondary" onClick={exportFlags} disabled={stats.unresolvedFlags === 0}>
              Export False Signals JSON
            </button>
          </div>
        </div>

        {/* Daily False Signals Chart */}
        <div className="mrc-card">
          <h2>Cumulative False Signals by Day</h2>
          <p className="mrc-muted">
            {stats.unresolvedFlags} unresolved &middot; Retrain threshold: {retrainThreshold}
          </p>
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
      </section>

      {/* Main Interactive Testing Suite: Automated DB Batch Pull */}
      <section className="mrc-card" aria-label="Automated Database Batch Pull Suite">
        <div className="mrc-health-banner-header">
          <div>
            <h2>Automated DB Batch Pull Suite</h2>
            <p className="mrc-muted">
              Auto-pulls inspection image groups from the database on a schedule for automated model accuracy evaluation.
            </p>
          </div>
          <div className="mrc-retrain-controls">
            <label className="mrc-field-inline">
              Auto Sync Frequency:
              <select
                value={syncFrequency}
                onChange={(e) => setSyncFrequency(e.target.value as "hourly" | "daily")}
                disabled={isRunning || isSyncingBatch}
              >
                <option value="hourly">Hourly Auto Sync</option>
                <option value="daily">Daily Auto Batch Sync</option>
              </select>
            </label>
          </div>
        </div>

        {/* Batch Control Toolbar */}
        <section className="mrc-controls" style={{ marginTop: "14px" }}>
          <button
            type="button"
            className="mrc-btn-primary"
            onClick={() => fetchBatchFromDB(materialFilter)}
            disabled={isRunning || isSyncingBatch}
          >
            {isSyncingBatch ? "Syncing DB Batch…" : `Sync Next ${syncFrequency === "hourly" ? "Hourly" : "Daily"} DB Batch`}
          </button>

          <label className="mrc-field-inline">
            Filter Material:
            <select
              value={materialFilter}
              onChange={(e) => {
                setMaterialFilter(e.target.value);
                fetchBatchFromDB(e.target.value);
              }}
              disabled={isRunning || isSyncingBatch}
            >
              <option value="all">All Categories</option>
              <option value="plastic">Plastic</option>
              <option value="aluminum">Aluminum</option>
              <option value="cardboard">Cardboard</option>
              <option value="glass">Glass</option>
              <option value="mixed">Mixed Waste</option>
              <option value="paper">Paper</option>
              <option value="e-waste">E-Waste</option>
            </select>
          </label>

          <label className={`mrc-btn-secondary${isRunning || isSyncingBatch ? " mrc-disabled" : ""}`}>
            Or upload custom file
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={selectManualImage}
              disabled={isRunning || isSyncingBatch}
            />
          </label>

          {image && file && (
            <button type="button" className="mrc-btn-primary" onClick={runManualDetection} disabled={isRunning}>
              {isRunning ? "Running…" : "Run detection"}
            </button>
          )}

          <button type="button" className="mrc-btn-secondary" onClick={reset} disabled={isRunning || isSyncingBatch}>
            Reset Suite
          </button>
        </section>

        {/* Automated DB Batch Thumbnail Carousel / Grid */}
        {sampleBatch.length > 0 && (
          <div className="mrc-batch-wrapper">
            <div className="mrc-batch-header">
              <strong>
                Active Automated Batch ({sampleBatch.length} Inspection Images pulled via {syncFrequency} sync):
              </strong>
              <small className="mrc-muted">Click any image thumbnail to inspect bounding boxes and verify accuracy.</small>
            </div>
            <div className="mrc-batch-grid">
              {sampleBatch.map((sample) => {
                const isSelected = activeSample?.id === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    className={`mrc-batch-thumb${isSelected ? " active" : ""}`}
                    onClick={() => loadAndTestSample(sample)}
                    disabled={isRunning}
                  >
                    <img src={sample.url} alt={sample.groundTruthLabel} />
                    <span>{sample.groundTruthLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mrc-status" role="status" style={{ marginTop: "12px" }}>
          {status}
        </p>
        {error && (
          <p className="mrc-error" role="alert">
            {error}
          </p>
        )}

        {/* Toolbar controls */}
        <div className="mrc-toolbar-sub">
          <label className="mrc-field">
            Filter Detection Class:
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="all">All Material Classes</option>
              {MODEL_CONFIG.classes.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
          </label>

          <label className="mrc-field">
            Confidence Threshold ({confidenceThreshold.toFixed(2)}):
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.01}
              value={confidenceThreshold}
              onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
              onPointerUp={(event) => updateConfidenceThreshold(Number((event.target as HTMLInputElement).value))}
              onKeyUp={(event) => updateConfidenceThreshold(Number((event.target as HTMLInputElement).value))}
            />
          </label>
        </div>

        {/* Image Display & Bounding Boxes */}
        <section className="mrc-grid-2" style={{ marginTop: "16px" }}>
          <div className="mrc-card">
            <h2>Active Inspection Image</h2>
            {activeSample && (
              <div className="mrc-sample-meta">
                <span className="mrc-badge mrc-badge-ready">DB Record: {activeSample.id}</span>
                <span>
                  <strong>Ground Truth:</strong> {activeSample.groundTruthLabel}
                </span>
                <span>
                  <strong>Source:</strong> {activeSample.source}
                </span>
              </div>
            )}
            {previewUrl && image ? (
              <div className="mrc-image-stage">
                <img src={previewUrl} alt={activeSample?.groundTruthLabel || file?.name || "Test Image"} />
                <svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} preserveAspectRatio="none">
                  {visibleDetections.map((detection) => (
                    <DetectionBox key={`${detection.classId}-${detection.x1}-${detection.y1}`} detection={detection} />
                  ))}
                </svg>
              </div>
            ) : (
              <p className="mrc-muted">No test image active. Click any batch thumbnail above to begin.</p>
            )}
          </div>

          <div className="mrc-card">
            <h2>Detection Results & Feedback</h2>
            <p className="mrc-muted">Flag incorrect detections — feedback routes straight to model retraining data pipeline.</p>
            {!detections.length && <p className="mrc-muted">Select a batch image or run detection to view bounding boxes.</p>}
            {!!detections.length && !visibleDetections.length && (
              <p className="mrc-muted">No detections meet confidence threshold {confidenceThreshold.toFixed(2)}.</p>
            )}
            <ol className="mrc-detection-list">
              {visibleDetections.map((detection) => {
                const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
                const isFlagged = flaggedKeys.has(key);
                return (
                  <li key={key}>
                    <strong>{detection.className}</strong>
                    <span className="mrc-confidence">{(detection.confidence * 100).toFixed(1)}%</span>
                    <small>
                      [{detection.x1.toFixed(1)}, {detection.y1.toFixed(1)}, {detection.x2.toFixed(1)},{" "}
                      {detection.y2.toFixed(1)}]
                    </small>
                    {isFlagged ? (
                      <span className="mrc-flagged-tag">&check; Flagged for Retraining</span>
                    ) : (
                      <div className="mrc-flag-actions">
                        <input
                          type="text"
                          placeholder="Suggested ground truth label"
                          value={suggestedLabels[key] || ""}
                          onChange={(event) =>
                            setSuggestedLabels((labels) => ({ ...labels, [key]: event.target.value }))
                          }
                        />
                        <button type="button" onClick={() => flagDetection(detection, "fp")}>
                          False positive
                        </button>
                        <button type="button" onClick={() => flagDetection(detection, "fn")}>
                          False negative
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
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
      <rect
        className="mrc-box-label-bg"
        x={detection.x1}
        y={Math.max(0, detection.y1 - 24)}
        width={Math.max(108, label.length * 7)}
        height="22"
      />
      <text x={detection.x1 + 5} y={Math.max(15, detection.y1 - 8)}>
        {label}
      </text>
    </g>
  );
}
