import { type UserProfile } from "@/lib/admin";
import { adminContext, ensureEmailAvailable, fail, listAuthLogins, ok, parseCreate, userListContext } from "./_shared";

export async function GET() {
  const checked = await userListContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: profiles, error } = await service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return fail("USER_LIST_FAILED", "Unable to load users.", 500);

  const auth = await listAuthLogins(service);
  if ("error" in auth) return fail("AUTH_METADATA_FAILED", "Unable to load authentication metadata.", 500);
  const users = (profiles as UserProfile[]).map((profile) => ({
    ...profile,
    last_login: profile.auth_user_id ? auth.logins.get(profile.auth_user_id) || null : null
  }));
  return ok({ users });
}

export async function POST(request: Request) {
  const checked = await adminContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = parseCreate(body);
  if ("error" in parsed) return fail("INVALID_USER_INPUT", parsed.error, 400);
  const { name, email, password, role, status } = parsed.value;

  const emailCheck = await ensureEmailAvailable(service, email);
  if ("response" in emailCheck) return emailCheck.response;

  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (createError || !created.user) return fail("AUTH_CREATE_FAILED", "Unable to create authentication account.", 500);

  const { data: profile, error: insertError } = await service
    .from("user_profiles")
    .insert({ auth_user_id: created.user.id, name, email, role, status })
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .single<UserProfile>();
  if (insertError) {
    await service.auth.admin.deleteUser(created.user.id);
    return fail("PROFILE_CREATE_FAILED", "Unable to create application profile; authentication account was removed.", 500);
  }

  return ok({ user: { ...profile, last_login: null } }, 201);
}
