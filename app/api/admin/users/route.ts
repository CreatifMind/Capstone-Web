import { NextResponse } from "next/server";
import { ROLES, normalizeEmail, requireActiveAdmin, type Role, type UserProfile } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
function diagnose(event: string, detail: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") console.info("[admin/users]", event, detail);
}

async function findAuthUserByEmail(service: ReturnType<typeof createSupabaseServiceClient>, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error };
    if (data.users.some((user) => normalizeEmail(user.email || "") === email)) return { found: true as const };
    if (data.users.length < 1000) return { found: false as const };
  }
}

async function adminContext() {
  let context: Awaited<ReturnType<typeof requireActiveAdmin>>;
  try { context = await requireActiveAdmin(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Administrator access required.", context.error === "unauthenticated" ? 401 : 403) };
  return { context };
}

export async function GET() {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: profiles, error } = await service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return failure("Unable to load users.", 500);

  const logins = new Map<string, string | null>();
  for (let page = 1; ; page += 1) {
    const { data, error: authError } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (authError) return failure("Unable to load authentication metadata.", 500);
    data.users.forEach((user) => logins.set(user.id, user.last_sign_in_at || null));
    if (data.users.length < 1000) break;
  }
  return NextResponse.json({ users: (profiles as UserProfile[]).map((profile) => ({ ...profile, last_login: profile.auth_user_id ? logins.get(profile.auth_user_id) || null : null })) });
}

export async function POST(request: Request) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role as Role;
  const status = body?.status;
  diagnose("creation request", { email, passwordProvided: password.length > 0, passwordLength: password.length, role, status });
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !ROLES.includes(role) || !["active", "inactive"].includes(String(status))) {
    return failure("Enter a name, valid email, password of at least 8 characters, role, and status.", 422);
  }

  const { data: existingProfile, error: profileLookupError } = await service.from("user_profiles").select("id").eq("email", email).maybeSingle();
  if (profileLookupError) return failure("Unable to validate email.", 500);
  if (existingProfile) return failure("This email is already reserved by an application profile.", 409);
  const existingAuth = await findAuthUserByEmail(service, email);
  if ("error" in existingAuth) return failure("Unable to validate email.", 500);
  if (existingAuth.found) return failure("This email already has an authentication account.", 409);

  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (createError || !created.user) {
    diagnose("auth creation failed", { email, code: createError?.code, message: createError?.message });
    return failure(createError?.message || "Unable to create authentication account.", 422);
  }
  const { data: authCheck, error: authCheckError } = await service.auth.admin.getUserById(created.user.id);
  const authUser = authCheck.user;
  const hasEmailIdentity = authUser?.identities?.some((identity) => identity.provider === "email") || false;
  if (authCheckError || !authUser?.email_confirmed_at || normalizeEmail(authUser.email || "") !== email || !hasEmailIdentity) {
    await service.auth.admin.deleteUser(created.user.id);
    diagnose("auth verification failed", { email, code: authCheckError?.code, message: authCheckError?.message, emailConfirmed: Boolean(authUser?.email_confirmed_at), hasEmailIdentity });
    return failure("Authentication account could not be verified and was removed.", 500);
  }
  const { data: profile, error: insertError } = await service
    .from("user_profiles")
    .insert({ auth_user_id: created.user.id, name, email, role, status })
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .single<UserProfile>();
  if (insertError) {
    await service.auth.admin.deleteUser(created.user.id);
    diagnose("profile creation failed", { email, code: insertError.code, message: insertError.message });
    return failure("Unable to create application profile; authentication account was removed.", 500);
  }
  diagnose("user created", { email, authUserId: created.user.id, role, status });
  return NextResponse.json({ user: { ...profile, last_login: null } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { context } = checked;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return failure("User ID is required.", 422);
  const { data: target, error } = await context.service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .eq("id", id).is("deleted_at", null).maybeSingle<UserProfile>();
  if (error || !target) return failure("User not found.", 404);
  if (target.id === context.profile.id) return failure("You cannot delete your own account.", 409);
  if (target.role === "admin" && target.status === "active") {
    const { count, error: countError } = await context.service.from("user_profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active").is("deleted_at", null);
    if (countError) return failure("Unable to verify active administrators.", 500);
    if ((count || 0) <= 1) return failure("The final active administrator cannot be deleted.", 409);
  }

  const deletedAt = new Date().toISOString();
  const { error: softDeleteError } = await context.service.from("user_profiles").update({ status: "inactive", deleted_at: deletedAt, auth_user_id: null }).eq("id", target.id);
  if (softDeleteError) return failure("Unable to deactivate user.", 500);
  if (target.auth_user_id) {
    const { error: authDeleteError } = await context.service.auth.admin.deleteUser(target.auth_user_id);
    if (authDeleteError) {
      await context.service.from("user_profiles").update({ status: target.status, deleted_at: null, auth_user_id: target.auth_user_id }).eq("id", target.id);
      return failure("Unable to remove authentication account; profile was restored.", 500);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const id = typeof body?.id === "string" ? body.id : "";

  if (action === "edit") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    const role = body?.role as Role;
    const status = body?.status;
    if (!id || !name || !/^\S+@\S+\.\S+$/.test(email) || !ROLES.includes(role) || !["active", "inactive"].includes(String(status))) return failure("Enter a name, valid email, role, and status.", 422);

    const { service, profile: requester } = checked.context;
    const { data: target, error } = await service
      .from("user_profiles")
      .select("id, auth_user_id, name, email, role, status, deleted_at")
      .eq("id", id).is("deleted_at", null).maybeSingle();
    if (error || !target) return failure("User not found.", 404);
    if (target.id === requester.id && (role !== "admin" || status !== "active")) return failure("You cannot remove your own active administrator access.", 409);

    const { data: sameEmailProfile, error: emailLookupError } = await service.from("user_profiles").select("id").eq("email", email).maybeSingle();
    if (emailLookupError) return failure("Unable to validate email.", 500);
    if (sameEmailProfile && sameEmailProfile.id !== target.id) return failure("This email is already reserved by an application profile.", 409);
    const existingAuth = await findAuthUserByEmail(service, email);
    if ("error" in existingAuth) return failure("Unable to validate email.", 500);
    if (existingAuth.found && email !== target.email) return failure("This email already has an authentication account.", 409);

    if (!target.auth_user_id) return failure("This user has no authentication account.", 409);
    const { error: authUpdateError } = await service.auth.admin.updateUserById(target.auth_user_id, { email, email_confirm: true, user_metadata: { name } });
    if (authUpdateError) {
      diagnose("account update failed", { email, code: authUpdateError.code, message: authUpdateError.message });
      return failure("Unable to update authentication account.", 500);
    }
    const { data: updatedProfile, error: profileUpdateError } = await service
      .from("user_profiles")
      .update({ name, email, role, status })
      .eq("id", target.id)
      .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
      .single<UserProfile>();
    if (profileUpdateError) {
      await service.auth.admin.updateUserById(target.auth_user_id, { email: target.email, email_confirm: true, user_metadata: { name: target.name } });
      diagnose("profile update failed", { email, code: profileUpdateError.code, message: profileUpdateError.message });
      return failure("Unable to update application profile; authentication account was restored.", 500);
    }
    diagnose("account updated", { email, authUserId: target.auth_user_id, role, status });
    return NextResponse.json({ user: { ...updatedProfile, last_login: null } });
  }

  const password = typeof body?.password === "string" ? body.password : "";
  if (!id || password.length < 8) return failure("Enter a password of at least 8 characters.", 422);

  const { service } = checked.context;
  const { data: target, error } = await service
    .from("user_profiles")
    .select("id, auth_user_id, email, status, deleted_at")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (error || !target) return failure("User not found.", 404);
  if (!target.auth_user_id || target.status !== "active") return failure("Only active users with an authentication account can reset a password.", 409);

  const { data: updated, error: updateError } = await service.auth.admin.updateUserById(target.auth_user_id, { password, email_confirm: true });
  if (updateError || !updated.user?.email_confirmed_at) {
    diagnose("password reset failed", { email: target.email, code: updateError?.code, message: updateError?.message });
    return failure("Unable to reset this password.", 500);
  }
  diagnose("password reset", { email: target.email, authUserId: target.auth_user_id });
  return NextResponse.json({ ok: true });
}
