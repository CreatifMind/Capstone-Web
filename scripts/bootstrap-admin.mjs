import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
const name = (process.env.BOOTSTRAP_ADMIN_NAME || "").trim();
if (!url || !key || !email || !name || password.length < 8) {
  throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (8+ characters), and BOOTSTRAP_ADMIN_NAME.");
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { count, error: countError } = await supabase.from("user_profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active").is("deleted_at", null);
if (countError) throw countError;
if (count) throw new Error("Bootstrap refused: an active administrator already exists.");
const { data: existing, error: existingError } = await supabase.from("user_profiles").select("id").eq("email", email).maybeSingle();
if (existingError) throw existingError;
if (existing) throw new Error("Bootstrap refused: this email is already reserved by a profile.");

const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (createError || !created.user) throw createError || new Error("Unable to create Auth user.");
const { error: profileError } = await supabase.from("user_profiles").insert({ auth_user_id: created.user.id, name, email, role: "admin", status: "active" });
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  throw new Error("Profile creation failed; created Auth user was removed.");
}
console.log(`Bootstrap administrator created for ${email}.`);
