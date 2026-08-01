"use client";

import { useState } from "react";
import type { SharedStats } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

const SNIPPET = 'import { loadModel } from "@purityloop/inference";\n\nconst model = await loadModel("/models/purityloop/best.onnx");\nconst detections = await model.run(imageTensor);';

export default function WebTeamPanel({ stats, onChanged }: Props) {
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [retrainThreshold, setRetrainThreshold] = useState(stats.settings.retrain_threshold);
  const [integrating, setIntegrating] = useState(false);

  const copySnippet = () => {
    navigator.clipboard.writeText(SNIPPET)
      .then(() => setCopyStatus("Copied — paste into the web integration branch."))
      .catch(() => setCopyStatus("Could not access clipboard."));
  };

  const updateRetrainThreshold = async (value: number) => {
    setError("");
    try {
      const response = await fetch("/api/model-review/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retrainThreshold: value })
      });
      if (!response.ok) {
        setError("Unable to update retrain threshold.");
        return;
      }
      onChanged();
    } catch {
      setError("Unable to update retrain threshold.");
    }
  };

  const markIntegrated = async () => {
    if (!stats.currentRetrainRun) return;
    setError("");
    setIntegrating(true);
    try {
      const response = await fetch("/api/model-review/retrain", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stats.currentRetrainRun.id })
      });
      if (response.ok) {
        onChanged();
      } else {
        setError("Unable to mark integration.");
      }
    } catch {
      setError("Unable to mark integration.");
    } finally {
      setIntegrating(false);
    }
  };

  const showRetrainBanner = !!stats.currentRetrainRun && stats.currentRetrainRun.status === "complete" && !stats.currentRetrainRun.integrated;
  const latencyStatus = stats.latency.p95 < 150 ? "Fast" : stats.latency.p95 < 300 ? "Nominal" : "Slow";

  return (
    <>
      {showRetrainBanner && (
        <div className="mrc-card mrc-banner">
          <div>
            <strong>Retrained checkpoint ready: {stats.pendingVersion}</strong>
            <p className="mrc-muted">Resolved this cycle's flagged false signals. Integrate when ready.</p>
          </div>
          <button type="button" className="mrc-btn-primary" onClick={markIntegrated} disabled={integrating}>
            {integrating ? "Integrating…" : "Mark integrated"}
          </button>
        </div>
      )}
      {error && <p className="mrc-error" role="alert">{error}</p>}

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Current checkpoint</h2>
          <p className="mrc-mono-box">{stats.liveVersion}</p>
          <button type="button" className="mrc-btn-primary" onClick={copySnippet}>Copy integration snippet</button>
          <p className="mrc-muted">{copyStatus || "Copies the latest model load snippet for the development integration branch."}</p>
          <label className="mrc-field">
            Retrain threshold ({retrainThreshold})
            <input type="range" min={1} max={30} step={1} value={retrainThreshold}
              onChange={(event) => setRetrainThreshold(Number(event.target.value))}
              onPointerUp={(event) => updateRetrainThreshold(Number((event.target as HTMLInputElement).value))}
              onKeyUp={(event) => updateRetrainThreshold(Number((event.target as HTMLInputElement).value))} />
          </label>
        </div>

        <div className="mrc-card">
          <h2>Inference latency <span className="mrc-latency-status">{latencyStatus}</span></h2>
          <div className="mrc-latency-grid">
            <div><p className="mrc-muted">Average</p><p className="mrc-stat-value">{stats.latency.avg} ms</p></div>
            <div><p className="mrc-muted">p50</p><p className="mrc-stat-value">{stats.latency.p50} ms</p></div>
            <div><p className="mrc-muted">p95</p><p className="mrc-stat-value">{stats.latency.p95} ms</p></div>
            <div><p className="mrc-muted">p99</p><p className="mrc-stat-value">{stats.latency.p99} ms</p></div>
          </div>
          <p className="mrc-muted">Based on {stats.latency.samples} console detection runs.</p>
        </div>
      </section>
    </>
  );
}
