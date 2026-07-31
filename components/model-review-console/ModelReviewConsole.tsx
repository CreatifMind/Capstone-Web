"use client";

import { useEffect, useState } from "react";
import type { ModelReviewRole, SharedStats } from "./types";
import ModelTeamPanel from "./ModelTeamPanel";
import WebTeamPanel from "./WebTeamPanel";
import PmPanel from "./PmPanel";

type Props = { role: ModelReviewRole };

async function fetchSharedStats(): Promise<SharedStats> {
  const [runRes, flagsRes, retrainRes, settingsRes] = await Promise.all([
    fetch("/api/model-review/run"),
    fetch("/api/model-review/flags"),
    fetch("/api/model-review/retrain"),
    fetch("/api/model-review/settings")
  ]);
  const [runData, flagsData, retrainData, settingsData] = await Promise.all([
    runRes.json(), flagsRes.json(), retrainRes.json(), settingsRes.json()
  ]);
  return {
    imagesTested: runData.imagesTested,
    latency: runData.latency,
    weeklyFalseSignals: flagsData.weeklyFalseSignals,
    dailyBars: flagsData.dailyBars,
    liveVersion: retrainData.liveVersion,
    pendingVersion: retrainData.pendingVersion,
    currentRetrainRun: retrainData.current,
    settings: settingsData.settings
  };
}

const ROLE_LABEL: Record<ModelReviewRole, string> = {
  model_team: "Model team",
  web_team: "Web team",
  project_manager: "Project manager"
};

export default function ModelReviewConsole({ role }: Props) {
  const [stats, setStats] = useState<SharedStats | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = () => setRefreshToken((token) => token + 1);

  useEffect(() => {
    let cancelled = false;
    fetchSharedStats().then((next) => { if (!cancelled) setStats(next); });
    return () => { cancelled = true; };
  }, [refreshToken]);

  if (!stats) return <p className="mrc-status">Loading console…</p>;

  return (
    <>
      <section className="mrc-stats" aria-label="Session overview">
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Images tested</p>
          <p className="mrc-stat-value">{stats.imagesTested}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Flagged for review</p>
          <p className="mrc-stat-value mrc-stat-warn">{stats.weeklyFalseSignals}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Role</p>
          <p className="mrc-stat-value mrc-stat-small">{ROLE_LABEL[role]}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Checkpoint</p>
          <p className="mrc-stat-value mrc-stat-mono" title={stats.liveVersion}>{stats.liveVersion}</p>
        </div>
      </section>

      {role === "model_team" && <ModelTeamPanel stats={stats} onChanged={refresh} />}
      {role === "web_team" && <WebTeamPanel stats={stats} onChanged={refresh} />}
      {role === "project_manager" && <PmPanel stats={stats} onChanged={refresh} />}
    </>
  );
}
