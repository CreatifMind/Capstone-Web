import { NextResponse } from "next/server";
import { requireActiveDevelopment, type Role } from "@/lib/admin";

export function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

export async function modelReviewContext(allowedRoles?: readonly Role[]) {
  let context: Awaited<ReturnType<typeof requireActiveDevelopment>>;
  try { context = await requireActiveDevelopment(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Development workspace access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && context.profile.role !== "plant_manager" && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}
