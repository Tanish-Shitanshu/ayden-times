import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { gen } from "../src/roles/swe-decisions.js";
import { setup, type Client } from "./helpers.js";

const MISSION = "swe-tech-decisions";

async function player(c: Client, reseed = false) {
  await new Promise((r) => setTimeout(r, 8)); // distinct createdAt, so reseed picks the next variant
  const m = (await c.call("POST", "/missions", { roleId: "software-engineer", missionId: MISSION, mode: "quick", reseed })).body as MissionState;
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
  return { m, act, say, finish };
}

const skill = (r: Report, id: string) => r.skills.find((s) => s.skillId === id)!;
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The ideal answer for each of the three variants, written from the engine's own numbers. */
function ideal(v: number, g: ReturnType<typeof gen>) {
  const adr1 = [
    "Context and requirements:",
    v === 0
      ? "Orders, order items and payments change together and must stay consistent. We need transactions."
      : v === 1
        ? "About 4,000 product types with very different attributes, 95% reads, and no cross-product transactions. We need flexible attributes."
        : "2,000 riders ping every 5 seconds, so about 400 writes per second, append-only. Our load test measured 2,500 writes per second on one instance.",
    "Options:",
    v === 0 ? "1. Cloud SQL (PostgreSQL)\n2. Firestore" : v === 1 ? "1. Firestore (document database)\n2. Cloud SQL (PostgreSQL)" : "1. Cloud SQL (PostgreSQL)\n2. Bigtable with Kafka",
    `Decision: ${v === 0 ? "Cloud SQL (PostgreSQL)" : v === 1 ? "Firestore (document database)" : "Cloud SQL (PostgreSQL)"}.`,
    v === 0
      ? "Reasons: payments and orders need atomic transactions and consistency; the team already knows SQL, so risk and operations effort stay low, and cost is predictable."
      : v === 1
        ? "Reasons: flexible attributes per product type, read-heavy traffic and no joins; a document model avoids hundreds of sparse columns, keeps cost and operations low for a small team."
        : "Reasons: 400 writes per second is far below the measured 2,500, so there is headroom; it is simple, low cost and the team knows it, with little operations risk.",
    v === 0
      ? "Downside of this choice: scaling writes later takes more work, and schema migrations are a cost we accept."
      : v === 1
        ? "Downside of this choice: no joins and weaker ad-hoc reporting, a trade-off we accept; we would export to analytics."
        : "Downside of this choice: a single database becomes a limit if pings grow tenfold, a risk we accept for now.",
    v === 0 ? "Why not the others: Firestore was rejected because transactions across payments matter more than flexibility." : v === 1 ? "Why not the others: Cloud SQL was rejected because hundreds of mostly empty columns would be a migration burden." : "Why not the others: Bigtable and Kafka were rejected because they are overkill for 400 writes per second and we would pay more in cost and operations.",
    v === 2 ? "Would revisit if pings exceed 1,500 writes per second." : "Would revisit if load or the product mix changes materially.",
  ].join("\n");

  const adr2 = [
    `Context and requirements: normal traffic ${g.normalRps} requests a second, a ${g.saleHours} hours sale peaking at ${g.peakRps}; ${g.teamSize} engineers and no operations engineer; budget ${money(g.budget)} a month.`,
    `Peak instances needed: ${g.peakRps} / ${g.cap} per instance = ${g.instPeak} instances.`,
    "Options and monthly cost:",
    `1. Cloud Run scaling with demand: ${g.instBase} instance for 27 days plus ${g.instPeak} instances for ${g.saleHours} hours at ₹${g.rate} per instance-hour = ${money(g.costServerless)} a month, within the ${money(g.budget)} budget.`,
    `2. GKE sized for peak: ${g.nodes} nodes at ${money(g.nodeMonthly)} = ${money(g.costGke)} a month, over the budget, always on all month.`,
    "Decision: Cloud Run.",
    "Reasons: we only pay for the sale days because it scales with demand, a five-person team without on-call operations can run it, and it fits the budget.",
    "Would revisit if sustained traffic grows enough that always-on capacity is cheaper, or if we need many services.",
  ].join("\n");

  const summary =
    v === 0
      ? `We will go with Cloud SQL and Cloud Run, about ${money(g.costServerless)} a month. Finance cut the budget by 20 percent to about ${money(g.cutBudget)}, so I will add caching for reads and cap the maximum instances for the sale. Biggest risk: a capped sale could queue requests. Next step: I will load test the cap by Thursday.`
      : v === 1
        ? `We will go with Firestore and Cloud Run, about ${money(g.costServerless)} a month. Legal needs customer data in India, so I will run everything in the Mumbai region (asia-south1) for data residency. Biggest risk: weaker ad-hoc reporting. Next step: I will confirm the region setup by Thursday.`
        : `We will go with Cloud SQL and Cloud Run, about ${money(g.costServerless)} a month. The sale is twice as big, so peak needs ${g.instPeak2} instances and I will raise the maximum instances and keep the database headroom. Biggest risk: database writes during the doubled sale. Next step: I will load test it by Thursday.`;
  return { adr1, adr2, summary };
}

