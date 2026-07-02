export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export function safeObject<T extends object>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as T)
    : fallback;
}

export function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function safeId(prefix = "id") {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return safeArray<string | false | null | undefined>(classes).filter(Boolean).join(" ");
}

export function formatPercent(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${numeric.toFixed(numeric % 1 === 0 ? 0 : 1)}%`;
}
