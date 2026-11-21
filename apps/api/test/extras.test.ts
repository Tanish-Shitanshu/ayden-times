import { describe, expect, it } from "vitest";
import type { MissionState, SystemStatus } from "@ayden/contract";
import { pcmToWav, plainText } from "../src/infra/google-extras.js";
import { setup } from "./helpers.js";

describe("google extras (switched off in tests)", () => {
  it("wraps raw PCM in a valid WAV header", () => {
    const wav = pcmToWav(Buffer.alloc(480), 24000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.length).toBe(44 + 480);
  });

  it("strips markdown before speech and translation", () => {
    expect(plainText("**Hi** `code` ```x``` there")).toBe("Hi code there");
  });

  it("badge art is 404 when generation is off or the badge does not exist", async () => {
    const { app } = await setup();
    const known = await app.inject({ method: "GET", url: "/api/v1/badges/software-engineer/verify_before_ship/art" });
    expect(known.statusCode).toBe(404);
    const bogus = await app.inject({ method: "GET", url: "/api/v1/badges/software-engineer/nope/art" });
    expect(bogus.statusCode).toBe(404);
  });

  it("status reports the optional features as off and never claims them live", async () => {
    const { client } = await setup();
    const s = (await client().call("GET", "/system/status")).body as SystemStatus;
    expect(s.features).toEqual({ badgeArt: false, translate: false, speech: false });
    for (const n of ["Vertex AI image generation", "Cloud Translation", "Gemini speech", "Cloud Monitoring"]) {
      expect(s.googleServices.find((g) => g.name === n)?.state).toBe("planned");
    }
  });

  it("translate and speech need a real colleague message the learner owns", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    const m = (await c.call("POST", "/missions", { roleId: "software-engineer", mode: "quick" })).body as MissionState;
    const evs = (await c.call("GET", `/missions/${m.id}/events?since=0`)).body.events as { seq: number; from: string }[];
    const colleague = evs.find((e) => e.from !== "system" && e.from !== "you")!;
    // switched off: 503, not a crash
    expect((await c.call("POST", `/missions/${m.id}/translate`, { seq: colleague.seq, lang: "hi" })).status).toBe(503);
    expect((await c.call("POST", `/missions/${m.id}/speech`, { seq: colleague.seq })).status).toBe(503);
    // not a message from a colleague
    expect((await c.call("POST", `/missions/${m.id}/translate`, { seq: 9999 })).status).toBe(404);
    // someone else's mission
    const other = client();
    await other.enroll("software-engineer", {});
    expect((await other.call("POST", `/missions/${m.id}/translate`, { seq: colleague.seq })).status).toBeGreaterThanOrEqual(400);
  });

  it("interface translation only accepts supported Indian languages and is off without Cloud Translation", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    expect((await c.call("POST", "/i18n/translate", { lang: "ta", strings: { a: "Hello {n}" } })).status).toBe(503);
    expect((await c.call("POST", "/i18n/translate", { lang: "xx", strings: { a: "Hello" } })).status).toBe(400);
    expect((await c.call("PATCH", "/me", { language: "ta" })).status).toBe(200);
    expect((await c.call("GET", "/me")).body.language).toBe("ta");
  });
});
