import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);
const ASSIGNEE_ROLES = new Set(["model_team", "web_team", "project_manager"]);

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
  const { data: tasks, error } = await service
    .from("model_review_tasks")
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return failure("Unable to load tasks.", 500);
  return NextResponse.json({ tasks: tasks || [] });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const assigneeRole = typeof body?.assigneeRole === "string" ? body.assigneeRole : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!title || !ASSIGNEE_ROLES.has(assigneeRole)) return failure("A title and a valid assignee role are required.", 422);

  const { data: task, error } = await service
    .from("model_review_tasks")
    .insert({ title, assignee_role: assigneeRole, url, created_by_email: profile.email })
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .single();
  if (error) return failure("Unable to create task.", 500);
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !STATUSES.has(status)) return failure("A task id and a valid status are required.", 422);

  const { data: task, error } = await service
    .from("model_review_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .single();
  if (error || !task) return failure("Task not found.", 404);
  return NextResponse.json({ task });
}
