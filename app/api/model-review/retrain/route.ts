import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const INITIAL_MODEL_VERSION = "yolov8-purityloop v1.4.2";

function bumpVersion(version: string) {
  return version.replace(/(\d+)(?!.*\d)/, (match) => String(Number(match) + 1));
}

async function currentVersions(service: ReturnType<typeof createSupabaseServiceClient>) {
  const { data: latestIntegrated } = await service
    .from("model_review_retrain_runs")
    .select("new_version")
    .eq("integrated", true)
    .order("integrated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: pending } = await service
    .from("model_review_retrain_runs")
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .eq("status", "complete")
    .eq("integrated", false)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    liveVersion: latestIntegrated?.new_version || INITIAL_MODEL_VERSION,
    pendingRun: pending || null
  };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { liveVersion, pendingRun } = await currentVersions(service);
  return NextResponse.json({ current: pendingRun, liveVersion, pendingVersion: pendingRun?.new_version || null });
}

export async function POST() {
  const checked = await modelReviewContext(["development_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;

  const { count: activeCount, error: activeError } = await service
    .from("model_review_retrain_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "training"]);
  const { count: pendingCompleteCount, error: pendingCompleteError } = await service
    .from("model_review_retrain_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "complete")
    .eq("integrated", false);
  if (activeError || pendingCompleteError) return failure("Unable to check retrain status.", 500);
  if (((activeCount || 0) + (pendingCompleteCount || 0)) > 0) return failure("A retrain is already in progress.", 409);

  const { data: settings, error: settingsError } = await service.from("model_review_settings").select("retrain_threshold").eq("id", true).single();
  if (settingsError || !settings) return failure("Unable to load retrain threshold.", 500);
  const { count: unresolvedCount, error: unresolvedError } = await service
    .from("model_review_flags")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  if (unresolvedError) return failure("Unable to check flagged signals.", 500);
  if ((unresolvedCount || 0) < settings.retrain_threshold) return failure("Not enough flagged false signals to trigger a retrain yet.", 422);

  const { liveVersion } = await currentVersions(service);
  const newVersion = bumpVersion(liveVersion);
  const nowIso = new Date().toISOString();

  const { data: retrainRun, error: insertError } = await service
    .from("model_review_retrain_runs")
    .insert({ status: "complete", base_version: liveVersion, new_version: newVersion, started_by_email: profile.email, started_at: nowIso, completed_at: nowIso })
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .single();
  if (insertError) return failure("Unable to start retrain.", 500);

  const { error: resolveError } = await service
    .from("model_review_flags")
    .update({ resolved_at: nowIso, retrain_run_id: retrainRun.id })
    .is("resolved_at", null);
  if (resolveError) {
    // Roll back the run insert so the "already in progress" guard above doesn't
    // permanently wedge on a run that never finished resolving its flags.
    await service.from("model_review_retrain_runs").delete().eq("id", retrainRun.id);
    return failure("Retrain recorded, but unable to resolve flagged signals.", 500);
  }

  return NextResponse.json({ retrainRun }, { status: 201 });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext(["development_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return failure("Retrain run id is required.", 422);

  const { data: retrainRun, error } = await service
    .from("model_review_retrain_runs")
    .update({ integrated: true, integrated_by_email: profile.email, integrated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "complete").eq("integrated", false)
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .single();
  if (error) {
    if (error.code === "PGRST116") return failure("Retrain run not found or already integrated.", 404);
    return failure("Unable to integrate retrain run.", 500);
  }
  if (!retrainRun) return failure("Retrain run not found or already integrated.", 404);
  return NextResponse.json({ retrainRun });
}
