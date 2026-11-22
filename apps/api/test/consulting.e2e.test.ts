import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { gen as stratGen } from "../src/roles/tech-consulting.js";
import { gen as ctlGen } from "../src/roles/consulting-controls.js";
import { setup, type Client } from "./helpers.js";

async function player(c: Client, missionId: string, reseed = false) {
  await new Promise((r) => setTimeout(r, 8)); // distinct createdAt, so reseed picks the next variant
  const m = (await c.call("POST", "/missions", { roleId: "tech-consulting", missionId, mode: "quick", reseed })).body as MissionState;
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

describe("Consulting and Advisory Analyst: mission 1 (strategy)", () => {
  it("bridge, rupee impact and recommendation make every skill strong", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("tech-consulting", {});
    const p = await player(c, "cons-margin-review");
    const g = stratGen(p.m.seed);
    await p.act({ kind: "open_item", itemId: "it_scope" });
    await p.say("rhea", "What decision does the client need to make with this, and when do you need the headline? Is store staffing in scope?");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_tree", content: "Question: why did gross margin fall?\n- Price and discounting\n- Volume and traffic\n- Category mix\n- Supplier cost\nHypothesis: I suspect category mix matters most." });
    await p.act({ kind: "advance" });
    const b = await p.act({ kind: "submit_artifact", artifactId: "ar_bridge", content: `Item | Percentage points\nMargin last year | ${r1(g.total0)}\nMix effect | -${r1(g.mix)}\nRate effect | -${r1(g.rate)}\nMargin this year | ${r1(g.total1)}` });
    expect(b.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    const up = await p.act({ kind: "submit_artifact", artifactId: "ar_update", content: `Hi Rhea,\n\nGross margin fell ${r1(g.drop)} points, from ${r1(g.total0)}% to ${r1(g.total1)}%, driven mainly by a mix shift towards lower-margin categories, worth about ₹${r1(g.impact)} crore of gross profit on ₹${g.fin} crore of revenue (finance ledger).\n- Mix explains ${g.mixShare}% of the fall.\n- Supplier prices rose only 1.4%, a small effect.\nRecommend rebalancing the range and promotions toward higher-margin categories. Risk: finance and ops revenue totals differ and need reconciling. Next step: Rhea will confirm the approach with the client by Friday.` });
    expect(up.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("sethi", "Not quite: the data points to mix shift, not supplier prices. I'm fairly confident, but we will reconcile the data. Rhea will confirm the staffing request and scope, and we will update you tomorrow.");
    await p.say("rhea", "Sethi asked for a store staffing analysis by Monday. That is outside the scope. How should we respond?");
    const rep = await p.finish();
    const states = Object.fromEntries(rep.skills.map((x) => [x.skillId, x.state]));
    for (const id of ["structure", "answer_first", "numbers_integrity", "scope_mgmt", "stakeholder_comm", "recommend"]) expect(states[id], `${id}: ${JSON.stringify(states)}`).toBe("strong");
  }, 60000);

  it("blaming supplier prices, a wrong bridge and agreeing to extra work show up", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("tech-consulting", {});
    const p = await player(c, "cons-margin-review");
    await p.act({ kind: "open_item", itemId: "it_scope" });
    await p.say("rhea", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_tree", content: "- supplier" });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_bridge", content: "Item | pts\nMargin last year | 1\nMix effect | 2\nRate effect | 3\nMargin this year | 4" });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_update", content: "Supplier prices drove a 73% margin collapse." });
    await p.act({ kind: "advance" });
    const ev = (await c.call("GET", `/missions/${p.m.id}/events?since=0`)).body.events as { kind: string }[];
    expect(ev.some((e) => e.kind === "consequence")).toBe(true);
    await p.say("sethi", "Sure, I'll do the staffing analysis by Monday.");
    const rep = await p.finish();
    expect(skill(rep, "numbers_integrity").state).toBe("gap");
    expect(skill(rep, "recommend").state).not.toBe("strong");
    expect(skill(rep, "scope_mgmt").state).not.toBe("strong");
  }, 60000);
});

