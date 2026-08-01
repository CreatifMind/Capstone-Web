import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";

const RETAIN_RUNS_FOR_LATENCY = 200;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;

  const { count, error: countError } = await service.from("model_review_runs").select("id", { count: "exact", head: true });
  if (countError) return failure("Unable to load run count.", 500);

  const { data: recent, error: recentError } = await service
    .from("model_review_runs")
    .select("duration_ms")
    .order("created_at", { ascending: false })
    .limit(RETAIN_RUNS_FOR_LATENCY);
  if (recentError) return failure("Unable to load latency samples.", 500);

  const durations = (recent || []).map((row) => Number(row.duration_ms)).sort((a, b) => a - b);
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  return NextResponse.json({
    imagesTested: count || 0,
    latency: {
      avg: Math.round(avg),
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      samples: durations.length
    }
  });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["development_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const detectionCount = typeof body?.detectionCount === "number" ? body.detectionCount : NaN;
  const durationMs = typeof body?.durationMs === "number" ? body.durationMs : NaN;
  if (!Number.isFinite(detectionCount) || detectionCount < 0 || !Number.isFinite(durationMs) || durationMs < 0) {
    return failure("detectionCount and durationMs must be non-negative numbers.", 422);
  }

  const { data: run, error } = await service
    .from("model_review_runs")
    .insert({ run_by_email: profile.email, detection_count: detectionCount, duration_ms: durationMs })
    .select("id, run_by_email, detection_count, duration_ms, created_at")
    .single();
  if (error) return failure("Unable to record run.", 500);
  return NextResponse.json({ run }, { status: 201 });
}
