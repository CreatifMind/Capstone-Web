import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";

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
    if (profile.role !== "development_team" && profile.role !== "plant_manager") return failure("Only the development team can edit the confidence threshold.", 403);
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
    if (profile.role !== "development_team" && profile.role !== "plant_manager") return failure("Only the development team can edit the retrain threshold.", 403);
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
