"use client";

import { useEffect, useState } from "react";
import type { DevelopmentRole, SharedStats } from "./types";
import ModelTeamPanel from "./ModelTeamPanel";
import WebTeamPanel from "./WebTeamPanel";
import PmPanel from "./PmPanel";

type Props = { role: DevelopmentRole };
type DevelopmentTab = "model" | "web" | "manager";

async function fetchSharedStats(): Promise<SharedStats> {
  const [runRes, flagsRes, retrainRes, settingsRes] = await Promise.all([
    fetch("/api/model-review/run"),
    fetch("/api/model-review/flags"),
    fetch("/api/model-review/retrain"),
    fetch("/api/model-review/settings")
  ]);

  if (!runRes.ok) throw new Error("Failed to load run data");
  if (!flagsRes.ok) throw new Error("Failed to load flags data");
  if (!retrainRes.ok) throw new Error("Failed to load retrain data");
  if (!settingsRes.ok) throw new Error("Failed to load settings data");

  const [runData, flagsData, retrainData, settingsData] = await Promise.all([
    runRes.json(), flagsRes.json(), retrainRes.json(), settingsRes.json()
  ]);
  return {
    imagesTested: runData.imagesTested,
    latency: runData.latency,
    unresolvedFlags: flagsData.unresolvedFlags,
    dailyBars: flagsData.dailyBars,
    liveVersion: retrainData.liveVersion,
    pendingVersion: retrainData.pendingVersion,
    currentRetrainRun: retrainData.current,
    settings: settingsData.settings
  };
}

const ROLE_LABEL: Record<DevelopmentRole, string> = {
  development_team: "Development team",
  plant_manager: "Plant manager"
};

export default function ModelReviewConsole({ role }: Props) {
  const [stats, setStats] = useState<SharedStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeTab, setActiveTab] = useState<DevelopmentTab>("model");

  const refresh = () => setRefreshToken((token) => token + 1);
  const tabs: Array<{ id: DevelopmentTab; label: string; disabled?: boolean }> = [
    { id: "model", label: "Model Team" },
    { id: "web", label: "Web Team" },
    { id: "manager", label: "Manager", disabled: role !== "plant_manager" }
  ];

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchSharedStats()
      .then((next) => { if (!cancelled) setStats(next); })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || "Failed to load console data.");
      });
    return () => { cancelled = true; };
  }, [refreshToken]);

  if (loadError && !stats) return <p className="mrc-error">{loadError}</p>;
  if (!stats) return <p className="mrc-status">Loading console…</p>;

  return (
    <>
      {loadError && <p className="mrc-error" role="alert">{loadError}</p>}
      <section className="mrc-stats" aria-label="Session overview">
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Images tested</p>
          <p className="mrc-stat-value">{stats.imagesTested}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Flagged for review</p>
          <p className="mrc-stat-value mrc-stat-warn">{stats.unresolvedFlags}</p>
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

      <div className="mrc-tab-selector" role="tablist" aria-label="Development workspace sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}TeamPanel`}
            aria-disabled={tab.disabled || undefined}
            disabled={tab.disabled}
            id={`${tab.id}TeamTab`}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="modelTeamPanel"
        className="mrc-workstream"
        aria-labelledby="modelTeamSectionTitle"
        role="tabpanel"
        hidden={activeTab !== "model"}
      >
        <header className="mrc-workstream-header">
          <div>
            <span className="panel-kicker">Model Team</span>
            <h2 id="modelTeamSectionTitle">Model validation console</h2>
          </div>
          <p>Run browser inference, flag false signals, and prepare retraining evidence.</p>
        </header>
        <ModelTeamPanel stats={stats} onChanged={refresh} />
      </section>

      <section
        id="webTeamPanel"
        className="mrc-workstream"
        aria-labelledby="webTeamSectionTitle"
        role="tabpanel"
        hidden={activeTab !== "web"}
      >
        <header className="mrc-workstream-header">
          <div>
            <span className="panel-kicker">Web Team</span>
            <h2 id="webTeamSectionTitle">Deployment integration</h2>
          </div>
          <p>Track model version readiness, browser latency, and integration handoff.</p>
        </header>
        <WebTeamPanel stats={stats} onChanged={refresh} />
      </section>

      {role === "plant_manager" && (
        <section
          id="managerTeamPanel"
          className="mrc-workstream"
          aria-labelledby="managerSectionTitle"
          role="tabpanel"
          hidden={activeTab !== "manager"}
        >
          <header className="mrc-workstream-header">
            <div>
              <span className="panel-kicker">Manager</span>
              <h2 id="managerSectionTitle">Coordination and approvals</h2>
            </div>
            <p>Monitor handoff status, request updates, and manage cross-team tasks.</p>
          </header>
          <PmPanel stats={stats} onChanged={refresh} />
        </section>
      )}
    </>
  );
}
