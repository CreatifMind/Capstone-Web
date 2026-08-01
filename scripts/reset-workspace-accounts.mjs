import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const accounts = [
  { name: "Operator", email: "operator@gmail.com", password: "qwerty12345", role: "operator" },
  { name: "Development Team", email: "dev@gmail.com", password: "qwerty12345", role: "development_team" },
  { name: "Admin", email: "admin@gmail.com", password: "qwerty12345", role: "admin" },
  { name: "Plant Manager", email: "manager@gmail.com", password: "qwerty12345", role: "plant_manager" },
];

if (!url || !anonKey || !serviceKey) {
  throw new Error("Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function resetProfiles() {
  const { error } = await admin.from("user_profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

async function resetAuthUsers() {
  const users = await listAllAuthUsers();
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}

async function createAccount(account) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { name: account.name },
  });
  if (createError || !created.user) throw createError || new Error(`Unable to create Auth user for ${account.email}.`);

  const { error: profileError } = await admin.from("user_profiles").insert({
    auth_user_id: created.user.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: "active",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }
}

async function verifyLogin(account) {
  const { data, error } = await anon.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error || !data.user) throw error || new Error(`Login failed for ${account.email}.`);
  await anon.auth.signOut();
}

async function verifyFinalState() {
  const users = await listAllAuthUsers();
  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("auth_user_id, name, email, role, status, deleted_at")
    .order("email", { ascending: true });
  if (error) throw error;
  if (users.length !== accounts.length) throw new Error(`Expected ${accounts.length} Auth users, found ${users.length}.`);
  if ((profiles || []).length !== accounts.length) throw new Error(`Expected ${accounts.length} profiles, found ${(profiles || []).length}.`);

  const authEmails = new Set(users.map((user) => (user.email || "").toLowerCase()));
  for (const account of accounts) {
    const profile = (profiles || []).find((row) => row.email === account.email);
    if (!authEmails.has(account.email)) throw new Error(`Missing Auth user ${account.email}.`);
    if (!profile) throw new Error(`Missing profile ${account.email}.`);
    if (profile.name !== account.name || profile.role !== account.role || profile.status !== "active" || profile.deleted_at) {
      throw new Error(`Profile mismatch for ${account.email}.`);
    }
    if (!users.some((user) => user.id === profile.auth_user_id)) throw new Error(`Profile is not linked to Auth user for ${account.email}.`);
    await verifyLogin(account);
  }
}

console.log("Deleting all existing user_profiles rows...");
await resetProfiles();
console.log("Deleting all existing Supabase Auth users...");
await resetAuthUsers();
console.log("Creating four workspace accounts...");
for (const account of accounts) await createAccount(account);
console.log("Verifying Auth users, profiles, linkage, and password login...");
await verifyFinalState();
console.log("Workspace account reset complete. Exactly four active linked accounts exist.");
