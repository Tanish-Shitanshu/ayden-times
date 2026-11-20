import type { WorkItem } from "@ayden/contract";
import { int, pick, rng, said } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, ScriptedEvent, Vars } from "../domain/types.js";
import { hit, person, say, section, sys, trapFrom } from "./helpers.js";

const ROLE = "nurse" as const;
const COMPANY = "St. Anne's General Hospital (fictional)";

/** Simplified, fictional early-warning score used only in this training scenario. */
export function score(rr: number, spo2: number, hr: number, sbp: number): number {
  const r = rr >= 25 || rr <= 11 ? 3 : rr >= 21 ? 2 : 0;
  const o = spo2 <= 91 ? 3 : spo2 <= 93 ? 2 : spo2 <= 95 ? 1 : 0;
  const h = hr >= 131 ? 3 : hr >= 111 ? 2 : hr >= 91 ? 1 : 0;
  const s = sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : 0;
  return r + o + h + s;
}

const POLICY = `# Ward 4B policy (fictional training version)

**Early-warning score (simplified, fictional)** = points from four observations:

| Observation | 0 points | 1 point | 2 points | 3 points |
|---|---|---|---|---|
| Respiratory rate | 12-20 | | 21-24 | 25+ or 11 or less |
| Oxygen saturation (SpO2) | 96+ | 94-95 | 92-93 | 91 or less |
| Heart rate | 51-90 | 91-110 | 111-130 | 131+ |
| Systolic BP | 111+ | 101-110 | 91-100 | 90 or less |

**Actions**
- Score **5 or more**: ask the on-call doctor for an **urgent review within 30 minutes**. Use **SBAR** (Situation, Background, Assessment, Recommendation) and quote the latest observations exactly.
- Score **7 or more**: emergency call.
- **Never choose or change a drug or a dose yourself.** Check the drug chart or ask the charge nurse or doctor.
- **Privacy:** share patient information only with people involved in that patient's care. Visitors are directed to the nurse in charge.
- **Document** with the time, the observed values, what you did and who you informed. Facts only.

*Training scenario with a simplified fictional score. Not clinical advice. Not reviewed by a clinician.*
`;

const SKILLS = [
  { id: "prioritise", label: "See the sickest patient first", description: "Read the handover, ask what is at risk and decide who needs you first.", targetLevel: 2, badge: "Prioritised the right patient" },
  { id: "escalate_sbar", label: "Escalate clearly with SBAR", description: "Escalate in time with a structured message that quotes the latest observations.", targetLevel: 3, badge: "Clear, timely SBAR" },
  { id: "scope_safety", label: "Stay inside your scope", description: "Never decide a drug or dose; check the chart or ask.", targetLevel: 2, badge: "Stayed in scope" },
  { id: "privacy", label: "Protect patient privacy", description: "Do not share one patient's information with a visitor.", targetLevel: 2, badge: "Protected privacy" },
  { id: "document", label: "Document accurately and on time", description: "Record time, values and who was informed, as facts.", targetLevel: 2, badge: "Accurate documentation" },
];

const b3 = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.b3Seq ?? Number.POSITIVE_INFINITY);

function sbarParts(t: string) {
  return {
    s: section(t, /^(s\b|situation)/i),
    b: section(t, /^(b\b|background)/i),
    a: section(t, /^(a\b|assessment)/i),
    r: section(t, /^(r\b|recommendation|request)/i),
  };
}

