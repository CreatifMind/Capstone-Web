import { NextResponse } from "next/server";
import { ROLES, normalizeEmail, requireActiveAdmin, requireActiveRole, type Role, type UserProfile } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type AdminUser = UserProfile & { last_login: string | null };
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type CreateInput = { name: string; email: string; password: string; role: Role; status: "active" | "inactive" };
type UpdateInput = { name: string; email: string; role: Role; status: "active" | "inactive"; password: string };
type Parsed<T> = { value: T } | { error: string };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function adminContext() {
  let context: Awaited<ReturnType<typeof requireActiveAdmin>>;
  try { context = await requireActiveAdmin(); } catch { return { response: fail("AUTH_CONFIG_MISSING", "Authentication is not configured.", 503) }; }
  if ("error" in context) {
    return { response: fail(context.error === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", context.error === "unauthenticated" ? "Authentication required." : "Administrator access required.", context.error === "unauthenticated" ? 401 : 403) };
  }
  return { context };
}

export async function userListContext() {
  let context: Awaited<ReturnType<typeof requireActiveRole>>;
  try { context = await requireActiveRole(["admin", "plant_manager"]); } catch { return { response: fail("AUTH_CONFIG_MISSING", "Authentication is not configured.", 503) }; }
  if ("error" in context) {
    return { response: fail(context.error === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", context.error === "unauthenticated" ? "Authentication required." : "User-management access required.", context.error === "unauthenticated" ? 401 : 403) };
  }
  return { context };
}

export function parseCreate(body: Record<string, unknown> | null): Parsed<CreateInput> {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  const role = body?.role as Role;
  const status = body?.status as "active" | "inactive";
  if (!name) return { error: "Full name is required." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Select a valid role." };
  if (!["active", "inactive"].includes(status)) return { error: "Select a valid status." };
  if (password.length < 8) return { error: "Enter a password of at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  return { value: { name, email, password, role, status } };
}

export function parseUpdate(body: Record<string, unknown> | null): Parsed<UpdateInput> {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const role = body?.role as Role;
  const status = body?.status as "active" | "inactive";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  if (!name) return { error: "Full name is required." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Select a valid role." };
  if (!["active", "inactive"].includes(status)) return { error: "Select a valid status." };
  if ((password || confirmPassword) && password.length < 8) return { error: "Enter a password of at least 8 characters." };
  if ((password || confirmPassword) && password !== confirmPassword) return { error: "Passwords do not match." };
  return { value: { name, email, role, status, password } };
}

export async function findAuthUserByEmail(service: ServiceClient, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error };
    const found = data.users.find((user) => normalizeEmail(user.email || "") === email);
    if (found) return { found: true as const, id: found.id };
    if (data.users.length < 1000) return { found: false as const };
  }
}

export async function listAuthLogins(service: ServiceClient) {
  const logins = new Map<string, string | null>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error };
    data.users.forEach((user) => logins.set(user.id, user.last_sign_in_at || null));
    if (data.users.length < 1000) return { logins };
  }
}

export async function profileById(service: ServiceClient, id: string) {
  return service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<UserProfile>();
}

export async function withLastLogin(service: ServiceClient, profile: UserProfile): Promise<AdminUser> {
  if (!profile.auth_user_id) return { ...profile, last_login: null };
  const { data, error } = await service.auth.admin.getUserById(profile.auth_user_id);
  return { ...profile, last_login: error ? null : data.user?.last_sign_in_at || null };
}

export async function ensureEmailAvailable(service: ServiceClient, email: string, profileId?: string, authUserId?: string) {
  const { data: sameEmailProfile, error: emailLookupError } = await service.from("user_profiles").select("id").eq("email", email).maybeSingle();
  if (emailLookupError) return { response: fail("EMAIL_CHECK_FAILED", "Unable to validate email.", 500) };
  if (sameEmailProfile && sameEmailProfile.id !== profileId) return { response: fail("DUPLICATE_EMAIL", "This email is already reserved by an application profile.", 409) };
  const existingAuth = await findAuthUserByEmail(service, email);
  if ("error" in existingAuth) return { response: fail("EMAIL_CHECK_FAILED", "Unable to validate email.", 500) };
  if (existingAuth.found && existingAuth.id !== authUserId) return { response: fail("DUPLICATE_EMAIL", "This email already has an authentication account.", 409) };
  return {};
}

export async function ensureNotFinalActiveAdmin(service: ServiceClient, target: Pick<UserProfile, "id" | "role" | "status">, next?: Pick<UserProfile, "role" | "status">) {
  const removesActiveAdmin = target.role === "admin" && target.status === "active" && (!next || next.role !== "admin" || next.status !== "active");
  if (!removesActiveAdmin) return {};
  const { count, error } = await service.from("user_profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active").is("deleted_at", null);
  if (error) return { response: fail("ADMIN_CHECK_FAILED", "Unable to verify active administrators.", 500) };
  if ((count || 0) <= 1) return { response: fail("FINAL_ADMIN", "The final active administrator cannot be removed.", 409) };
  return {};
}

function isEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}
