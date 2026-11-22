import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { gen } from "../src/roles/procurement.js";
import { setup, type Client } from "./helpers.js";

async function player(c: Client, reseed = false) {
  await new Promise((r) => setTimeout(r, 8)); // distinct createdAt, so reseed picks the next variant
  const m = (await c.call("POST", "/missions", { roleId: "procurement", mode: "quick", reseed })).body as MissionState;
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
const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;

describe("Procurement Trainee", () => {
  it("is listed", async () => {
    const { client } = await setup();
    const ids = ((await client().call("GET", "/roles")).body as { id: string }[]).map((r) => r.id);
    expect(ids).toContain("procurement");
  });

  for (const v of [0, 1, 2]) {
    it(`ideal run, variant ${v}, is strong on every skill`, async () => {
      const { client } = await setup();
      const c = client();
      await c.enroll("procurement", {});
      let p = await player(c, false);
      for (let i = 0; i < v; i++) p = await player(c, true);
      const g = gen(p.m.seed, v);
      const w = g.winner;
      const rep = w.id === "A" ? "arun" : "vikram";
      const final = Math.round(w.price * 0.95);
      const finalTco = w.tco - g.qty * (w.price - final);

      await p.act({ kind: "open_item", itemId: "it_bids" });
      await p.say("priyanka", "When do we need them by, and what matters most, the budget or the criteria?");
      const tco = ["Vendor | Unit price x qty | Missing warranty cost | Delay cost | Delivery fees | Total cost", ...g.vendors.map((x) => `Vendor ${x.id}: ${x.name} | ${x.price * g.qty} | ${Math.max(0, 3 - x.warranty) * g.extCost * g.qty} | ${Math.max(0, x.delivery - g.needBy) * g.qty * g.delayCost} | ${x.ship * g.qty} | ${x.tco}`)].join("\n");
      const t0 = await p.act({ kind: "submit_artifact", artifactId: "ar_tco", content: tco });
      expect(t0.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("arun", "How often do you deliver on time, what is your track record? And what does the warranty and support cover?");
      const t1 = await p.say("vikram", "What is your on-time delivery history and what support and warranty do you give?");
      expect(t1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say(rep, "We would commit to the full volume and repeat orders next year, so we would like a better price. Could you also add a late-delivery clause and look at the warranty?");
      const t2 = await p.say(rep, "If we pay within 15 days instead, can you do 5 percent off?");
      expect(t2.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("arun", "Thank you, but I must decline the hamper. It is against our policy and I cannot accept gifts in a live bid.");
      await p.say("priyanka", `I want to tell you Arun offered a gift hamper and I declined it. I would rather not pick on price alone: the total cost numbers, warranty and late delivery risk matter, so I will write the memo.`);
      const memo = `To: Priyanka Desai\n\nI recommend ${w.name} (Vendor ${w.id}) at ${rupee(final)} a unit, total cost ${rupee(finalTco)}, the lowest total cost after warranty, delay and fees. Vendor A (Apex) delivers in 28 days against the need-by of ${g.needBy}, so it risks being late. Risk: ${w.name} could slip, so I added a late-delivery clause. I declined Arun's gift hamper and told you. Next step: I will send the order for your signature by Friday.`;
      const t3 = await p.act({ kind: "submit_artifact", artifactId: "ar_award", content: memo });
      expect(t3.delta.canFinish).toBe(true);
      const r = await p.finish();
      const states = Object.fromEntries(r.skills.map((x) => [x.skillId, x.state]));
      for (const id of ["tco", "diligence", "negotiate", "integrity", "award"]) expect(states[id], `${id}: ${JSON.stringify(states)}`).toBe("strong");
    }, 60000);
  }

  it("picking on price, accepting the gift and agreeing to rush show up as gaps", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("procurement", {});
    const p = await player(c, false);
    await p.act({ kind: "open_item", itemId: "it_bids" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_tco", content: "Vendor | Total\nVendor A | 1000" });
    await p.act({ kind: "advance" });
    await p.say("arun", "ok");
    await p.say("vikram", "ok");
    await p.act({ kind: "advance" });
    await p.say("vikram", "give me a discount");
    await p.say("vikram", "lower");
    await p.act({ kind: "advance" });
    await p.say("arun", "thanks, that is kind");
    await p.say("priyanka", "ok sure, I will pick the cheapest");
    await p.act({ kind: "submit_artifact", artifactId: "ar_award", content: "To: Priyanka\n\nGo with the cheapest." });
    const rep = await p.finish();
    for (const id of ["tco", "diligence", "negotiate", "integrity", "award"]) expect(skill(rep, id).state, id).not.toBe("strong");
    expect(skill(rep, "integrity").anchorsMet).toBeLessThan(3);
  }, 60000);
});
