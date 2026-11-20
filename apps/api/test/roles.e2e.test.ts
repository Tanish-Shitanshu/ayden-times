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
  const state = async () => (await c.call("GET", `/missions/${m.id}`)).body as MissionState;
  const finish = async () => {
    const f = await c.call("POST", `/missions/${m.id}/finish`, {});
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    return (await c.call("GET", `/reports/${f.body.reportId}`)).body as Report;
  };
  return { m, act, say, state, finish, c };
}

const skill = (r: Report, id: string) => r.skills.find((s) => s.skillId === id)!;

describe("Banking Ops", () => {
  it("ideal run is strong; self-approval and tipping off are caught", async () => {
    const { client } = await setup();
    const p = await player(client(), "banking-ops");
    const hit = p.m.items.find((i) => i.id === "it_case_hit")!;
    const hitCase = hit.title.match(/C-\d{3}/)![0];
    const selfCase = p.m.items.find((i) => i.id === "it_case_self")!.title.match(/C-\d{3}/)![0];
    await p.act({ kind: "open_item", itemId: "it_policy" });
    const r1 = await p.say("karan", `I'll start with ${hitCase} because it has a screening hit and the policy says that comes first, then ${selfCase}.`);
    expect(r1.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    const esc = await p.act({ kind: "submit_artifact", artifactId: "ar_escalation", content: `To: Ananya Iyer (Compliance)\nCase: ${hitCase}\nWhat happened: a partial name match of 74% with a watch-list entry.\nWhy it matters: policy says screening hits must be held and escalated.\nEvidence: payment of ₹9,45,000 and three payments just under ₹10,00,000 in 9 days.\nAction taken: I placed the payment on hold and am escalating to Compliance.` });
    expect(esc.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("karan", "I can't approve a payment I prepared. That breaks four-eyes under the policy. Let's get another checker, maybe Ananya.");
    const call = await p.say("caller", "I'm sorry for the delay, Mr Chopra. Your payment is going through standard processing and we will update you this afternoon.");
    expect(call.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    const memo = await p.act({ kind: "submit_artifact", artifactId: "ar_memo", content: `Case: ${hitCase}\nAmount: ₹9,45,000\nPolicy clause: 3 (screening hits are held and escalated)\nWhat I saw: a partial name match of 74% against a watch-list entry and three payments just under the limit in nine days.\nWhat I did: placed the payment on hold at 10:05 and escalated to Ananya in Compliance by email.\nWho I informed and when: Ananya Iyer (Compliance) at 10:06 today; Karan Malhotra (team lead) at 10:10.` });
    expect(memo.delta.canFinish).toBe(true);
    const rep = await p.finish();
    expect(skill(rep, "maker_checker").state).toBe("strong");
    expect(skill(rep, "no_tipping_off").state).toBe("strong");
    expect(skill(rep, "escalate_hold").state).toBe("strong");
    expect(skill(rep, "document_rationale").state).toBe("strong");
  });

  it("self-approval and tipping off return as consequences", async () => {
    const { client } = await setup();
    const p = await player(client(), "banking-ops");
    const hitCase = p.m.items.find((i) => i.id === "it_case_hit")!.title.match(/C-\d{3}/)![0];
    await p.act({ kind: "open_item", itemId: "it_policy" });
    await p.say("karan", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_escalation", content: "please check" });
    await p.act({ kind: "advance" });
    await p.say("karan", "Sure, done, I have released it.");
    await p.say("caller", "There is a compliance flag on your account, that is why it is delayed.");
    await p.act({ kind: "advance" });
    const ev = (await p.c.call("GET", `/missions/${p.m.id}/events?since=0`)).body.events as { kind: string }[];
    expect(ev.filter((e) => e.kind === "consequence").length).toBe(2);
    await p.act({ kind: "submit_artifact", artifactId: "ar_memo", content: `${hitCase} done` });
    const rep = await p.finish();
    expect(skill(rep, "maker_checker").state).toBe("gap");
    expect(skill(rep, "no_tipping_off").anchorsMet).toBeLessThan(2);
    expect(rep.consequences.length).toBe(2);
  });
});

describe("Nurse", () => {
  it("escalates in time with SBAR and protects privacy", async () => {
    const { client } = await setup();
    const p = await player(client(), "nurse");
    await p.act({ kind: "open_item", itemId: "it_handover" });
    await p.say("meera_t", "Is anyone at risk or pending tonight? Anything I should watch overnight?");
    await p.act({ kind: "advance" });
    await p.act({ kind: "open_item", itemId: "it_bed" });
    await p.say("lakshmi", "I'll see the sickest first, that is the bed with the highest score because of the reduced urine output, then Bed 8.");
    await p.act({ kind: "advance" });
    const st = await p.state();
    const rec = st.items.find((i) => i.id === "it_bed")!;
    expect(rec.type).toBe("record");
    const obs = (rec as { fields: { label: string; value: string }[] }).fields.find((f) => f.label.startsWith("Observations"))!.value;
    expect(obs).not.toBe((p.m.items.find((i) => i.id === "it_bed") as { fields: { label: string; value: string }[] }).fields.find((f) => f.label.startsWith("Observations"))!.value);
    const sb = await p.act({ kind: "submit_artifact", artifactId: "ar_sbar", content: `Situation: I am concerned about my patient, the score has risen to 6. Latest obs: ${obs}.\nBackground: admitted with a chest problem, reduced urine output flagged by day staff.\nAssessment: the patient is deteriorating, observations are worse than at handover.\nRecommendation: please come for an urgent review within 30 minutes.` });
    expect(sb.events.some((e) => e.from === "khan" && /20 minutes/.test(e.body))).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("relative", "I'm sorry, I can't share patient information. Please ask the nurse in charge.");
    await p.say("lakshmi", "I won't choose a dose myself. I'll check the drug chart and the order first and confirm with you.");
    const note = await p.act({ kind: "submit_artifact", artifactId: "ar_note", content: `20:15 Observed ${obs} on my patient, score 6. Escalated to Dr Khan using SBAR at 20:20. Informed the charge nurse. Observations to continue every 15 minutes until review.` });
    expect(note.delta.canFinish).toBe(true);
    const rep = await p.finish();
    for (const id of ["escalate_sbar", "scope_safety", "privacy", "document"]) expect(skill(rep, id).state, id).toBe("strong");
    expect(rep.integrity.notes.join(" ")).toMatch(/Not clinically|formative|Training scenario/i);
  });

  it("leaking to a visitor and naming a dose are caught", async () => {
    const { client } = await setup();
    const p = await player(client(), "nurse");
    await p.act({ kind: "open_item", itemId: "it_handover" });
    await p.say("meera_t", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "open_item", itemId: "it_bed" });
    await p.say("lakshmi", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_sbar", content: "patient is unwell" });
    await p.act({ kind: "advance" });
    await p.say("relative", "Mr Das in bed 8 is stable but in pain, he is on paracetamol.");
    await p.say("lakshmi", "OK I will give him 1000 mg now.");
    await p.act({ kind: "submit_artifact", artifactId: "ar_note", content: "gave drug" });
    const rep = await p.finish();
    expect(skill(rep, "privacy").state).not.toBe("strong");
    expect(skill(rep, "scope_safety").signals.find((s) => s.id === "no_dose_decision")!.met).toBe(false);
  });
});

describe("Tech Consulting", () => {
  it("answer-first update with tying numbers is strong; supplier claim triggers a consequence", async () => {
    const { client } = await setup();
    const p = await player(client(), "tech-consulting");
    const margin = p.m.items.find((i) => i.id === "it_margin")!;
    const note = (margin as { note?: string }).note!;
    const [a, b] = [...note.matchAll(/(\d+\.\d)%/g)].map((m) => m[1]!);
    await p.act({ kind: "open_item", itemId: "it_scope" });
    await p.say("rhea", "Is store staffing in scope? And when do you need the headline?");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_tree", content: "Question: why did gross margin fall?\n- Price and discounting\n- Volume and traffic\n- Category mix\n- Supplier cost\nHypothesis: I suspect category mix matters most." });
    await p.act({ kind: "advance" });
    const up = await p.act({ kind: "submit_artifact", artifactId: "ar_update", content: `Hi Rhea,\n\nGross margin fell from ${a}% to ${b}%, driven mainly by a mix shift towards lower-margin categories.\n- The lowest-margin category grew its share of revenue.\n- Supplier prices rose only 1.4%, a small effect.\nCaveat: finance and ops revenue totals differ and need reconciling.` });
    expect(up.delta.canAdvance).toBe(true);
    await p.act({ kind: "advance" });
    await p.say("sethi", "Not quite: the data points to mix shift, not supplier prices. I'm fairly confident, but we will reconcile the data. Rhea will confirm the staffing request and scope, and we will update you tomorrow.");
    await p.say("rhea", "Sethi asked for a store staffing analysis by Monday. That is outside the scope. How should we respond?");
    const rep = await p.finish();
    for (const id of ["structure", "answer_first", "numbers_integrity", "scope_mgmt", "stakeholder_comm"]) expect(skill(rep, id).state, id).toBe("strong");
  });

  it("blaming supplier prices returns as a consequence", async () => {
    const { client } = await setup();
    const p = await player(client(), "tech-consulting");
    await p.act({ kind: "open_item", itemId: "it_scope" });
    await p.say("rhea", "ok");
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_tree", content: "- supplier" });
    await p.act({ kind: "advance" });
    await p.act({ kind: "submit_artifact", artifactId: "ar_update", content: "Supplier prices drove a 73% margin collapse." });
    await p.act({ kind: "advance" });
    const ev = (await p.c.call("GET", `/missions/${p.m.id}/events?since=0`)).body.events as { kind: string }[];
    expect(ev.some((e) => e.kind === "consequence")).toBe(true);
    await p.say("sethi", "Sure, I'll do the staffing analysis by Monday.");
    const rep = await p.finish();
    expect(skill(rep, "numbers_integrity").state).toBe("gap");
    expect(skill(rep, "scope_mgmt").state).not.toBe("strong");
  });
});

describe("Roles listing", () => {
  it("lists five roles with only the built ones ready", async () => {
    const { client } = await setup();
    const roles = (await client().call("GET", "/roles")).body as { id: string; status: string }[];
    expect(roles.length).toBe(5);
    expect(roles.filter((r) => r.status === "ready").map((r) => r.id).sort()).toEqual(["banking-ops", "nurse", "software-engineer", "tech-consulting"]);
    expect(roles.find((r) => r.id === "data-analyst")!.status).toBe("planned");
    const d = (await client().call("GET", "/roles/nurse")).body;
    expect(d.safetyNote).toMatch(/clinician/i);
    expect(d.skills.length).toBe(5);
  });
});
