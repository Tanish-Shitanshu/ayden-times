import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { gen } from "../src/roles/finance-analyst.js";
import { setup, type Client } from "./helpers.js";

async function player(c: Client, reseed = false) {
  await new Promise((r) => setTimeout(r, 8)); // distinct createdAt, so reseed picks the next variant
  const m = (await c.call("POST", "/missions", { roleId: "finance-analyst", mode: "quick", reseed })).body as MissionState;
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

function sheets(g: ReturnType<typeof gen>) {
  const variance = ["Line | Budget | Actual | Variance | Variance % | Flag", ...g.lines.map((l) => `${l.line} | ${l.b} | ${l.a} | ${l.v} | ${l.pct}% | ${l.flag ? "flag" : ""}`)].join("\n");
  const e = g.expected;
  const alloc = [
    "Department | Request | Allocation | Reason",
    `Marketing | ${g.req.Marketing} | ${e.Marketing} | Profit per rupee is ${g.p.Marketing} after the 30% margin, excluding the one-off launch event`,
    `Operations | ${g.req.Operations} | ${e.Operations} | Saving is already profit, ${g.p.Operations} per rupee, ranked by return`,
    `Customer Service | ${g.req["Customer Service"]} | ${e["Customer Service"]} | Must-pay licence renewal funded first, then the rest by return`,
    `Contingency (kept) | | ${g.contingency} | Untouched, needs CFO approval`,
    `Total | | ${g.pool} | Pool`,
  ].join("\n");
  const memo = `To: Sunita Rao\n\nI recommend allocating ₹${g.allocatable} lakh: Marketing ₹${e.Marketing}, Operations ₹${e.Operations}, Customer Service ₹${e["Customer Service"]}, keeping the ₹${g.contingency} lakh contingency. Assumption: the 30% margin and the Marketing one-off of ₹${g.oneOff} lakh are right. Risk: the Operations saving may arrive later than ₹${g.saving} lakh a year. Next step: Meenal will book the correction of ${g.invoice} by Friday.`;
  return { variance, alloc, memo };
}

describe("Junior Financial Analyst", () => {
  it("is listed, and the hidden roles are not", async () => {
    const { client } = await setup();
    const roles = (await client().call("GET", "/roles")).body as { id: string }[];
    const ids = roles.map((r) => r.id);
    expect(ids).toContain("finance-analyst");
    expect(ids).not.toContain("nurse");
    expect(ids).not.toContain("executive");
  });

  for (const v of [0, 1, 2]) {
    it(`ideal run, variant ${v}, is strong on every skill`, async () => {
      const { client } = await setup();
      const c = client();
      await c.enroll("finance-analyst", {});
      let p = await player(c, false);
      for (let i = 0; i < v; i++) p = await player(c, true);
      const g = gen(p.m.seed, v);
      const s = sheets(g);

      await p.act({ kind: "open_item", itemId: "it_workbook" });
      const r0 = await p.act({ kind: "submit_artifact", artifactId: "ar_variance", content: s.variance });
      expect(r0.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("dev", "What was in the Events line, is it a one-off that will not repeat? And what did Marketing return last quarter, the revenue?");
      const r1 = await p.say("rakesh", `Why is Freight over? Is ${g.invoice} a duplicate booked twice? What does the automation save, the return per rupee?`);
      expect(r1.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      await p.say("dev", "I cannot take the gap from the contingency: policy needs the CFO's approval, and Marketing ranks lower on profit per rupee.");
      const r2 = await p.act({ kind: "submit_artifact", artifactId: "ar_alloc", content: s.alloc });
      expect(r2.delta.canAdvance).toBe(true);
      await p.act({ kind: "advance" });

      const r3 = await p.act({ kind: "submit_artifact", artifactId: "ar_memo", content: s.memo });
      expect(r3.delta.canFinish).toBe(true);
      const rep = await p.finish();
      const states = Object.fromEntries(rep.skills.map((x) => [x.skillId, x.state]));
      for (const id of ["variance", "causes", "allocate", "protect", "brief"]) expect(states[id], `${id}: ${JSON.stringify(states)} best=${g.order[0]}`).toBe("strong");
    }, 60000);
  }

  it("raiding the contingency, wrong variances and a revenue-based split show up as gaps", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("finance-analyst", {});
    const p = await player(c, false);
    const g = gen(p.m.seed, 0);
    await p.act({ kind: "open_item", itemId: "it_workbook" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_variance", content: "Line | Budget | Actual | Variance\nDigital ads | 30 | 31 | 9\nEvents | 10 | 11 | 4" });
    await p.act({ kind: "advance" });
    await p.say("dev", "ok");
    await p.say("rakesh", "ok");
    await p.act({ kind: "advance" });
    await p.say("dev", "ok sure, take it from the contingency");
    await p.act({ kind: "submit_artifact", artifactId: "ar_alloc", content: `Department | Request | Allocation | Reason\nMarketing | ${g.req.Marketing} | ${g.req.Marketing} | asked\nOperations | ${g.req.Operations} | ${g.req.Operations} | asked\nCustomer Service | ${g.req["Customer Service"]} | ${g.req["Customer Service"]} | asked\nTotal | | ${g.pool} |` });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_memo", content: "To: Sunita\n\nGave everyone what they asked." });
    const rep = await p.finish();
    for (const id of ["variance", "causes", "allocate", "protect", "brief"]) expect(skill(rep, id).state, id).not.toBe("strong");
    expect(skill(rep, "protect").anchorsMet).toBeLessThan(3);
  }, 60000);
});
