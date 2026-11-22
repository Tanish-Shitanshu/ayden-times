import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { gen } from "../src/roles/marketing.js";
import { setup, type Client } from "./helpers.js";

async function player(c: Client, reseed = false) {
  await new Promise((r) => setTimeout(r, 8)); // distinct createdAt, so reseed picks the next variant
  const m = (await c.call("POST", "/missions", { roleId: "marketing", mode: "quick", reseed })).body as MissionState;
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

describe("Digital Marketing Associate", () => {
  it("is built and reachable by id (hidden from the list)", async () => {
    const { client } = await setup();
    const role = (await client().call("GET", "/roles/marketing")).body as { id: string; status: string };
    expect(role.status).toBe("ready");
  });

  for (const v of [0, 1, 2]) {
    it(`ideal run, variant ${v}, is strong on every skill`, async () => {
      const { client } = await setup();
      const c = client();
      await c.enroll("marketing", {});
      let p = await player(c, false);
      for (let i = 0; i < v; i++) p = await player(c, true);
      const g = gen(p.m.seed, v);

      await p.act({ kind: "open_item", itemId: "it_export" });
      const metrics = ["Campaign | CTR % | CPC | Conv. rate % | CPA | ROAS", ...g.camps.map((x) => `${x.name} | ${x.ctr} | ${x.cpc} | ${x.cvr} | ${x.cpa ?? "n/a"} | ${x.roas}`)].join("\n");
      const a0 = await p.act({ kind: "submit_artifact", artifactId: "ar_metrics", content: metrics });
      expect(a0.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("imran", "Is conversion tracking working on Landing B? What changed on the site, is the tag firing?");
      const a1 = await p.say("kavya", "How much of Brand Search is incremental, would they have bought anyway, are they existing customers? Festive Sale shows high CTR but zero conversions, so the tag is missing, I think.");
      expect(a1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      // budget: more to better ROAS, brand near current, test budget 10%
      const alloc = (name: string): number => {
        const rank = g.order.indexOf(name);
        const base = Math.round((g.budget - g.test) * 0.12);
        return rank === 0 ? Math.round(g.budget * 0.34) : rank === 1 ? Math.round(g.budget * 0.24) : rank === 2 ? Math.round(g.budget * 0.1) : base;
      };
      const brand = g.camps[0]!.cost;
      const broken = g.camps[3]!.cost;
      const rows = [
        `Brand Search | ${g.camps[0]!.cost} | ${brand} | Headline ROAS is flattering because most buyers already knew us, so I hold it flat`,
        `Generic Search | ${g.camps[1]!.cost} | ${alloc("Generic Search")} | Rank by ROAS; more money goes where ROAS is better`,
        `Shopping | ${g.camps[2]!.cost} | ${alloc("Shopping")} | Rank by ROAS; more money goes where ROAS is better`,
        `Festive Sale (Landing B) | ${broken} | ${Math.round(broken * 0.5)} | High CTR but zero conversions because the tag is missing; fix the tracking before judging it`,
        `YouTube | ${g.camps[4]!.cost} | ${alloc("YouTube")} | Rank by ROAS; awareness at this level`,
        `Test budget | | ${g.test} | Ten percent kept for new ideas`,
      ];
      const sum = brand + alloc("Generic Search") + alloc("Shopping") + Math.round(broken * 0.5) + alloc("YouTube") + g.test;
      rows.push(`Total | | ${Math.min(sum, g.budget)} | Within the monthly budget`);
      // make sure the plan really fits the budget
      expect(sum).toBeLessThanOrEqual(g.budget);
      const a2 = await p.act({ kind: "submit_artifact", artifactId: "ar_plan", content: ["Campaign | Current spend | New budget | Reason", ...rows].join("\n") });
      expect(a2.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("khanna", "I cannot run that claim: a guarantee or cure claim is misleading, breaks our policy and risks complaints and rejection. Here is what we can say instead: dermatologist-tested, made with 2% niacinamide.");
      const a3 = await p.act({ kind: "submit_artifact", artifactId: "ar_copy", content: "Headline (max 30 characters): Dermatologist-tested serum\nDescription (max 90 characters): Made with 2% niacinamide. Shop the Festive serum today." });
      expect(a3.delta.canFinish).toBe(true);
      const rep = await p.finish();
      const states = Object.fromEntries(rep.skills.map((x) => [x.skillId, x.state]));
      for (const id of ["metrics", "diagnose", "budget", "honest_ads"]) expect(states[id], `${id}: ${JSON.stringify(states)} order=${g.order} budget=${g.budget} sum=${sum}`).toBe("strong");
    }, 60000);
  }

  it("agreeing to the claim, cutting on a zero and a long headline show up as gaps", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("marketing", {});
    const p = await player(c, false);
    await p.act({ kind: "open_item", itemId: "it_export" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_metrics", content: "Campaign | CTR\nBrand Search | 1" });
    await p.act({ kind: "advance" });
    await p.say("imran", "ok");
    await p.say("kavya", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_plan", content: "Campaign | Current | New | Reason\nBrand Search | 1 | 999999 | best\nFestive Sale | 1 | 0 | zero conversions\nTotal | | 999999 |" });
    await p.act({ kind: "advance" });
    await p.say("khanna", "ok sure, we can do that");
    await p.act({ kind: "submit_artifact", artifactId: "ar_copy", content: "Headline (max 30 characters): Guaranteed to cure acne in 7 days!\nDescription (max 90 characters): The best serum ever made, clinically proven." });
    const rep = await p.finish();
    for (const id of ["metrics", "diagnose", "budget", "honest_ads"]) expect(skill(rep, id).state, id).not.toBe("strong");
  }, 60000);
});