describe("Software Engineer, mission 2: technical decisions", () => {
  it("is listed with the role and has three variants", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    const role = (await c.call("GET", "/roles/software-engineer")).body as { missions: { id: string }[]; skills: { id: string }[] };
    expect(role.missions.map((m) => m.id)).toContain(MISSION);
    expect(role.skills.map((s) => s.id)).toEqual(expect.arrayContaining(["frame_requirements", "weigh_tradeoffs", "size_and_cost", "decide_and_record", "hold_or_update"]));
  });

  for (const v of [0, 1, 2]) {
    it(`ideal run, variant ${v}, is strong on every decision skill`, async () => {
      const { client } = await setup();
      const c = client();
      await c.enroll("software-engineer", {});
      let p = await player(c, false);
      for (let i = 0; i < v; i++) p = await player(c, true);
      const g = gen(p.m.seed, v);
      const a = ideal(v, g);

      await p.act({ kind: "open_item", itemId: "it_brief" });
      await p.say("priya", "What is the peak traffic and how many requests a second? What is the budget, and who runs it on call in the team?");
      const r0 = await p.say("arjun", "How is the data used: reads, writes, relationships and transactions? What does the data look like?");
      expect(r0.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("arjun", "Why do you prefer that? I have a concern about the cost because of the trade-off, given the numbers.");
      await p.say("rohan", "Why do you prefer that? My concern is the risk and the cost given the numbers.");
      const m1 = await p.act({ kind: "submit_artifact", artifactId: "ar_adr1", content: a.adr1 });
      expect(m1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("rohan", "What would it cost us each month, and who would be on call? Given the budget, I would rather scale with demand.");
      const m2 = await p.act({ kind: "submit_artifact", artifactId: "ar_adr2", content: a.adr2 });
      expect(m2.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      const m3 = await p.act({ kind: "submit_artifact", artifactId: "ar_summary", content: `To: Priya Nair\n\n${a.summary}` });
      expect(m3.delta.canFinish).toBe(true);
      const rep = await p.finish();
      const states = Object.fromEntries(rep.skills.map((s) => [s.skillId, s.state]));
      for (const id of ["frame_requirements", "weigh_tradeoffs", "size_and_cost", "decide_and_record", "hold_or_update"]) expect(states[id], `${id}: ${JSON.stringify(states)}`).toBe("strong");
    }, 60000);
  }

  it("giving way, the wrong store and an always-on cluster show up as gaps", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", {});
    const p = await player(c, false);
    await p.act({ kind: "open_item", itemId: "it_brief" });
    await p.say("priya", "ok");
    await p.say("arjun", "ok");
    await p.act({ kind: "advance" });
    await p.say("arjun", "sure, fine");
    await p.act({ kind: "submit_artifact", artifactId: "ar_adr1", content: "Decision: Firestore.\nEveryone uses it." });
    await p.act({ kind: "advance" });
    await p.say("rohan", "yes ok");
    await p.act({ kind: "submit_artifact", artifactId: "ar_adr2", content: "Decision: GKE with microservices.\nIt scales." });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_summary", content: "To: Priya\n\nNo change." });
    const rep = await p.finish();
    for (const id of ["weigh_tradeoffs", "size_and_cost", "hold_or_update", "frame_requirements"]) expect(skill(rep, id).state, id).not.toBe("strong");
    expect(rep.skills.find((s) => s.skillId === "hold_or_update")!.anchorsMet).toBeLessThan(3);
  }, 60000);
});
