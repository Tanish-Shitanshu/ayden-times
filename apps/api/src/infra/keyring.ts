/**
 * A small ring of Gemini API keys. The primary key is used while it is healthy; when a call fails with a
 * quota or auth error the failing key is parked for a while and the next healthy key takes over.
 * Keys never leave this module except through current(); they are never logged.
 */
export type KeyFailure = "quota" | "auth";

interface Slot {
  label: string;
  key: string;
  badUntil: number;
}

const QUOTA_COOLDOWN_MS = 90_000;
const AUTH_COOLDOWN_MS = 3_600_000;

export class KeyRing {
  private slots: Slot[] = [];

  constructor(keys: string[], private now: () => number = Date.now) {
    const seen = new Set<string>();
    keys
      .map((k) => (k ?? "").trim())
      .filter(Boolean)
      .forEach((k, i) => {
        if (seen.has(k)) return;
        seen.add(k);
        this.slots.push({ label: i === 0 ? "primary" : `backup ${i}`, key: k, badUntil: 0 });
      });
  }

  get size(): number {
    return this.slots.length;
  }

  /** The key to use right now: the first healthy one, or the one that recovers soonest. */
  current(): string {
    if (!this.slots.length) return "";
    const t = this.now();
    const healthy = this.slots.find((s) => s.badUntil <= t);
    if (healthy) return healthy.key;
    return this.slots.reduce((a, b) => (a.badUntil <= b.badUntil ? a : b)).key;
  }

  label(key: string): string {
    return this.slots.find((s) => s.key === key)?.label ?? "unknown";
  }

  /** Park a failing key. Returns true when another healthy key is available to retry with right away. */
  report(key: string, kind: KeyFailure): boolean {
    const slot = this.slots.find((s) => s.key === key);
    if (!slot) return false;
    slot.badUntil = this.now() + (kind === "quota" ? QUOTA_COOLDOWN_MS : AUTH_COOLDOWN_MS);
    const t = this.now();
    return this.slots.some((s) => s.key !== key && s.badUntil <= t);
  }
}

export function keysFromEnv(env: NodeJS.ProcessEnv): string[] {
  return [env.GEMINI_API_KEY, env.GEMINI_API_KEY_BACKUP, env.GEMINI_API_KEY_BACKUP_2].filter((k): k is string => !!k && k.trim().length > 0);
}

/** Classify a Gemini error message as a key-level problem (quota or auth), or null when a different key would not help. */
export function classifyKeyFailure(message: string): KeyFailure | null {
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) return "quota";
  if (/\b40[123]\b|PERMISSION_DENIED|UNAUTHENTICATED|API key not valid|API_KEY_INVALID|prepayment|credits/i.test(message)) return "auth";
  return null;
}

export const keyring = new KeyRing(keysFromEnv(process.env));