function ideal(g: ReturnType<typeof ctlGen>) {
  const typeWord = { po: "No purchase order (PO) raised", limit: "Approved above the manager limit, needed the Finance Head", dup: "Duplicate payment, same invoice paid twice", self: "Self-approval: the requester approved their own payment" } as const;
  const sheet = ["Ref | Exception | Amount | Rating", ...g.exceptions.map((e) => `${e.ref} | ${typeWord[e.type]} | ${e.amount} | ${e.rating}`)].join("\n");
  const finding = `Observation: in our sample of ${g.n} payments we found ${g.exceptions.length} exceptions worth ₹${g.total} lakh: missing POs, approvals above the manager limit, a self-approval and a duplicate payment.\nRisk: the company could overpay or lose money to fraud, and the control is not working as designed.\nRecommendation: management should block payment without a PO, enforce the approval limit and segregation of duties in the system, and recover the duplicate. This is a sample, so we cannot conclude the rate across all payments; we recommend further testing of the full population.`;
  return { sheet, finding };
}

describe("Consulting and Advisory Analyst: mission 2 (controls review)", () => {
  for (const v of [0, 1, 2]) {
    it(`ideal run, variant ${v}, is strong on every skill`, async () => {
      const { client } = await setup();
      const c = client();
      await c.enroll("tech-consulting", {});
      let p = await player(c, "cons-controls-review");
      for (let i = 0; i < v; i++) p = await player(c, "cons-controls-review", true);
      const g = ctlGen(p.m.seed, v);
      const a = ideal(g);
      await p.act({ kind: "open_item", itemId: "it_control" });
      await p.act({ kind: "open_item", itemId: "it_sample" });
      await p.say("ananya", "How was the sample chosen, how many payments, and what counts as an exception? What is the rating rule?");
      await p.act({ kind: "advance" });
      const e1 = await p.act({ kind: "submit_artifact", artifactId: "ar_exceptions", content: a.sheet });
      expect(e1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });
      const f1 = await p.act({ kind: "submit_artifact", artifactId: "ar_finding", content: a.finding });
      expect(f1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });
      await p.say("bhatia", "I cannot call it a timing issue without evidence: the rating follows the rule, and a duplicate is High. If you can show me evidence of timing, I will review it.");
      await p.say("kiran", "Sorry, I cannot share a draft; it is confidential and I must stay independent. Please speak to Ananya.");
      const last = await p.say("ananya", "Mr Bhatia asked me to soften the duplicate to Low and relabel it a timing issue, and Kiran asked for the draft. I declined both and wanted to tell you.");
      expect(last.delta.canFinish).toBe(true);
      const rep = await p.finish();
      const states = Object.fromEntries(rep.skills.map((x) => [x.skillId, x.state]));
      for (const id of ["test_sample", "rate_risk", "write_finding", "independence"]) expect(states[id], `${id}: ${JSON.stringify(states)}`).toBe("strong");
    }, 60000);
  }

  it("missed exceptions, a generalised sample and a softened rating show up as gaps", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("tech-consulting", {});
    const p = await player(c, "cons-controls-review");
    const g = ctlGen(p.m.seed, 0);
    await p.act({ kind: "open_item", itemId: "it_control" });
    await p.act({ kind: "open_item", itemId: "it_sample" });
    await p.say("ananya", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_exceptions", content: `Ref | Exception | Amount | Rating\n${g.exceptions[0]!.ref} | bad | 1 | Low\nP-99 | bad | 1 | Low` });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_finding", content: "Observation: payments are all wrong across the company." });
    await p.act({ kind: "advance" });
    await p.say("bhatia", "ok sure, I can call it Low");
    await p.say("kiran", "sure, sending it tonight");
    const rep = await p.finish();
    for (const id of ["test_sample", "rate_risk", "write_finding", "independence"]) expect(skill(rep, id).state, id).not.toBe("strong");
    expect(skill(rep, "independence").anchorsMet).toBeLessThan(2);
  }, 60000);
});
