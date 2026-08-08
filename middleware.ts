import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROLES, roleHomePath } from "@/lib/roles";

const OPERATIONAL = ["/upload", "/review", "/analytics", "/settings", "/result", "/log", "/model-test"];
const DEVELOPMENT = "/development";
const OVERVIEW = "/overview";
const ROLE_COOKIE = "purityloop_role";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/assets") || pathname.startsWith("/css") || pathname.startsWith("/js") || pathname.includes(".")) return NextResponse.next();

  const isAdminApi = pathname.startsWith("/api/admin/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isModelReviewApi = pathname.startsWith("/api/model-review/");
  const isDevelopmentPage = pathname === DEVELOPMENT || pathname.startsWith(`${DEVELOPMENT}/`);
  const isOverviewPage = pathname === OVERVIEW || pathname.startsWith(`${OVERVIEW}/`);
  const isOperational = OPERATIONAL.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isHomePage = pathname === "/";
  const isLoginPage = pathname === "/login";
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    if (isAdminApi || isModelReviewApi) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    return isAdminPage || isOperational || isDevelopmentPage || isOverviewPage ? redirect(request, "/login", response) : response;
  }
  const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) => {
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, path: "/", maxAge: SESSION_MAX_AGE })
        );
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isAdminApi || isModelReviewApi) return response;
    if (isAdminPage || isOperational || isDevelopmentPage || isOverviewPage) return redirect(request, "/login", response);
    return response;
  }

  const profileResponse = await fetch(`${url}/rest/v1/user_profiles?select=role,status,deleted_at&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store"
  });
  const profiles = profileResponse.ok ? await profileResponse.json() as { role: string; status: string; deleted_at: string | null }[] : [];
  const profile = profiles[0];
  if (!profile || profile.status !== "active" || profile.deleted_at) {
    await supabase.auth.signOut();
    response.cookies.delete(ROLE_COOKIE);
    if (isAdminApi || isModelReviewApi) return response;
    return redirect(request, "/login?reason=inactive", response);
  }
  if (!ROLES.includes(profile.role as (typeof ROLES)[number])) {
    await supabase.auth.signOut();
    response.cookies.delete(ROLE_COOKIE);
    if (isAdminApi || isModelReviewApi) return response;
    return redirect(request, "/login?error=role", response);
  }
  response.cookies.set(ROLE_COOKIE, profile.role, {
    path: "/",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE
  });
  if (isHomePage) return response;
  if (profile.role === "plant_manager") {
    if (isLoginPage) return redirect(request, roleHomePath(profile.role), response);
    return response;
  }
  if (profile.role === "admin") {
    if (isAdminApi || isAdminPage) return response;
    return redirect(request, roleHomePath(profile.role), response);
  }
  if (profile.role === "development_team") {
    if (isDevelopmentPage || isModelReviewApi) return response;
    return redirect(request, roleHomePath(profile.role), response);
  }
  if (isAdminApi || isModelReviewApi) return response;
  if (isAdminPage || isDevelopmentPage || isOverviewPage) return redirect(request, "/upload", response);
  if (isLoginPage) return redirect(request, "/upload", response);
  return response;
}

function redirect(request: NextRequest, path: string, source: NextResponse) {
  const response = NextResponse.redirect(new URL(path, request.url));
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = { matcher: ["/((?!api/auth|auth/signout).*)"] };
