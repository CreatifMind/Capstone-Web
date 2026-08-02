import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/lib/admin";

export async function GET() {
  let sessionClient: ReturnType<typeof createSupabaseServerClient>;
  let service: ReturnType<typeof createSupabaseServiceClient>;

  try {
    sessionClient = createSupabaseServerClient();
    service = createSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<UserProfile>();

  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Active profile required." }, { status: 403 });
  }

  return NextResponse.json({
    profile: {
      name: profile.name,
      email: profile.email,
      role: profile.role
    }
  });
}
