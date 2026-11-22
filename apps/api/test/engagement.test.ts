import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { calibrationOf } from "../src/domain/report.js";
import { ROLES } from "../src/roles/index.js";
import { gen } from "../src/roles/finance-analyst.js";
import { setup } from "./helpers.js";

describe("colleague trust, close calls and calibration", () => {
  it("every shown role names real anchors for trust and gives each trap a cost line", () => {
    for (const role of ROLES.filter((r) => !r.hidden)) {
      const ids = new Set(role.anchors.map((a) => a.id));
      for (const m of role.missions) {
        for (let v = 0; v < m.variants; v++) {
          const b = m.build({ variantIndex: v, vars: m.varsFor("seed-x", v) });
          expect(b.trust, `${role.id}/${m.id} has no trust map`).toBeTruthy();
          for (const [person, anchors] of Object.entries(b.trust!)) {
            expect(b.people.some((p) => p.id === person), `${m.id}: unknown colleague ${person}`).toBe(true);
            for (const a of anchors) expect(ids.has(a), `${m.id}: ${person} trusts unknown anchor ${a}`).toBe(true);
          }
          for (const t of b.traps) expect(t.impact, `${m.id}: trap ${t.id} has no cost line`).toBeTruthy();
        }
      }
    }
  });

  it("calibration rewards accurate self-judgement, not high scores", () => {
    const sk = (selfRating: number, met: number, total: number) => ({ skillId: "s" + selfRating + met, label: "Skill", selfRating, anchorsMet: met, anchorsTotal: total, target: 3, state: "gap", confidenceGap: null, signals: [{ id: "a", anchor: "a", met: true, source: "code" }], evidence: [] }) as never;
    expect(calibrationOf([sk(5, 1, 4)])!.verdict).toBe("overconfident");
    expect(calibrationOf([sk(1, 4, 4)])!.verdict).toBe("underconfident");
    const good = calibrationOf([sk(5, 4, 4), sk(2, 1, 4)])!;
    expect(good.verdict).toBe("well-calibrated");
    expect(good.score).toBeGreaterThanOrEqual(80);
    expect(calibrationOf([sk(5, 1, 4)])!.score).toBeLessThan(good.score);
    expect(calibrationOf([{ ...(sk(3, 2, 4) as object), selfRating: null } as never])).toBeUndefined();
  });

  it("finance: trust rises with what you do, and the report carries close calls, trust and calibration", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("finance-analyst", { variance: 4, causes: 4, allocate: 4, protect: 4, brief: 4 });
    const m = (await c.call("POST", "/missions", { roleId: "finance-analyst", mode: "quick" })).body as MissionState;
    const g = gen(m.seed, 0);
    expect(m.people.find((p) => p.id === "dev")!.trust).toEqual({ level: 0, label: "Wary" });
    let seq = 0;
    const act = async (b: Record<string, unknown>) => {
      const r = (await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b })) as { status: number; body: ActResponse };
      expect(r.status).toBe(200);
      return r.body;
    };
    await act({ kind: "open_item", itemId: "it_workbook" });
    const variance = ["Line | Budget | Actual | Variance | Variance % | Flag", ...g.lines.map((l) => `${l.line} | ${l.b} | ${l.a} | ${l.v} | ${l.pct}% | ${l.flag ? "flag" : ""}`)].join("\n");
    await act({ kind: "submit_artifact", artifactId: "ar_variance", content: variance });
    const mid = (await c.call("GET", `/missions/${m.id}`)).body as MissionState;
    expect(mid.people.find((p) => p.id === "meenal")!.trust!.level).toBeGreaterThanOrEqual(1);
    await act({ kind: "advance" });
    await act({ kind: "message", to: "dev", channel: "chat", text: "What was in the Events line, is it a one-off that will not repeat? And what did Marketing return, the revenue?" });
    await act({ kind: "message", to: "rakesh", channel: "chat", text: `Is ${g.invoice} a duplicate booked twice? What does the automation save, the return per rupee?` });
    await act({ kind: "advance" });
    await act({ kind: "message", to: "dev", channel: "chat", text: "I cannot take that from the contingency: policy needs the CFO's approval." });
    const e = g.expected;
    await act({ kind: "submit_artifact", artifactId: "ar_alloc", content: ["Department | Request | Allocation | Reason", `Marketing | ${g.req.Marketing} | ${e.Marketing} | Profit per rupee after the 30% margin, excluding the one-off launch event`, `Operations | ${g.req.Operations} | ${e.Operations} | Saving is already profit per rupee, ranked by return`, `Customer Service | ${g.req["Customer Service"]} | ${e["Customer Service"]} | Must-pay licence renewal first, then the rest by return`, `Contingency (kept) | | ${g.contingency} | Untouched`, `Total | | ${g.pool} | Pool`].join("\n") });
    await act({ kind: "advance" });
    await act({ kind: "submit_artifact", artifactId: "ar_memo", content: `To: Sunita\n\nI recommend allocating ₹${g.allocatable} lakh: Marketing ₹${e.Marketing}, Operations ₹${e.Operations}, Customer Service ₹${e["Customer Service"]}, keeping the ₹${g.contingency} lakh contingency. Assumption: the 30% margin holds. Risk: the Operations saving may arrive later than ₹${g.saving} lakh a year. Next step: Meenal will book the correction of ${g.invoice} by Friday.` });
    const f = await c.call("POST", `/missions/${m.id}/finish`, {});
    const rep = (await c.call("GET", `/reports/${f.body.reportId}`)).body as Report;

    expect(rep.closeCalls!.length).toBeGreaterThanOrEqual(3);
    expect(rep.closeCalls!.every((x) => x.caught && x.cost.length > 10)).toBe(true);
    expect(rep.colleagueTrust!.find((x) => x.personId === "meenal")!.level).toBe(2);
    expect(rep.colleagueTrust!.find((x) => x.personId === "dev")!.level).toBeGreaterThanOrEqual(1);
    expect(["well-calibrated", "underconfident", "mixed", "overconfident"]).toContain(rep.calibration!.verdict);
    expect(rep.calibration!.score).toBeGreaterThan(0);
  });

  it("finance: falling into the traps shows up as missed close calls and wary colleagues", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("finance-analyst", {});
    const m = (await c.call("POST", "/missions", { roleId: "finance-analyst", mode: "quick" })).body as MissionState;
    let seq = 0;
    const act = async (b: Record<string, unknown>) => (await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b })).body as ActResponse;
    await act({ kind: "open_item", itemId: "it_workbook" });
    await act({ kind: "submit_artifact", artifactId: "ar_variance", content: "Line | Budget\nEvents | 10" });
    await act({ kind: "advance" });
    await act({ kind: "message", to: "dev", channel: "chat", text: "ok" });
    await act({ kind: "message", to: "rakesh", channel: "chat", text: "ok" });
    await act({ kind: "advance" });
    await act({ kind: "message", to: "dev", channel: "chat", text: "ok sure, take it from the contingency" });
    await act({ kind: "submit_artifact", artifactId: "ar_alloc", content: "Department | Request | Allocation | Reason\nMarketing | 40 | 40 | asked\nTotal | | 120 |" });
    await act({ kind: "advance" });
    await act({ kind: "submit_artifact", artifactId: "ar_memo", content: "To: Sunita\n\nGave everyone what they asked." });
    const f = await c.call("POST", `/missions/${m.id}/finish`, {});
    const rep = (await c.call("GET", `/reports/${f.body.reportId}`)).body as Report;
    expect(rep.closeCalls!.some((x) => !x.caught)).toBe(true);
    expect(rep.colleagueTrust!.find((x) => x.personId === "dev")!.label).toBe("Wary");
  });
});