const ANCHORS: AnchorDef[] = [
  {
    id: "opened_bed", skillId: "prioritise", kind: "code", text: "Opened the deteriorating patient's record",
    eval: (c) => ({ met: c.session.openedAt["it_bed"] !== undefined, seq: c.session.openedAt["it_bed"] ? Math.floor(c.session.openedAt["it_bed"]) : undefined, note: `You never opened Bed ${c.vars.bed}.` }),
  },
  {
    id: "asked_handover", skillId: "prioritise", kind: "judge", text: "Asked the outgoing nurse what is pending or at risk",
    judgeInstruction: "Did the learner ask the outgoing nurse about anything pending, at risk, or worrying?",
    eval: (c) => hit(said(c.events, /(pending|at risk|concern|watch|worr|anything|overnight|urine|obs|deteriorat|unwell|flag)/i, { to: "meera_t" })),
  },
  {
    id: "order_with_reason", skillId: "prioritise", kind: "judge", text: "Told the charge nurse the order of rounds with a reason",
    judgeInstruction: "Did the learner state an order for seeing patients and give a reason (score, risk, concern)?",
    eval: (c) => {
      const e = said(c.events, /(first|then|priorit|sickest|bed ?\d)/i, { to: "lakshmi", before: b3(c) });
      return e && /(because|since|score|worr|deteriorat|unwell|risk|pending|concern)/i.test(e.body) ? { met: true, seq: e.seq, quote: e.body.slice(0, 120) } : { met: false };
    },
  },
  {
    id: "escalated_within_30", skillId: "escalate_sbar", kind: "code", text: "Escalated within 30 simulated minutes of a score of 5+",
    eval: (c) => {
      const a = Number(c.session.flags.escalatedMin ?? NaN);
      const b = Number(c.session.flags.ewsMin ?? NaN);
      return { met: Number.isFinite(a) && Number.isFinite(b) && a - b <= 30, note: Number.isFinite(a) ? `You escalated ${a - b} minutes after the score rose.` : "You never escalated." };
    },
  },
  {
    id: "sbar_vitals_exact", skillId: "escalate_sbar", kind: "code", text: "Quoted the latest observations exactly",
    eval: (c) => {
      const t = c.artifacts["ar_sbar"] ?? "";
      const vals = [c.vars.rr2, c.vars.spo2_2, c.vars.hr2, c.vars.sbp2].map((v) => new RegExp(`(^|\\D)${v}(\\D|$)`));
      return { met: vals.filter((re) => re.test(t)).length >= 3, seq: c.session.artifacts["ar_sbar"]?.seq, note: "Quote at least three of the four latest observations exactly as recorded." };
    },
  },
  {
    id: "sbar_sba", skillId: "escalate_sbar", kind: "judge", text: "States Situation, Background and Assessment",
    judgeInstruction: "Does the SBAR clearly give a Situation, a Background and an Assessment?",
    eval: (c) => {
      const p = sbarParts(c.artifacts["ar_sbar"] ?? "");
      return { met: [p.s, p.b, p.a].filter((x) => x.length >= 15).length === 3, seq: c.session.artifacts["ar_sbar"]?.seq, note: "Label and complete S, B and A." };
    },
  },
  {
    id: "sbar_recommendation", skillId: "escalate_sbar", kind: "code", text: "Ends with a clear Recommendation or request",
    eval: (c) => {
      const p = sbarParts(c.artifacts["ar_sbar"] ?? "");
      return { met: p.r.length >= 15 && /(review|come|assess|see|attend|urgent|examin|advise|order)/i.test(p.r), seq: c.session.artifacts["ar_sbar"]?.seq, quote: p.r.slice(0, 110) || undefined, note: "End with a clear request, for example an urgent review." };
    },
  },
  {
    id: "no_dose_decision", skillId: "scope_safety", kind: "code", text: "Never decided a drug or dose",
    eval: (c) => {
      const bad = c.learner.find((e) => e.kind === "message" && /\b\d+(\.\d+)?\s?(mg|mcg|ml|g|units?)\b/i.test(e.body));
      return { met: !bad, seq: bad?.seq, quote: bad?.body.match(/\b\d+(\.\d+)?\s?(mg|mcg|ml|g|units?)\b/i)?.[0], note: "You named a dose. Doses come from the chart or a prescriber." };
    },
  },
  {
    id: "checked_chart", skillId: "scope_safety", kind: "judge", text: "Checked the chart or asked instead of acting on a hunch",
    judgeInstruction: "Did the learner say they would check the drug chart/order or ask the charge nurse or doctor before giving anything?",
    eval: (c) => hit(said(c.events, /(chart|order|prescri|check|verify|confirm|due|last given|ask (the )?(doctor|dr))/i, { to: "lakshmi", after: b3(c) })),
  },
  {
    id: "said_wont", skillId: "scope_safety", kind: "judge", text: "Said what they would not do",
    judgeInstruction: "Did the learner clearly say what they would NOT do (for example not choose a dose themselves)?",
    eval: (c) => hit(said(c.events, /(won'?t|will not|can'?t|cannot|not going to|shouldn'?t|outside|not my|until i)/i, { to: "lakshmi", after: b3(c) })),
  },
  {
    id: "no_leak_to_visitor", skillId: "privacy", kind: "code", text: "Shared nothing about Bed 8 with the visitor",
    eval: (c) => {
      const bad = c.learner.find((e) => e.kind === "message" && e.to === "relative" && /(bed ?8|mr\.? das|pain|doing (well|fine|ok)|stable|condition|vitals|\bobs\b|medication|paracetamol|surgery|operation)/i.test(e.body));
      return { met: !bad, seq: bad?.seq, quote: bad?.body.slice(0, 100), note: "You shared patient details with a visitor." };
    },
  },
  {
    id: "offered_alternative", skillId: "privacy", kind: "judge", text: "Offered a polite alternative",
    judgeInstruction: "Did the learner politely decline and point the visitor to an alternative (ask the patient, the nurse in charge, or explain privacy)?",
    eval: (c) => hit(said(c.events, /(can'?t share|unable to share|privacy|confidential|ask (the )?(patient|nurse in charge|charge nurse)|speak to|nurse in charge|patient (can|himself))/i, { to: "relative" })),
  },
  {
    id: "note_complete", skillId: "document", kind: "code", text: "Note has time, observed values and who was informed",
    eval: (c) => {
      const n = c.artifacts["ar_note"] ?? "";
      return { met: /(\d{1,2}[:.]\d{2})/.test(n) && [c.vars.rr2, c.vars.spo2_2, c.vars.hr2, c.vars.sbp2].some((v) => new RegExp(`(^|\\D)${v}(\\D|$)`).test(n)) && /(informed|called|escalated|dr\.?|doctor|khan)/i.test(n), seq: c.session.artifacts["ar_note"]?.seq, note: "Include the time, the observed values and who you informed." };
    },
  },
  {
    id: "no_assumptions", skillId: "document", kind: "judge", text: "No assumptions written as facts",
    judgeInstruction: "Is the note free of guesses or diagnoses written as if they were facts?",
    eval: (c) => ({ met: !!c.artifacts["ar_note"] && !/(probably|i think|seems like|obviously|must be|sepsis|infection|pneumonia|he has)/i.test(c.artifacts["ar_note"]!), seq: c.session.artifacts["ar_note"]?.seq, note: "Avoid guesses and diagnoses." }),
  },
  {
    id: "factual_tone", skillId: "document", kind: "judge", text: "Factual and specific",
    judgeInstruction: "Is the note specific and factual (what was observed and done) rather than vague?",
    eval: (c) => ({ met: (c.artifacts["ar_note"] ?? "").split(/\s+/).length >= 25, seq: c.session.artifacts["ar_note"]?.seq, note: "Add specific, factual detail." }),
  },
];

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { vars: V, drill } = args;
  const sc1 = score(+V.rr1!, +V.spo2_1!, +V.hr1!, +V.sbp1!);
  const sc2 = score(+V.rr2!, +V.spo2_2!, +V.hr2!, +V.sbp2!);
  const rec = (rr: string, sp: string, hr: string, bp: string, sc: number, when: string): WorkItem => ({
    id: "it_bed", type: "record", title: `Bed ${V.bed} · ${V.initials}, ${V.age}`,
    fields: [{ label: "Reason for admission", value: V.reason! }, { label: "Observations at " + when, value: `RR ${rr}, SpO2 ${sp}%, HR ${hr}, BP ${bp}/60` }, { label: "Early-warning score", value: String(sc) }, { label: "Day staff note", value: "Reduced urine output flagged this afternoon. Keep a close eye on obs." }],
    note: "Fictional patient. Simplified score for training.",
  });
  const items: WorkItem[] = [
    { id: "it_policy", type: "doc", title: "Ward 4B policy and score", markdown: POLICY },
    { id: "it_handover", type: "table", title: "Handover list", columns: ["Bed", "Patient", "Reason", "Last obs", "Score", "Pending"], rows: JSON.parse(V.handoverJson!), note: "Fictional patients." },
    rec(V.rr1!, V.spo2_1!, V.hr1!, V.sbp1!, sc1, "19:30"),
    { id: "it_bed8", type: "record", title: "Bed 8 · Mr Das, 71", fields: [{ label: "Reason", value: "Post-operative day 2" }, { label: "Pain", value: "Reports pain 6/10 tonight" }, { label: "Drug chart", value: "Paracetamol PRN is ordered. Last given 04:00 by day staff. Next due after 10:00. Dose is on the prescription chart." }, { label: "Observations", value: "Stable" }], note: "Fictional patient." },
  ];
  const allBeats = [
    {
      title: "Receive the handover",
      objective: "Read the handover list and the ward policy. Ask Sister Meera what is pending or at risk.",
      onEnter: [say("meera_t", V.weaveOpening ?? "Good evening. Here is the handover list. Beds 3, 6, 8 and 11. Ask me anything before I leave.", { quickReplies: ["Is anyone at risk tonight?", "What is pending?"] })],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_handover" }, { t: "messaged" as const, to: "meera_t", n: 1 }] },
    },
    {
      title: "First round",
      objective: `Open each patient's record, then tell Lakshmi the order you will see patients in, and why.`,
      onEnter: [
        say("lakshmi", "Start your round. Tell me the order you'll see them in and why. Record obs on time."),
        sys(`20:10 · Observations recorded for Bed ${V.bed}: RR ${V.rr2}, SpO2 ${V.spo2_2}%, HR ${V.hr2}, BP ${V.sbp2}/60. Early-warning score ${sc2}.`, { clockJump: 40, itemUpdate: rec(V.rr2!, V.spo2_2!, V.hr2!, V.sbp2!, sc2, "20:10"), setFlags: { ewsMin: -1 } }),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_bed" }, { t: "messaged" as const, to: "lakshmi", n: 1 }] },
    },
    {
      title: "Escalate",
      objective: `Bed ${V.bed} now scores ${sc2}. Per policy, escalate to Dr Khan with an SBAR that quotes the latest observations.`,
      onEnter: [say("lakshmi", `I see Bed ${V.bed} has gone up. What are you going to do?`)],
      advanceWhen: { t: "flag" as const, key: "escalated" },
    },
    {
      title: "Visitor, scope and documentation",
      objective: "Reply to the visitor and to Lakshmi, then write your note for the patient you escalated.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (Number(ctx.session.flags.escalatedMin ?? 0) - Number(ctx.session.flags.ewsMin ?? 0) > 30) out.push({ from: "lakshmi", to: "you", channel: "chat", kind: "consequence", body: `A rapid response was called for Bed ${V.bed}. What delayed your escalation? Please note it.`, setFlags: { delayedEscalation: true } });
        out.push(
          say("relative", "Hello, I'm visiting. My neighbour's father is in Bed 8, Mr Das. How is he doing tonight? Is he in pain? Can you tell me about his medication?"),
          say("lakshmi", "Bed 8 says his pain is 6 out of 10. The day team said paracetamol is fine. Just give him whatever you think is right, I'm tied up here.", { setFlags: { b3Seq: -1 } }),
        );
        return out;
      },
      advanceWhen: { t: "all" as const, of: [{ t: "artifact" as const, id: "ar_note" }, { t: "messaged" as const, to: "relative", n: 1, scope: "beat" as const }, { t: "messaged" as const, to: "lakshmi", n: 1, scope: "beat" as const }] },
    },
  ];
  const keep = drill ? drill.beats : allBeats.map((_b, i) => i);
  const beats = keep.map((i) => allBeats[i]!);
  if (drill) {
    const first = beats[0]!;
    const prev = first.onEnter;
    first.onEnter = ((ctx: EngineCtx) => [sys(`Practice drill: ${drill.title}. ${drill.hint}`, { kind: "notice" }), ...(typeof prev === "function" ? prev(ctx) : (prev ?? []))]) as never;
  }
  return {
    title: drill ? `Drill: ${drill.title}` : "Night shift handover on Ward 4B",
    company: COMPANY,
    hint: drill?.hint,
    clockStart: { day: "Tue", minute: 19 * 60 + 30 },
    clockTotal: 300,
    people: [
      person("meera_t", "Sr. Meera Thomas", "Outgoing nurse", 140, "You are handing over after a long day. You are kind and a little rushed. You share what you know when asked directly, and you know Bed " + V.bed + " had reduced urine output flagged by day staff.", ["That's everything on the list. Ask me if you need anything else.", "I think that's all, but check the records."]),
      person("khan", "Dr Sameer Khan", "On-call doctor", 210, "You are the on-call doctor and you are busy. You want a structured SBAR with the latest observations and a clear request. If the call is vague you ask for what is missing. You never tell the nurse what dose to give without seeing the patient.", ["Please send me a proper SBAR so I have everything in one place.", "Give me the latest obs and what you need from me."]),
      person("lakshmi", "Lakshmi Pillai", "Charge Nurse", 30, "You are the charge nurse. You are busy and sometimes careless in your phrasing (you may say 'just give whatever you think is right'). You expect juniors to check the chart rather than guess.", ["Sensible. Keep me posted.", "Check the chart if you're unsure."]),
      person("relative", "Visitor", "Visitor", 280, "You are a worried visitor who wants to know about a patient who is not your relative. You ask politely but keep asking for details. You do not know anything about hospital policy.", ["I'm just very worried. Can you tell me anything at all?", "Surely you can say if he's okay?"]),
    ],
    items,
    artifacts: [
      { id: "ar_sbar", kind: "sbar", title: `SBAR to Dr Khan for Bed ${V.bed}`, instructions: "Write the SBAR you would give the on-call doctor. Quote the latest observations exactly.", template: "Situation:\nBackground:\nAssessment:\nRecommendation:\n", required: true, maxChars: 1500 },
      { id: "ar_note", kind: "text", title: `Nursing note for Bed ${V.bed}`, instructions: "Write the note for the record: time, observed values, what you did, who you informed. Facts only.", template: "Time:\nObservations:\nAction:\nInformed:\n", required: true, maxChars: 1500 },
    ],
    beats,
    triggers: [],
    replies: {
      meera_t: [
        { match: /(urine|pending|risk|concern|watch|overnight|anything|worr|unwell)/i, text: `Yes, Bed ${V.bed} had reduced urine output flagged by day staff. Keep a close eye on obs. Bed 8 has some pain, check the chart.` },
      ],
      lakshmi: [{ match: /(first|order|bed ?\d|round|priorit)/i, text: "Sensible. Don't forget to record obs on time." }],
      khan: [{ match: /./, text: "Please send me a proper SBAR with the latest observations and what you need from me." }],
      relative: [{ match: /(can'?t|privacy|confidential|nurse in charge|ask)/i, text: "Oh, I understand. I'll ask at the desk then." }],
    },
    facts: [
      { id: "urine-output", text: `Bed ${V.bed} had reduced urine output flagged by day staff.`, knownBy: ["meera_t", "lakshmi"], leak: [/urine output/i] },
      { id: "bed8-details", text: "Mr Das (Bed 8) is post-operative day 2 with pain 6/10 and a PRN paracetamol order.", knownBy: ["meera_t", "lakshmi"], leak: [/mr\.? das/i, /paracetamol/i, /post-?op/i] },
    ],
    cost: { message: 2, open: 1, checks: 0, submit: 3, advance: 2 },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "opened_bed", "Missing the deteriorating patient", "deteriorating-patient"),
      trapFrom(ANCHORS, "escalated_within_30", "Late escalation", "late-escalation"),
      trapFrom(ANCHORS, "sbar_sba", "Unstructured escalation", "unstructured-sbar"),
      trapFrom(ANCHORS, "no_dose_decision", "Deciding a dose", "dose"),
      trapFrom(ANCHORS, "no_leak_to_visitor", "Sharing with a visitor", "visitor-privacy"),
    ],
    judgeContext: `A newly qualified nurse starting a night shift on a general medical ward (fictional, simplified scoring). Bed ${V.bed}'s early-warning score rises from ${sc1} to ${sc2}; policy says escalate within 30 minutes using SBAR. A visitor asks about another patient (privacy). The charge nurse carelessly says to give whatever dose the learner thinks is right (scope).`,
    onSubmit: async (ctx) => {
      if (ctx.artifactId !== "ar_sbar") return { events: [] };
      const p = sbarParts(ctx.content);
      const vals = [V.rr2, V.spo2_2, V.hr2, V.sbp2].filter((v) => new RegExp(`(^|\\D)${v}(\\D|$)`).test(ctx.content)).length;
      const missing: string[] = [];
      if (![p.s, p.b, p.a].every((x) => x.length >= 15)) missing.push("a clear Situation, Background and Assessment");
      if (vals < 3) missing.push("the latest observations");
      if (!(p.r.length >= 15)) missing.push("what you want me to do");
      const complete = missing.length === 0;
      const ev: ScriptedEvent[] = [
        sys(`SBAR sent to Dr Khan for Bed ${V.bed}.`, { setFlags: { escalated: true, escalatedMin: -1, sbarComplete: complete } }),
        complete
          ? say("khan", `Thanks, that's clear. I'll be there within 20 minutes. Keep obs every 15 minutes until I arrive.`, { rephrase: { personId: "khan", mustContain: ["20 minutes"] } })
          : say("khan", `I need ${missing.join(" and ")}. Please be more specific and tell me what you want me to do. I'll come, but this was not a clear call.`, { rephrase: { personId: "khan", mustContain: ["specific"] } }),
      ];
      return { events: ev, setFlags: { escalated: true } };
    },
  };
}

const varsFor = (seed: string): Vars => {
  const r = rng(seed);
  const bed = pick(r, ["4", "5", "6", "7"]);
  const patterns = [
    { rr1: 20, spo2_1: 95, hr1: 96, sbp1: 112, rr2: 23, spo2_2: 93, hr2: 104, sbp2: 102 },
    { rr1: 19, spo2_1: 96, hr1: 92, sbp1: 115, rr2: 22, spo2_2: 92, hr2: 108, sbp2: 100 },
    { rr1: 21, spo2_1: 95, hr1: 88, sbp1: 110, rr2: 24, spo2_2: 93, hr2: 106, sbp2: 99 },
  ];
  const p = pick(r, patterns);
  const initials = pick(r, ["S.K.", "R.M.", "A.P.", "N.T.", "V.R."]);
  const age = int(r, 58, 79);
  const reason = pick(r, ["Chest infection", "Urinary sepsis query", "Heart failure review", "Post-operative day 3"]);
  const rows = [
    ["3", "M.D., 64", "COPD review", "19:00", 0, "Nebuliser at 22:00"],
    [bed, `${initials}, ${age}`, reason, "19:30", score(p.rr1, p.spo2_1, p.hr1, p.sbp1), "Obs every 4 hours"],
    ["8", "Mr Das, 71", "Post-operative day 2", "19:30", 1, "Pain review"],
    ["11", "L.G., 55", "Observation", "19:15", 0, "None"],
  ];
  return { bed, initials, age: String(age), reason, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])), handoverJson: JSON.stringify(rows), topic: "night shift handover" };
};

const MISSION: MissionDef = {
  id: "nurse-night-handover",
  title: "Night shift handover on Ward 4B",
  kind: "mission",
  estMinutes: 20,
  description: "Take handover, spot the patient who is getting worse, escalate with SBAR in time, protect another patient's privacy, avoid choosing a dose, and document what happened.",
  skillIds: SKILLS.map((s) => s.id),
  variants: 3,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "nurse-drill-sbar", skillId: "escalate_sbar", title: "Escalate a deteriorating patient with SBAR", description: "A fresh patient whose score rises. Quote the observations and make a clear request.", estMinutes: 8, missionId: MISSION.id, beats: [1, 2], hint: "S, B, A, R. Quote the latest values exactly. End with a clear request.", descriptor: "sbar escalate doctor score deteriorating observations recommendation" },
  { id: "nurse-drill-privacy", skillId: "privacy", title: "Answer a visitor without sharing", description: "A visitor asks about another patient. Decline politely and point them to the right person.", estMinutes: 5, missionId: MISSION.id, beats: [3], hint: "Say you cannot share and point to the nurse in charge or the patient.", descriptor: "privacy visitor confidential decline alternative nurse in charge" },
  { id: "nurse-drill-scope", skillId: "scope_safety", title: "When the charge nurse says 'just give whatever'", description: "Stay inside your scope when asked to choose a dose.", estMinutes: 5, missionId: MISSION.id, beats: [3], hint: "Check the chart or ask. Say what you will not do.", descriptor: "scope drug dose chart check ask refuse" },
  { id: "nurse-drill-note", skillId: "document", title: "Write a note that holds up", description: "Document time, values, action and who was informed.", estMinutes: 6, missionId: MISSION.id, beats: [3], hint: "Time, observed values, what you did, who you informed. Facts only.", descriptor: "document note time values informed facts assumptions" },
  { id: "nurse-drill-prioritise", skillId: "prioritise", title: "Decide who you see first", description: "A fresh handover. Find the patient at risk and say why.", estMinutes: 6, missionId: MISSION.id, beats: [0, 1], hint: "Ask what is pending or at risk. Open every record. Explain your order.", descriptor: "prioritise handover at risk first round order reason" },
];

export const nurse: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Staff Nurse (Ward)",
  tagline: "A night-shift handover where the details matter.",
  domain: "Healthcare",
  company: COMPANY,
  estMinutes: 20,
  icon: "stethoscope",
  accentHex: "#1e8e3e",
  description: "Take handover on a general medical ward, spot the patient who is getting worse, escalate to the on-call doctor with SBAR in time, protect another patient's privacy, stay inside your scope when someone says 'give whatever you think', and document what you did.",
  whatYouWillPractise: ["Reading a handover and asking what is at risk", "Escalating a deteriorating patient with SBAR", "Quoting observations exactly", "Staying inside your scope (never choosing a dose)", "Protecting patient privacy and documenting accurately"],
  safetyNote: "Training scenario with a simplified fictional early-warning score. Not clinical advice. Not reviewed by a clinician. It never asks you to choose a drug or a dose.",
  skills: SKILLS,
  anchors: ANCHORS,
  cast: [
    { id: "meera_t", name: "Sr. Meera Thomas", title: "Outgoing nurse", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Hands over. Shares what is at risk if you ask directly." },
    { id: "khan", name: "Dr Sameer Khan", title: "On-call doctor", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Busy. Wants a structured SBAR with exact observations." },
    { id: "lakshmi", name: "Lakshmi Pillai", title: "Charge Nurse", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Sometimes careless with words. Expects you to check the chart." },
    { id: "relative", name: "Visitor", title: "Visitor", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Asks about a patient who is not their relative." },
  ],
  rampMap: [
    { id: "nurse-orient", typicalWeek: 1, title: "Practise taking handover and seeing the sickest first", description: "Orientation week: handover and prioritising.", skillIds: ["prioritise"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["prioritise"] },
    { id: "nurse-escalate", typicalWeek: 2, title: "Escalate a deteriorating patient", description: "Structured escalation with SBAR.", skillIds: ["escalate_sbar"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["escalate_sbar"] },
    { id: "nurse-scope", typicalWeek: 2, title: "Work safely inside your scope", description: "Check charts, never guess doses.", skillIds: ["scope_safety", "privacy"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["scope_safety", "privacy"] },
    { id: "nurse-doc", typicalWeek: 4, title: "Pass a documentation check", description: "Accurate, timed, factual notes.", skillIds: ["document"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["document"] },
    { id: "nurse-discharge", typicalWeek: 8, title: "Coordinate a discharge", description: "Planned for a later version.", skillIds: [], coveredBy: null },
    { id: "nurse-lead", typicalWeek: 12, title: "Lead part of a shift", description: "Planned for a later version.", skillIds: [], coveredBy: null },
  ],
  missions: [MISSION],
  drills: DRILLS,
};
