import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { roleHomePath } from "@/lib/roles";

const PUBLIC = new Set(["/", "/login"]);
const OPERATIONAL = ["/upload", "/review", "/analytics", "/settings", "/result", "/log", "/model-test"];
const MODEL_REVIEW = "/model-improvement";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/assets") || pathname.startsWith("/css") || pathname.startsWith("/js") || pathname.includes(".")) return NextResponse.next();

  const isAdminApi = pathname.startsWith("/api/admin/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isOperational = OPERATIONAL.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isModelReview = pathname === MODEL_REVIEW || pathname.startsWith(`${MODEL_REVIEW}/`);
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    if (isAdminApi) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    return isAdminPage || isOperational || isModelReview ? redirect(request, "/login", response) : response;
  }
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) => { items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isAdminApi) return response;
    if (isAdminPage || isOperational || isModelReview) return redirect(request, "/login", response);
    return response;
  }

  const profileResponse = await fetch(`${url}/rest/v1/user_profiles?select=role,status,deleted_at&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store"
  });
  const profiles = profileResponse.ok ? await profileResponse.json() as { role: string; status: string; deleted_at: string | null }[] : [];
  const profile = profiles[0];
  if (!profile || profile.status !== "active" || profile.deleted_at) {
    await supabase.auth.signOut();
    if (isAdminApi) return response;
    return redirect(request, "/login?reason=inactive", response);
  }
  if (profile.role === "admin") {
    if (isAdminApi || isAdminPage) return response;
    return redirect(request, roleHomePath(profile.role), response);
  }
  if (profile.role === "model_team") {
    if (isModelReview) return response;
    if (isAdminApi) return response;
    return redirect(request, roleHomePath(profile.role), response);
  }
  if (isAdminApi) return response;
  if (isAdminPage) return redirect(request, "/upload", response);
  if (isModelReview) return redirect(request, "/upload", response);
  if (PUBLIC.has(pathname)) return redirect(request, "/upload", response);
  return response;
}

function redirect(request: NextRequest, path: string, source: NextResponse) {
  const response = NextResponse.redirect(new URL(path, request.url));
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = { matcher: ["/((?!api/auth|auth/signout).*)"] };
