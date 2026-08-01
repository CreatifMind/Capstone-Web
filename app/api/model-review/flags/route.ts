import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";

const FLAG_TYPES = new Set(["fp", "fn"]);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;

  const { data: flags, error } = await service
    .from("model_review_flags")
    .select("id, run_id, class_name, confidence, x1, y1, x2, y2, signal_type, suggested_label, flagged_by_email, resolved_at, retrain_run_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return failure("Unable to load flags.", 500);

  const { count: unresolvedCount, error: unresolvedError } = await service
    .from("model_review_flags")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  if (unresolvedError) return failure("Unable to load flag counts.", 500);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data: sevenDayFlags, error: sevenDayError } = await service
    .from("model_review_flags")
    .select("created_at")
    .gte("created_at", sevenDaysAgo.toISOString());
  if (sevenDayError) return failure("Unable to load flag statistics.", 500);

  const dailyCounts = new Map<string, number>();
  (sevenDayFlags || []).forEach((flag) => {
    const createdAt = new Date(flag.created_at);
    const key = createdAt.toDateString();
    dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
  });
  const dailyBars = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + offset);
    return { day: DAY_LABELS[day.getDay()], count: dailyCounts.get(day.toDateString()) || 0 };
  });

  return NextResponse.json({ flags: flags || [], dailyBars, unresolvedFlags: unresolvedCount || 0 });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["development_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const runId = typeof body?.runId === "string" ? body.runId : null;
  const className = typeof body?.className === "string" ? body.className : "";
  const confidence = typeof body?.confidence === "number" ? body.confidence : NaN;
  const x1 = typeof body?.x1 === "number" ? body.x1 : NaN;
  const y1 = typeof body?.y1 === "number" ? body.y1 : NaN;
  const x2 = typeof body?.x2 === "number" ? body.x2 : NaN;
  const y2 = typeof body?.y2 === "number" ? body.y2 : NaN;
  const signalType = typeof body?.signalType === "string" ? body.signalType : "";
  const suggestedLabel = typeof body?.suggestedLabel === "string" ? body.suggestedLabel : "";

  if (!className || !FLAG_TYPES.has(signalType) || [confidence, x1, y1, x2, y2].some((value) => !Number.isFinite(value))) {
    return failure("className, confidence, coordinates, and a valid signalType (fp/fn) are required.", 422);
  }

  const { data: flag, error } = await service
    .from("model_review_flags")
    .insert({
      run_id: runId, class_name: className, confidence, x1, y1, x2, y2,
      signal_type: signalType, suggested_label: suggestedLabel, flagged_by_email: profile.email
    })
    .select("id, run_id, class_name, confidence, x1, y1, x2, y2, signal_type, suggested_label, flagged_by_email, resolved_at, retrain_run_id, created_at")
    .single();
  if (error) return failure("Unable to record flag.", 500);
  return NextResponse.json({ flag }, { status: 201 });
}
