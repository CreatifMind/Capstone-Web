import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const TEAMS = new Set(["model", "web"]);

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
  const { data: notifications, error } = await service
    .from("model_review_notifications")
    .select("id, team, notified_by_email, created_at")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) return failure("Unable to load notifications.", 500);
  return NextResponse.json({ notifications: notifications || [] });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const team = typeof body?.team === "string" ? body.team : "";
  if (!TEAMS.has(team)) return failure("A valid team (model/web) is required.", 422);

  const { data: notification, error } = await service
    .from("model_review_notifications")
    .insert({ team, notified_by_email: profile.email })
    .select("id, team, notified_by_email, created_at")
    .single();
  if (error) return failure("Unable to record notification.", 500);
  return NextResponse.json({ notification }, { status: 201 });
}
