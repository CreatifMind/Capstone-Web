export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === "true";

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
