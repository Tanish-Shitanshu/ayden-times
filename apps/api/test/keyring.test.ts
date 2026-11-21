import { describe, expect, it } from "vitest";
import { KeyRing, classifyKeyFailure, keysFromEnv } from "../src/infra/keyring.js";

describe("KeyRing", () => {
  it("uses the primary while it is healthy and ignores blanks and duplicates", () => {
    const r = new KeyRing(["a", "", "a", "b"]);
    expect(r.size).toBe(2);
    expect(r.current()).toBe("a");
  });

  it("switches to the backup when the primary hits its quota, then returns after the cooldown", () => {
    let t = 1000;
    const r = new KeyRing(["primary", "backup"], () => t);
    expect(r.report("primary", "quota")).toBe(true);
    expect(r.current()).toBe("backup");
    t += 91_000;
    expect(r.current()).toBe("primary");
  });

  it("keeps a key with an auth failure parked for an hour", () => {
    let t = 0;
    const r = new KeyRing(["primary", "backup"], () => t);
    r.report("primary", "auth");
    t += 600_000;
    expect(r.current()).toBe("backup");
    t += 3_100_000;
    expect(r.current()).toBe("primary");
  });

  it("reports no alternative when every key is parked, and still returns the soonest to recover", () => {
    let t = 0;
    const r = new KeyRing(["a", "b"], () => t);
    r.report("a", "auth");
    expect(r.report("b", "quota")).toBe(false);
    expect(r.current()).toBe("b");
  });

  it("does nothing special with a single key", () => {
    const r = new KeyRing(["only"]);
    expect(r.report("only", "quota")).toBe(false);
    expect(r.current()).toBe("only");
  });
});

describe("env and error classification", () => {
  it("reads the primary and both backups in order", () => {
    expect(keysFromEnv({ GEMINI_API_KEY: "p", GEMINI_API_KEY_BACKUP: "b1", GEMINI_API_KEY_BACKUP_2: "b2" } as NodeJS.ProcessEnv)).toEqual(["p", "b1", "b2"]);
    expect(keysFromEnv({ GEMINI_API_KEY: "p", GEMINI_API_KEY_BACKUP: "  " } as NodeJS.ProcessEnv)).toEqual(["p"]);
  });
  it("tells quota, auth and unrelated errors apart", () => {
    expect(classifyKeyFailure("429 RESOURCE_EXHAUSTED quota exceeded")).toBe("quota");
    expect(classifyKeyFailure("402 prepayment credits are depleted")).toBe("auth");
    expect(classifyKeyFailure("API key not valid. Please pass a valid API key.")).toBe("auth");
    expect(classifyKeyFailure("503 UNAVAILABLE high demand")).toBeNull();
    expect(classifyKeyFailure("exec timed out after 25000 ms")).toBeNull();
  });
});
