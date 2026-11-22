import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { setup, type Client } from "./helpers.js";

async function player(c: Client, roleId: string) {
  await c.enroll(roleId, {});
  const m = (await c.call("POST", "/missions", { roleId, mode: "quick" })).body as MissionState;
  let seq = 0;
  const act = async (b: Record<string, unknown>) => {
    const r = (await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b })) as { status: number; body: ActResponse };
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body;
  };
  const say = (to: string, text: string) => act({ kind: "message", to, channel: "chat", text });
  const finish = async () => {
    const f = await c.call("POST", `/missions/${m.id}/finish`, {});
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    return (await c.call("GET", `/reports/${f.body.reportId}`)).body as Report;
  };
  return { m, act, say, finish, c };
}

const skill = (r: Report, id: string) => r.skills.find((s) => s.skillId === id)!;
const r1 = (n: number) => Math.round(n * 10) / 10;

function figures(m: MissionState) {
  const fin = m.items.find((i) => i.id === "it_finance")!;
  const rows = (fin as { rows: (string | number)[][] }).rows;
  const [cash, revenue, netBurn, each, share] = rows.map((r) => Number(r[1]));
  const hire3 = r1(each! * 3);
  return { cash: cash!, revenue: revenue!, netBurn: netBurn!, each: each!, share: share!, run0: r1(cash! / netBurn!), run1: r1(cash! / (netBurn! + each!)), run3: r1(cash! / (netBurn! + hire3)), run3c: r1(cash! / (netBurn! + hire3 + (revenue! * share!) / 100)) };
}

describe("Executive (Startup CEO)", () => {
  it("is listed as a ready role", async () => {
    const { client } = await setup();
    const role = (await client().call("GET", "/roles/executive")).body as { id: string; status: string };
    expect(role.status).toBe("ready");
  });

  it("ideal run is strong across the skills", async () => {
    const { client } = await setup();
    const p = await player(client(), "executive");
    const f = figures(p.m);
    await p.act({ kind: "open_item", itemId: "it_finance" });
    const r1a = await p.say("anika", "What is our runway and burn today, and what does hiring three engineers do to it? And what if our biggest customer leaves?");
    expect(r1a.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    const memo = await p.act({
      kind: "submit_artifact", artifactId: "ar_decision",
      content: `Decision: Rohit wants three engineers now.\nOptions:\n1. Hire all three now: runway falls from ${f.run0} to ${f.run3} months, and to ${f.run3c} months if our biggest customer (${f.share}% of revenue) leaves.\n2. Hire one now and two after a signed term sheet: runway is ${f.run1} months.\nCriteria: protect runway above 6 months, keep growth speed, limit customer concentration risk.\nRecommendation: I recommend option 2, hiring in stages.\nWhat would change my mind: a signed term sheet or the biggest customer renewing for a year.\nReversibility: staged hiring is easy to reverse, offers to three people are not.`,
    });
    expect(memo.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("neel", "Thank you for telling me straight away. This is not your fault, we will run a blameless review.");
    const notice = await p.act({
      kind: "submit_artifact", artifactId: "ar_notice",
      content: "To: Affected customers\nSubject: A security issue that affected your account\n\nWhat happened: last night a report link was open to the internet for a few hours.\nWhat data: company names and payroll summaries.\nWhat we did: we closed the link at 2:10 am and we are reading the logs.\nWhat you should do: please contact us if you see anything unusual and we will share what we find.",
    });
    expect(notice.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("rohit", "I won't hide it. The board needs to know today, and I think telling them up front protects the round.");
    await p.say("sana", "I can't promise Friday until Engineering has confirmed it. Let's check with Neel first.");
    const last = await p.say("neel", "Please don't resign. Thank you for flagging it. Let's do a blameless review and fix the process with an access check.");
    expect(last.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    const upd = await p.act({
      kind: "submit_artifact", artifactId: "ar_update",
      content: `To: Board\n\nRunway is ${f.run0} months today and I am hiring one engineer, not three, which gives ${f.run1} months. Overnight a security incident exposed company names and payroll summaries for some customers for a few hours. We closed it, we are telling every affected customer in plain words, and Neel will publish the root cause. Our biggest customer wants a custom feature by Friday and I have not promised it until Engineering confirms. Next step: Anika will share the revised hiring plan by Friday.`,
    });
    expect(upd.delta.canFinish).toBe(true);
    const rep = await p.finish();
    for (const id of ["frame_decision", "decide_with_data", "transparency", "lead_people", "investor_comm"]) expect(skill(rep, id).state, id).toBe("strong");
  });

  it("hiding the incident, overpromising and blaming come back as consequences", async () => {
    const { client } = await setup();
    const p = await player(client(), "executive");
    await p.act({ kind: "open_item", itemId: "it_finance" });
    await p.say("anika", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_decision", content: "Approve all three engineers now. Rohit is right, we should hire three engineers now." });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_notice", content: "We had a hacker attack. We guarantee it can never happen again." });
    await p.act({ kind: "advance" });
    await p.say("rohit", "Sure, agreed, we won't mention it today.");
    await p.say("sana", "Yes, sure, promise them Friday.");
    await p.say("neel", "Yes, this was your fault Neel, you were careless.");
    await p.say("anika", "Neel was careless and it is his fault, we should sack him.");
    await p.act({ kind: "advance" });
    const ev = (await p.c.call("GET", `/missions/${p.m.id}/events?since=0`)).body.events as { kind: string }[];
    expect(ev.filter((e) => e.kind === "consequence").length).toBeGreaterThanOrEqual(3);
    await p.act({ kind: "submit_artifact", artifactId: "ar_update", content: "Hiring approved. All good." });
    const rep = await p.finish();
    expect(skill(rep, "transparency").state).toBe("gap");
    expect(skill(rep, "lead_people").state).toBe("gap");
    expect(rep.consequences.length).toBeGreaterThanOrEqual(3);
  });
});
