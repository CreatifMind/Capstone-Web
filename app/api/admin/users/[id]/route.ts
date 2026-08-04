import { type UserProfile } from "@/lib/admin";
import { adminContext, ensureEmailAvailable, ensureNotFinalActiveAdmin, fail, ok, parseUpdate, profileById, withLastLogin } from "../_shared";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: target, error } = await profileById(service, params.id);
  if (error) return fail("USER_READ_FAILED", "Unable to load user.", 500);
  if (!target) return fail("USER_NOT_FOUND", "User not found.", 404);
  return ok({ user: await withLastLogin(service, target) });
}

export async function PATCH(request: Request, { params }: Params) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service, profile: requester } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = parseUpdate(body);
  if ("error" in parsed) return fail("INVALID_USER_INPUT", parsed.error, 400);
  const { name, email, role, status, password } = parsed.value;

  const { data: target, error } = await profileById(service, params.id);
  if (error) return fail("USER_READ_FAILED", "Unable to load user.", 500);
  if (!target) return fail("USER_NOT_FOUND", "User not found.", 404);
  if (!target.auth_user_id) return fail("MISSING_AUTH_ACCOUNT", "This user has no authentication account.", 409);
  if (target.id === requester.id && (role !== "admin" || status !== "active")) return fail("SELF_ADMIN_REMOVAL", "You cannot remove your own active administrator access.", 409);

  const finalAdmin = await ensureNotFinalActiveAdmin(service, target, { role, status } as UserProfile);
  if ("response" in finalAdmin) return finalAdmin.response;
  const emailCheck = await ensureEmailAvailable(service, email, target.id, target.auth_user_id);
  if ("response" in emailCheck) return emailCheck.response;

  const authUpdates: { email?: string; email_confirm?: boolean; password?: string; user_metadata?: { name: string } } = {};
  if (email !== target.email) {
    authUpdates.email = email;
    authUpdates.email_confirm = true;
  }
  if (name !== target.name) authUpdates.user_metadata = { name };
  if (password) {
    authUpdates.password = password;
    authUpdates.email_confirm = true;
  }
  if (Object.keys(authUpdates).length) {
    const { error: authUpdateError } = await service.auth.admin.updateUserById(target.auth_user_id, authUpdates);
    if (authUpdateError) return fail("AUTH_UPDATE_FAILED", "Unable to update authentication account.", 500);
  }

  const profileUpdates: Partial<Pick<UserProfile, "name" | "email" | "role" | "status">> = {};
  if (name !== target.name) profileUpdates.name = name;
  if (email !== target.email) profileUpdates.email = email;
  if (role !== target.role) profileUpdates.role = role;
  if (status !== target.status) profileUpdates.status = status;

  let updatedProfile = target;
  if (Object.keys(profileUpdates).length) {
    const { data, error: profileUpdateError } = await service
      .from("user_profiles")
      .update(profileUpdates)
      .eq("id", target.id)
      .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
      .single<UserProfile>();
    if (profileUpdateError) {
      await service.auth.admin.updateUserById(target.auth_user_id, { email: target.email, email_confirm: true, user_metadata: { name: target.name } });
      return fail("PROFILE_UPDATE_FAILED", "Unable to update application profile; authentication account was restored where possible.", 500);
    }
    updatedProfile = data;
  }

  return ok({ user: await withLastLogin(service, updatedProfile) });
}

export async function DELETE(request: Request, { params }: Params) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service, profile: requester } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const confirmationEmail = typeof body?.confirmationEmail === "string" ? body.confirmationEmail.trim().toLowerCase() : "";

  const { data: target, error } = await profileById(service, params.id);
  if (error) return fail("USER_READ_FAILED", "Unable to load user.", 500);
  if (!target) return fail("USER_NOT_FOUND", "User not found.", 404);
  if (target.id === requester.id) return fail("SELF_DELETE", "You cannot delete your own account.", 409);
  if (confirmationEmail !== target.email) return fail("DELETE_CONFIRMATION_MISMATCH", "Type this user's email address to confirm deletion.", 400);

  const finalAdmin = await ensureNotFinalActiveAdmin(service, target);
  if ("response" in finalAdmin) return finalAdmin.response;

  if (target.auth_user_id) {
    const { error: authDeleteError } = await service.auth.admin.deleteUser(target.auth_user_id);
    if (authDeleteError) return fail("AUTH_DELETE_FAILED", "Unable to remove authentication account.", 500);
  }
  const { error: profileDeleteError } = await service.from("user_profiles").delete().eq("id", target.id);
  if (profileDeleteError) return fail("PROFILE_DELETE_FAILED", "Authentication account was removed, but the profile row could not be deleted. Manual cleanup is required.", 500);

  return ok({ deleted: true });
}
