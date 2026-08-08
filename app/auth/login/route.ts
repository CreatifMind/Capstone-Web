import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { ROLES, normalizeEmail, roleHomePath } from "@/lib/admin";

type AuthCookie = { name: string; value: string; options: CookieOptions };
const ROLE_COOKIE = "purityloop_role";

const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours

function redirectWithCookies(path: string, request: Request, cookies: AuthCookie[], role?: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  cookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, { ...options, path: "/", maxAge: SESSION_MAX_AGE })
  );
  if (role) {
    response.cookies.set(ROLE_COOKIE, role, {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE
    });
  }
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") || ""));
  const password = String(form.get("password") || "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const diagnose = (event: string, detail: Record<string, unknown> = {}) => {
    if (process.env.NODE_ENV !== "production") console.info("[auth/login]", event, detail);
  };
  if (!url || !anonKey) return NextResponse.redirect(new URL("/login?error=config", request.url), 303);

  let authCookies: AuthCookie[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (items: AuthCookie[]) => { authCookies = items; }
    }
  });
  let authResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    authResult = await supabase.auth.signInWithPassword({ email, password });
  } catch (error) {
    console.error("[auth/login] auth request failed", error instanceof Error ? error.message : error);
    return redirectWithCookies("/login?error=server", request, authCookies);
  }
  const { data, error } = authResult;
  if (error || !data.user) {
    diagnose("auth rejected", { code: error?.code, message: error?.message });
    return redirectWithCookies("/login?error=credentials", request, authCookies);
  }
  diagnose("auth succeeded", { userId: data.user.id });

  let profile: { role: string; status: string; deleted_at: string | null } | null = null;
  let profileError: { code?: string; message: string } | null = null;
  try {
    const result = await supabase.from("user_profiles").select("role, status, deleted_at").eq("auth_user_id", data.user.id).maybeSingle();
    profile = result.data;
    profileError = result.error;
  } catch (error) {
    console.error("[auth/login] profile lookup threw", error instanceof Error ? error.message : error);
    return redirectWithCookies("/login?error=database", request, authCookies);
  }
  if (profileError) {
    console.error("[auth/login] profile lookup failed", { code: profileError.code, message: profileError.message });
    return redirectWithCookies("/login?error=database", request, authCookies);
  }
  if (!profile) {
    diagnose("profile missing", { userId: data.user.id });
    return redirectWithCookies("/login?error=profile", request, authCookies);
  }
  diagnose("profile found", { role: profile.role, status: profile.status, deletedAt: Boolean(profile.deleted_at) });
  if (profile.status !== "active" || profile.deleted_at) {
    await supabase.auth.signOut();
    return redirectWithCookies("/login?reason=inactive", request, authCookies);
  }
  if (!ROLES.includes(profile.role as (typeof ROLES)[number])) return redirectWithCookies("/login?error=role", request, authCookies);
  return redirectWithCookies(roleHomePath(profile.role), request, authCookies, profile.role);
}
