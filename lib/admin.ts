import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export const ROLES = ["operator", "team_lead", "operations_manager", "model_team", "project_manager", "web_team", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type UserProfile = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: Role;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }

export async function requireActiveAdmin() {
  const sessionClient = createSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return { error: "unauthenticated" as const };

  const service = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<UserProfile>();
  if (profileError || !profile || profile.status !== "active" || profile.role !== "admin") return { error: "forbidden" as const };
  return { user, profile, service };
}
