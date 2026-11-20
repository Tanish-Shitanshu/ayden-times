import { describe, expect, it } from "vitest";
import type { ActResponse, MissionState, Report } from "@ayden/contract";
import { FAMILIES } from "../src/roles/swe-code.js";
import { setup } from "./helpers.js";

describe("Software Engineer mission (scripted mode, local sandbox)", () => {
  it("plays the whole loop and produces a quote-backed report", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", { clarify: 5, verify: 5, conventions: 5, git_hygiene: 5, review_collab: 5 });
    const created = await c.call("POST", "/missions", { roleId: "software-engineer", mode: "quick" });
    expect(created.status).toBe(200);
    const m = created.body as MissionState;
    expect(m.beat.index).toBe(0);
    expect(m.people.length).toBe(5);
    const fam = FAMILIES[Number(m.variantLabel.includes("shipping") ? 1 : 0)]!;
    let seq = 0;
    const act = async (b: Record<string, unknown>) => (await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b })) as { status: number; body: ActResponse };

    // Beat 1: ask a precise question and read the guide
    await act({ kind: "open_item", itemId: "it_guide" });
    const q = await act({ kind: "message", to: "priya", channel: "chat", text: "Before I start: should the discount apply once to the whole order or per line?" });
    expect(q.body.events.length).toBeGreaterThanOrEqual(2);
    expect(q.body.delta.canAdvance).toBe(true);
    await act({ kind: "advance" });

    // Beat 2: fix with the golden solution, run checks
    await act({ kind: "save_file", itemId: "it_src", content: fam.golden });
    await act({ kind: "save_file", itemId: "it_tests", content: fam.goldenTests });
    const run = await act({ kind: "run_checks" });
    const checkEvent = run.body.events.find((e) => e.kind === "check_result")!;
    expect(checkEvent.meta?.checks?.every((x) => x.passed)).toBe(true);
    expect(run.body.delta.canAdvance).toBe(true);
    await act({ kind: "advance" });

    // Beat 3: submit commit and PR
    const key = (await c.call("GET", `/missions/${m.id}`)).body.items.find((i: { type: string }) => i.type === "ticket").key as string;
    await act({ kind: "submit_artifact", artifactId: "ar_commit", content: `fix(${fam.module}): apply the rule once (${key})` });
    const pr = await act({ kind: "submit_artifact", artifactId: "ar_pr", content: "## Why\nCustomers were overcharged because the rule was applied twice.\n\n## What changed\nApply it once and validate input.\n\n## How I tested\nRan the checks and added a test for invalid input.\n\n## Risks\nLow, covered by tests." });
    expect(pr.body.events.some((e) => e.from === "arjun")).toBe(true);
    expect(pr.body.events.some((e) => e.from === "neha")).toBe(true);
    expect(pr.body.delta.canAdvance).toBe(true);
    await act({ kind: "message", to: "arjun", channel: "chat", text: "Thanks. I'd keep it simple for now and not add a new class, it's not needed for this ticket; happy to open a separate ticket." });
    await act({ kind: "advance" });

    // Beat 4: pressure
    const p = await act({ kind: "message", to: "priya", channel: "chat", text: "I'd rather not merge before the checks and review are green. The risk is customers being overcharged again. Give me ten minutes." });
    expect(p.body.delta.canFinish).toBe(true);
    await act({ kind: "message", to: "meera", channel: "chat", text: "Could we open a separate ticket for the loyalty discount and ask Priya to prioritise it after the release?" });

    const fin = await c.call("POST", `/missions/${m.id}/finish`, {});
    expect(fin.status).toBe(200);
    const rep = (await c.call("GET", `/reports/${fin.body.reportId}`)).body as Report;
    expect(rep.status).toBe("ready");
    expect(rep.skills.length).toBe(5);
    const git = rep.skills.find((s) => s.skillId === "git_hygiene")!;
    expect(git.anchorsMet).toBeGreaterThanOrEqual(3);
    const verify = rep.skills.find((s) => s.skillId === "verify")!;
    expect(verify.state).toBe("strong");
    expect(rep.integrity.notes.length).toBeGreaterThan(0);
    // every evidence quote must be a substring of its event
    const tr = await c.call("GET", `/missions/${m.id}/transcript`);
    for (const s of rep.skills) for (const e of s.evidence) {
      const ev = tr.body.events.find((x: { seq: number }) => x.seq === e.eventSeq);
      expect(ev.body.toLowerCase().replace(/\s+/g, " ")).toContain(e.quote.toLowerCase().replace(/\s+/g, " "));
    }
    // self-ratings 5 vs shown => at least one confidence gap flag is possible; field exists
    expect(rep.skills.every((s) => "confidenceGap" in s)).toBe(true);
  });

  it("a careless run shows gaps, a returning consequence and a confidence gap", async () => {
    const { client } = await setup();
    const c = client();
    await c.enroll("software-engineer", { clarify: 5, verify: 5, conventions: 5, git_hygiene: 5, review_collab: 5 });
    const m = (await c.call("POST", "/missions", { roleId: "software-engineer", mode: "quick" })).body as MissionState;
    let seq = 0;
    const act = async (b: Record<string, unknown>) => (await c.call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b })) as { status: number; body: ActResponse };
    await act({ kind: "save_file", itemId: "it_src", content: m.items.find((i) => i.id === "it_src")!.type === "file" ? "def x():\n    print('fixed')\n" : "" });
    const ms = await act({ kind: "message", to: "priya", channel: "chat", text: "ok" });
    expect(ms.body.delta.canAdvance).toBe(true);
    await act({ kind: "advance" });
    await act({ kind: "run_checks" });
    await act({ kind: "advance" });
    await act({ kind: "submit_artifact", artifactId: "ar_commit", content: "fixed stuff" });
    const pr = await act({ kind: "submit_artifact", artifactId: "ar_pr", content: "done" });
    expect(pr.body.events.some((e) => e.kind === "review_comment" && e.meta?.severity === "blocker")).toBe(true);
    await act({ kind: "advance" });
    const b3 = await c.call("GET", `/missions/${m.id}/events?since=0`);
    expect(b3.body.events.some((e: { kind: string }) => e.kind === "consequence")).toBe(true);
    await act({ kind: "message", to: "priya", channel: "chat", text: "Sure, merging now." });
    const fin = await c.call("POST", `/missions/${m.id}/finish`, {});
    const rep = (await c.call("GET", `/reports/${fin.body.reportId}`)).body as Report;
    expect(rep.consequences.length).toBeGreaterThan(0);
    expect(rep.skills.find((s) => s.skillId === "git_hygiene")!.state).toBe("gap");
    expect(rep.skills.some((s) => s.confidenceGap === "overestimated")).toBe(true);
    expect(rep.nextSteps.length).toBeGreaterThan(0);
    // progress and drills reflect the gaps
    const prog = (await c.call("GET", "/me/progress?roleId=software-engineer")).body;
    expect(prog.nextBestDrill).toBeTruthy();
  });
});
