import { existsSync, readFileSync } from "node:fs";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync("backend/.env")) {
  const serviceRole = readFileSync("backend/.env", "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
  if (serviceRole) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
