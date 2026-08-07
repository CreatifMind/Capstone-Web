import { existsSync, readFileSync } from "node:fs";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync("backend/.env")) {
  const serviceRole = readFileSync("backend/.env", "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
  if (serviceRole) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole;
}

const frameAncestors = process.env.ALLOW_PRESENTATION_EMBED === "true"
  ? "https:"
  : "'self' https://*.canva.com https://canva.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`
          }
        ]
      }
    ];
  }
};

export default nextConfig;
