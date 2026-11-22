import { describe, expect, it } from "vitest";
import { certificateIdOf, cleanName, newShareToken, reportIdOfToken } from "../src/domain/share.js";
import { setup } from "./helpers.js";

describe("share helpers", () => {
  it("accepts plain personal names and rejects everything else", () => {
    expect(cleanName("  Sai   Mohit Kotta ")).toBe("Sai Mohit Kotta");
    expect(cleanName("Anika D'Souza-Rao")).toBe("Anika D'Souza-Rao");
    expect(cleanName("प्रिया शर्मा")).toBe("प्रिया शर्मा");
    for (const bad of ["", "A", "<script>", "http://x.com", "Name 123", "a".repeat(80)]) expect(cleanName(bad), bad).toBeNull();
  });
  it("round-trips the report id and makes a readable certificate id", () => {
    const t = newShareToken("rep_abc123");
    expect(reportIdOfToken(t)).toBe("rep_abc123");
    expect(certificateIdOf(t)).toMatch(/^AYD-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});

describe("share endpoints", () => {
  /** Plays the Startup CEO mission through the API (scripted mode) and returns the finished report id. */
  async function finished() {
    const { client } = await setup();
    const c = client();
    await c.enroll("executive", {});
    const m = (await c.call("POST", "/missions", { roleId: "executive", mode: "quick" })).body;
    let seq = 0;
    const act = async (b: Record<string, unknown>) => {
      const r = await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    };
    const say = (to: string, text: string) => act({ kind: "message", to, channel: "chat", text });
    const rows = (m.items.find((i: { id: string }) => i.id === "it_finance").rows as (string | number)[][]).map((r) => Number(r[1]));
    const [cash, , burn, each, share] = rows as [number, number, number, number, number];
    const r1 = (n: number) => Math.round(n * 10) / 10;
    await act({ kind: "open_item", itemId: "it_finance" });
    await say("anika", "What is our runway and burn, what does hiring three do to it, and what if our biggest customer leaves?");
    await act({ kind: "advance" });
    await act({ kind: "submit_artifact", artifactId: "ar_decision", content: `Decision: hire request.\nOptions:\n1. All three now: runway ${r1(cash / burn)} to ${r1(cash / (burn + each * 3))} months, lower if the biggest customer (${share}%) leaves.\n2. One now, two after a signed term sheet: ${r1(cash / (burn + each))} months.\nCriteria: runway above 6 months, growth speed, concentration risk.\nRecommendation: I recommend option 2.\nWhat would change my mind: a signed term sheet.\nReversibility: staged hiring is easy to reverse.` });
    await act({ kind: "advance" });
    await say("neel", "Thank you for telling me straight away. Not your fault, we will run a blameless review.");
    await act({ kind: "submit_artifact", artifactId: "ar_notice", content: "To: Affected customers\nSubject: A security issue\n\nWhat happened: a report link was open for a few hours.\nWhat data: company names and payroll summaries.\nWhat we did: we closed the link and are reading the logs.\nWhat you should do: contact us if you see anything unusual." });
    await act({ kind: "advance" });
    await say("rohit", "I won't hide it. The board needs to know today.");
    await say("sana", "I can't promise Friday until Engineering confirms. Let me check with Neel first.");
    await say("neel", "Please don't resign. Thank you for flagging it. Let's run a blameless review and fix the process.");
    await act({ kind: "advance" });
    await act({ kind: "submit_artifact", artifactId: "ar_update", content: `To: Board\n\nRunway is ${r1(cash / burn)} months and I am hiring one engineer now (${r1(cash / (burn + each))} months). A security incident exposed some customer data for a few hours; we closed it and are telling every affected customer. I have not promised the biggest customer a date until Engineering confirms. Next step: Anika shares the revised plan by Friday.` });
    const f = await c.call("POST", `/missions/${m.id}/finish`, {});
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    return { client, c, reportId: f.body.reportId as string };
  }

  it("shares only after the learner opts in, shows only what is meant to be shown, and can be switched off", async () => {
    const { client, c, reportId } = await finished();
    const anon = client();
    const first = await c.call("GET", `/reports/${reportId}/share`); expect(first.status, JSON.stringify([reportId, first.body])).toBe(200); expect(first.body.shared).toBe(false);

    const bad = await c.call("POST", `/reports/${reportId}/share`, { name: "<b>x</b>" });
    expect(bad.status).toBe(400);

    const made = await c.call("POST", `/reports/${reportId}/share`, { name: "Asha Rao" });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const token = made.body.sample.token as string;

    const pub = await anon.call("GET", `/share/${encodeURIComponent(token)}`);
    expect(pub.status).toBe(200);
    expect(pub.body.name).toBe("Asha Rao");
    expect(pub.body.certificateId).toMatch(/^AYD-/);
    const text = JSON.stringify(pub.body);
    for (const leak of ["uid", "missedFact", "skillRatios", "variantKey", "transcript"]) expect(text).not.toContain(leak);
    expect(pub.body.skills.every((s: { state: string }) => s.state === "strong" || s.state === "developing")).toBe(true);

    // the same link stays stable if the name is corrected
    const again = await c.call("POST", `/reports/${reportId}/share`, { name: "Asha R. Rao" });
    expect(again.body.sample.token).toBe(token);
    expect((await anon.call("GET", `/share/${encodeURIComponent(token)}`)).body.name).toBe("Asha R. Rao");

    // a wrong token is not found, and switching off closes the link
    expect((await anon.call("GET", `/share/${encodeURIComponent(token.slice(0, -2) + "zz")}`)).status).toBe(404);
    expect((await c.call("DELETE", `/reports/${reportId}/share`)).body.shared).toBe(false);
    expect((await anon.call("GET", `/share/${encodeURIComponent(token)}`)).status).toBe(404);
  });

  it("does not let anyone else share or read someone's report", async () => {
    const { client, reportId } = await finished();
    const other = client();
    await other.enroll("nurse", {});
    expect((await other.call("POST", `/reports/${reportId}/share`, { name: "Someone Else" })).status).toBe(404);
    expect((await other.call("GET", `/reports/${reportId}/share`)).status).toBe(404);
    expect((await client().call("POST", `/reports/${reportId}/share`, { name: "No Session" })).status).toBe(401);
  });
});

describe("visit counter", () => {
  it("counts visits without storing anything personal, ignores bots, and shows on traction", async () => {
    const { client, app } = await setup();
    const c = client();
    expect((await c.call("POST", "/visit", { first: true })).status).toBe(200);
    expect((await c.call("POST", "/visit", { first: false })).status).toBe(200);
    await app.inject({ method: "POST", url: "/api/v1/visit", payload: { first: true }, headers: { "user-agent": "Googlebot/2.1" } });
    const t = (await c.call("GET", "/traction")).body;
    expect(t.platform.visits).toBe(2);
    expect(t.platform.uniqueVisitors).toBe(1);
  });
});
