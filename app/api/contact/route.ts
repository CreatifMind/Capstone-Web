import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONTACT_WEBHOOK_URL = process.env.CONTACT_WEBHOOK_URL;
const MAX_LENGTHS = {
  name: 100,
  email: 254,
  subject: 160,
  message: 2000,
} as const;

type ContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
};

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parsePayload(body: Record<string, unknown> | null): ContactPayload | { error: string; message: string } {
  const payload = {
    name: clean(body?.name),
    email: clean(body?.email),
    subject: clean(body?.subject),
    message: clean(body?.message),
    website: clean(body?.website),
  };

  if (payload.website) return { error: "CONTACT_SPAM_REJECTED", message: "Unable to send this message." };
  if (!payload.name || !payload.email || !payload.subject || !payload.message) {
    return { error: "CONTACT_REQUIRED_FIELDS", message: "Name, email, subject, and message are required." };
  }
  if (!isEmail(payload.email)) return { error: "CONTACT_INVALID_EMAIL", message: "A valid email address is required." };
  const tooLong = (Object.keys(MAX_LENGTHS) as Array<keyof typeof MAX_LENGTHS>).find((key) => payload[key].length > MAX_LENGTHS[key]);
  if (tooLong) return { error: "CONTACT_FIELD_TOO_LONG", message: `${tooLong} is too long.` };
  return payload;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = parsePayload(body);
  if ("error" in parsed) return fail(parsed.error, parsed.message, 400);
  if (!CONTACT_WEBHOOK_URL) return fail("CONTACT_WEBHOOK_NOT_CONFIGURED", "Contact service is not configured.", 503);

  try {
    const response = await fetch(CONTACT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: parsed.name,
        email: parsed.email,
        subject: parsed.subject,
        message: parsed.message,
        source: "purityloop-ai-landing",
        submitted_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) return fail("CONTACT_WEBHOOK_FAILED", "Contact service rejected the message.", 502);
    return NextResponse.json({ ok: true });
  } catch {
    return fail("CONTACT_WEBHOOK_FAILED", "Contact service is temporarily unavailable.", 502);
  }
}
