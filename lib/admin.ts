import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ROLES, roleHomePath, type Role } from "@/lib/roles";

export { ROLES, roleHomePath };
export type { Role };

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

export async function requireActiveRole(allowedRoles: readonly Role[]) {
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
  if (profileError || !profile) return { error: "forbidden" as const };
  if (profile.status !== "active" || profile.deleted_at) return { error: "inactive" as const, profile };
  if (!allowedRoles.includes(profile.role)) return { error: "forbidden" as const, profile };
  return { user, profile, service };
}

export async function requireActiveAdmin() {
  return requireActiveRole(["admin"]);
}

export async function requireActiveDevelopment() {
  return requireActiveRole(["development_team"]);
}

export async function requireActiveDevelopmentWorkspace() {
  return requireActiveRole(["development_team", "plant_manager"]);
}
