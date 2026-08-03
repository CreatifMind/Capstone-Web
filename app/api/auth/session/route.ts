import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function sessionResponse(body: Record<string, string>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return sessionResponse({ error: "unauthenticated" }, 401);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return sessionResponse({ error: "unauthenticated" }, 401);
  }

  return sessionResponse({ accessToken: sessionData.session.access_token }, 200);
}
