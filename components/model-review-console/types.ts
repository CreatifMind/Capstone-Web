export type ModelReviewRole = "model_team" | "web_team" | "project_manager";

export type FlagRow = {
  id: string;
  run_id: string | null;
  class_name: string;
  confidence: number;
  x1: number; y1: number; x2: number; y2: number;
  signal_type: "fp" | "fn";
  suggested_label: string;
  flagged_by_email: string;
  resolved_at: string | null;
  retrain_run_id: string | null;
  created_at: string;
};

export type RetrainRun = {
  id: string;
  status: "queued" | "training" | "complete";
  base_version: string;
  new_version: string | null;
  started_by_email: string;
  started_at: string;
  completed_at: string | null;
  integrated: boolean;
  integrated_by_email: string | null;
  integrated_at: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  assignee_role: ModelReviewRole;
  status: "todo" | "in_progress" | "blocked" | "done";
  url: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  team: "model" | "web";
  notified_by_email: string;
  created_at: string;
};

export type ConsoleSettings = {
  confidence_threshold: number;
  retrain_threshold: number;
  updated_by_email: string | null;
  updated_at: string;
};

export type SharedStats = {
  imagesTested: number;
  latency: { avg: number; p50: number; p95: number; p99: number; samples: number };
  unresolvedFlags: number;
  dailyBars: { day: string; count: number }[];
  liveVersion: string;
  pendingVersion: string | null;
  currentRetrainRun: RetrainRun | null;
  settings: ConsoleSettings;
};
