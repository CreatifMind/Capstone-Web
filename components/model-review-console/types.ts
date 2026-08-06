export type DevelopmentRole = "development_team" | "plant_manager";
export type DevelopmentAssigneeRole = DevelopmentRole;

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
  assignee_role: DevelopmentAssigneeRole;
  status: "todo" | "in_progress" | "blocked" | "done";
  url: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  team: "development";
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

export type SampleImageRecord = {
  id: string;
  filename: string;
  url: string;
  materialClass: string;
  groundTruthLabel: string;
  source: string;
  capturedAt: string;
};

export type ComponentHealthStatus = "operational" | "degraded" | "down";

export type ComponentHealthItem = {
  status: ComponentHealthStatus;
  latencyMs: number;
  details: string;
};

export type SystemHealthData = {
  status: ComponentHealthStatus;
  timestamp: string;
  components: {
    webApp: ComponentHealthItem;
    apiServer: ComponentHealthItem;
    backendFunctions: ComponentHealthItem;
    database: ComponentHealthItem;
    inferenceEngine: ComponentHealthItem;
  };
  systemMetrics: {
    heapUsedMb: number;
    uptimeSeconds: number;
  };
};
