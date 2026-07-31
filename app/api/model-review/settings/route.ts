import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: settings, error } = await service
    .from("model_review_settings")
    .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
    .eq("id", true)
    .single();
  if (error || !settings) return failure("Unable to load settings.", 500);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  if (typeof body?.confidenceThreshold === "number") {
    if (profile.role !== "model_team") return failure("Only model_team can edit the confidence threshold.", 403);
    const value = body.confidenceThreshold;
    if (value < 0.1 || value > 0.9) return failure("confidenceThreshold must be between 0.1 and 0.9.", 422);
    const { data: settings, error } = await service
      .from("model_review_settings")
      .update({ confidence_threshold: value, updated_by_email: profile.email, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
      .single();
    if (error || !settings) return failure("Unable to update settings.", 500);
    return NextResponse.json({ settings });
  }

  if (typeof body?.retrainThreshold === "number") {
    if (!["web_team", "project_manager"].includes(profile.role)) return failure("Only web_team or project_manager can edit the retrain threshold.", 403);
    const value = body.retrainThreshold;
    if (!Number.isInteger(value) || value < 1 || value > 30) return failure("retrainThreshold must be an integer between 1 and 30.", 422);
    const { data: settings, error } = await service
      .from("model_review_settings")
      .update({ retrain_threshold: value, updated_by_email: profile.email, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
      .single();
    if (error || !settings) return failure("Unable to update settings.", 500);
    return NextResponse.json({ settings });
  }

  return failure("Provide confidenceThreshold or retrainThreshold.", 422);
}
