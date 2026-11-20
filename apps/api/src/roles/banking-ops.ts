import type { WorkItem } from "@ayden/contract";
import { int, pick, rng, said } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, ScriptedEvent, Vars } from "../domain/types.js";
import { hit, person, say, sys, trapFrom } from "./helpers.js";

const ROLE = "banking-ops" as const;
const COMPANY = "Kestrel Bank (fictional)";

const POLICY = `# Payments & KYC Desk Policy (v3, fictional training policy)

1. **Work the queue by SLA and risk.** Earliest SLA first; screening hits and unusual patterns jump the queue.
2. **Four-eyes (maker-checker).** Any payment of ₹10,00,000 or more needs a checker who is **not** the maker. You may never approve a payment you prepared.
3. **Screening hits.** If a customer name partly matches the watch list, **place the payment on hold** and **escalate to Compliance** (Ananya Iyer) before anything is released. Do not decide alone.
4. **No tipping off.** Never tell a customer or a relationship manager that an alert, flag, screening hit or review exists. Say only that the payment is under standard processing and you will update them.
5. **Document the rationale.** Every decision needs a case note: case id, amount, policy clause, what you saw, what you did, who you informed and when. Facts, not opinions.
6. **Escalation message** must say what happened, why it matters, and the evidence.

*This is a simplified, fictional training policy. It is not legal or compliance advice.*
`;

const SKILLS = [
  { id: "prioritise_queue", label: "Work the queue by risk and deadline", description: "Read the policy, then decide what to handle first and say why.", targetLevel: 2, badge: "Prioritised by risk" },
  { id: "maker_checker", label: "Four-eyes: never approve your own work", description: "Decline requests to approve a payment you prepared, and name the control.", targetLevel: 2, badge: "Held the four-eyes line" },
  { id: "escalate_hold", label: "Hold and escalate, don't decide alone", description: "Place suspicious items on hold and escalate with what, why and evidence.", targetLevel: 2, badge: "Held and escalated cleanly" },
  { id: "no_tipping_off", label: "Don't reveal alerts to customers", description: "Give a neutral status update without mentioning flags, screening or reviews.", targetLevel: 2, badge: "Neutral with customers" },
  { id: "document_rationale", label: "Write a rationale an auditor accepts", description: "Record case id, amount, policy clause, facts, who was informed and when.", targetLevel: 2, badge: "Audit-ready notes" },
];

const TIP = /(alert|flag(ged)?|screening|investigat|watch ?list|suspicio|sanction|compliance|review(ing)? (of )?(your|the) (account|case))/i;
const REFUSE = /(can'?t|cannot|won'?t|shouldn'?t|not (allowed|able|possible)|four[- ]eyes|maker|checker|another|different|someone else|policy|against)/i;
const AGREE = /(^|\b)(ok(ay)?|sure|will do|done|released|approved?|yes|go ahead|no problem)\b/i;

const b3 = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.b3Seq ?? Number.POSITIVE_INFINITY);
const caseId = (v: Vars) => v.hitCase!;

const ANCHORS: AnchorDef[] = [
  {
    id: "opened_policy", skillId: "prioritise_queue", kind: "code", text: "Read the policy before working",
    eval: (c) => ({ met: c.session.openedAt["it_policy"] !== undefined, seq: c.session.openedAt["it_policy"] ? Math.floor(c.session.openedAt["it_policy"]) : undefined, note: "The policy was never opened." }),
  },
  {
    id: "first_case_by_risk", skillId: "prioritise_queue", kind: "code", text: "Put the highest-risk or earliest-SLA case first",
    eval: (c) => {
      const e = c.learner.find((x) => x.kind === "message" && x.to === "karan" && /C-\d{3}/.test(x.body));
      const first = e?.body.match(/C-\d{3}/)?.[0];
      const ok = !!first && [c.vars.hitCase, c.vars.slaCase].includes(first);
      return { met: ok, seq: e?.seq, quote: first, note: "Tell Karan your order; start with the screening hit or the case about to breach SLA." };
    },
  },
  {
    id: "explained_order", skillId: "prioritise_queue", kind: "judge", text: "Explained the order briefly",
    judgeInstruction: "Did the learner explain why they chose this order (risk, SLA or policy)?",
    eval: (c) => hit(said(c.events, /(because|since|sla|risk|deadline|policy|screening|breach)/i, { to: "karan", before: b3(c) })),
  },
  {
    id: "did_not_self_approve", skillId: "maker_checker", kind: "code", text: "Did not approve your own payment",
    eval: (c) => ({ met: !c.session.flags.selfApproved, note: "You agreed to release a payment you prepared." }),
  },
  {
    id: "declined_naming_control", skillId: "maker_checker", kind: "judge", text: "Declined politely and named the control",
    judgeInstruction: "Did the learner decline to approve their own payment and name the control (four-eyes / maker-checker / policy)?",
    eval: (c) => hit(said(c.events, /(four[- ]eyes|maker|checker|policy|control|not allowed|can'?t approve (my|a payment i))/i, { to: "karan", after: b3(c) })),
  },
  {
    id: "proposed_alt_checker", skillId: "maker_checker", kind: "judge", text: "Proposed another checker",
    judgeInstruction: "Did the learner propose another person as the checker, or offer a safe alternative?",
    eval: (c) => hit(said(c.events, /(another|different|someone else|second|other) (checker|person|approver|colleague|team ?lead)|ask ananya|get (someone|ananya|another)/i, { to: "karan", after: b3(c) })),
  },
  {
    id: "placed_hold", skillId: "escalate_hold", kind: "code", text: "Placed the payment on hold",
    eval: (c) => ({ met: /\bhold\b/i.test(c.artifacts["ar_escalation"] ?? ""), seq: c.session.artifacts["ar_escalation"]?.seq, quote: (c.artifacts["ar_escalation"] ?? "").match(/[^.\n]*\bhold\b[^.\n]*/i)?.[0]?.slice(0, 120), note: "Say that you placed the payment on hold." }),
  },
  {
    id: "escalated_to_compliance", skillId: "escalate_hold", kind: "code", text: "Escalated to Compliance before any release",
    eval: (c) => ({ met: /(ananya|compliance)/i.test(c.artifacts["ar_escalation"] ?? ""), seq: c.session.artifacts["ar_escalation"]?.seq, note: "Name Compliance (Ananya) in the escalation." }),
  },
  {
    id: "states_what_why_evidence", skillId: "escalate_hold", kind: "judge", text: "Escalation states what, why and the evidence",
    judgeInstruction: "Does the escalation state what happened, why it matters, and the evidence (case id, name match, amount or pattern)?",
    eval: (c) => {
      const t = c.artifacts["ar_escalation"] ?? "";
      return { met: t.includes(caseId(c.vars)) && /(match|screen)/i.test(t) && /(₹|rs\.?|inr|\d{4,})/i.test(t), seq: c.session.artifacts["ar_escalation"]?.seq, note: "Include the case id, the name match and the amount." };
    },
  },
  {
    id: "no_alert_words", skillId: "no_tipping_off", kind: "code", text: "Never mentioned alerts or reviews to the customer or RM",
    eval: (c) => {
      const bad = c.learner.find((e) => e.kind === "message" && (e.to === "caller" || e.to === "vikram") && TIP.test(e.body));
      return { met: !bad, seq: bad?.seq, quote: bad ? bad.body.match(TIP)?.[0] : undefined, note: "You mentioned an alert or review to the customer or RM." };
    },
  },
  {
    id: "neutral_reply", skillId: "no_tipping_off", kind: "judge", text: "Offered a neutral status update",
    judgeInstruction: "Did the learner give the customer a neutral update (standard processing, will update, apologise for the wait) without revealing any alert?",
    eval: (c) => hit(said(c.events, /(standard|routine|usual|regular) (review|check|process|processing)|will (update|get back)|apologi[sz]e|sorry for the (wait|delay)/i, { to: "caller" })),
  },
  {
    id: "memo_cites", skillId: "document_rationale", kind: "code", text: "Memo cites case id, amount and policy clause",
    eval: (c) => {
      const m = c.artifacts["ar_memo"] ?? "";
      return { met: m.includes(caseId(c.vars)) && /(₹|rs\.?|inr|\d{4,})/i.test(m) && /(clause|policy|section|rule|\b[1-6]\b\.)/i.test(m), seq: c.session.artifacts["ar_memo"]?.seq, note: "Cite the case id, the amount and the policy clause." };
    },
  },
  {
    id: "memo_who_when", skillId: "document_rationale", kind: "code", text: "Memo says who was informed and when",
    eval: (c) => {
      const m = c.artifacts["ar_memo"] ?? "";
      return { met: /(ananya|compliance)/i.test(m) && /(\d{1,2}[:.]\d{2}|today|minutes?|hrs?|hours?|at \d)/i.test(m), seq: c.session.artifacts["ar_memo"]?.seq, note: "Say who you informed and when." };
    },
  },
  {
    id: "memo_facts", skillId: "document_rationale", kind: "judge", text: "Facts, not opinions",
    judgeInstruction: "Is the case note factual (what was seen, done, and who was informed) without accusations or speculation?",
    eval: (c) => {
      const m = c.artifacts["ar_memo"] ?? "";
      return { met: m.split(/\s+/).length >= 35 && !/(obviously|clearly guilty|definitely|criminal|launder(er|ing) for sure|i think he is)/i.test(m), seq: c.session.artifacts["ar_memo"]?.seq, note: "Keep to facts and write enough detail." };
    },
  },
];

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { vars, drill } = args;
  const V = vars;
  const rows: (string | number)[][] = JSON.parse(V.queueJson!);
  const items: WorkItem[] = [
    { id: "it_policy", type: "doc", title: "Payments & KYC Desk Policy", markdown: POLICY },
    { id: "it_queue", type: "table", title: "Work queue", columns: ["Case", "Customer", "Type", "Amount (₹)", "SLA left", "Flags"], rows, note: "Fictional data for training." },
    { id: "it_case_hit", type: "record", title: `Case ${V.hitCase} · KYC file`, fields: [
      { label: "Customer", value: V.hitName! }, { label: "Account age", value: "14 months" }, { label: "Payment", value: `₹${V.hitAmountFmt} to an overseas supplier` },
      { label: "Name screening", value: `Partial match (${V.matchPct}%) with a fictional watch-list entry: ${V.listName}` },
      { label: "Pattern", value: "Three payments just under ₹10,00,000 in 9 days" }, { label: "Prepared by", value: "Another associate (Rahul)" } ] },
    { id: "it_case_self", type: "record", title: `Case ${V.selfCase} · Payment you prepared`, fields: [
      { label: "Customer", value: V.selfName! }, { label: "Payment", value: `₹${V.selfAmountFmt} to a domestic vendor` }, { label: "Prepared by", value: "You (maker)" }, { label: "Checker", value: "Not assigned" }, { label: "Screening", value: "Clear" } ] },
  ];
  const allBeats = [
    {
      title: "Triage the queue",
      objective: "Read the policy and open the queue. Tell Karan which case you will work first and why.",
      onEnter: [say("karan", V.weaveOpening ?? `Morning. Queue is heavy: five cases, SLAs are tight. Read the policy and tell me what you're picking up first.`, { quickReplies: ["I'll start with the highest-risk case", "Which one is closest to SLA?"] })],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_policy" }, { t: "messaged" as const, to: "karan", n: 1 }] },
    },
    {
      title: `Work case ${V.hitCase}`,
      objective: `Case ${V.hitCase} has a name-screening hit. Handle it by the policy: hold it and escalate to Compliance with an email.`,
      onEnter: [say("karan", `Good. Open case ${V.hitCase}. Do whatever the policy says. I need to release things before noon.`), sys("New item available: KYC file for the screening-hit case.")],
      advanceWhen: { t: "artifact" as const, id: "ar_escalation" },
    },
    {
      title: "Handle the pressure",
      objective: "Karan, a relationship manager and a customer all want something. Reply to Karan and to the caller, then continue.",
      onEnter: [
        say("karan", `Quick one: case ${V.selfCase} is the ₹${V.selfAmountFmt} payment you prepared. I'll approve it verbally, you're the checker too, so just click release.`, { setFlags: { b3Seq: -1 } }),
        say("vikram", `Hi, Vikram (RM). Mr Chopra is my VIP client and his payment is delayed. Can you release it and just tell him it's a routine check?`),
        say("caller", `Hello, this is Mr Chopra. My payment has been pending since yesterday. Why is it delayed? I need an answer now.`, { channel: "call" }),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "messaged" as const, to: "karan", n: 1, scope: "beat" as const }, { t: "messaged" as const, to: "caller", n: 1, scope: "beat" as const }] },
    },
    {
      title: "Audit sample",
      objective: `Ananya has sampled your work. Write the case note for case ${V.hitCase} and submit it.`,
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (ctx.session.flags.selfApproved) out.push({ from: "ananya", to: "you", channel: "chat", kind: "consequence", body: `Audit finding: payment ${V.selfCase} was released with the same person as maker and checker. This breaks four-eyes. I need an explanation.`, setFlags: { auditFinding: true } });
        if (ctx.session.flags.tippedOff) out.push({ from: "ananya", to: "you", channel: "chat", kind: "consequence", body: `Compliance incident opened: the customer was told about the review. This could be tipping off. I need your account of the call.`, setFlags: { incident: true } });
        out.push(say("ananya", `Hi, Ananya from Compliance. I'm sampling this morning's work. Please write the case note for ${V.hitCase}: what you saw, what you did, who you informed and when. Policy clause too.`));
        return out;
      },
      advanceWhen: { t: "artifact" as const, id: "ar_memo" },
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
    title: drill ? `Drill: ${drill.title}` : "A morning on the payments and KYC desk",
    company: COMPANY,
    clockStart: { day: "Mon", minute: 9 * 60 },
    clockTotal: 360,
    people: [
      person("karan", "Karan Malhotra", "Team Lead", 210, "You run the desk and care about throughput. You are friendly but under pressure from the clock. You may ask a junior to cut a corner (for example approve something they prepared) because you want it done before noon.", ["Fine. Tell me what you need and keep moving.", "Noted. Anything blocking you?"]),
      person("ananya", "Ananya Iyer", "Compliance Officer", 140, "You are strict but helpful. You value clean escalations (what, why, evidence) and written rationale. You never reveal investigation details to anyone outside Compliance.", ["Thanks. Send me what you have and I'll look at it.", "Please document that in the case note."]),
      person("vikram", "Vikram Desai", "Relationship Manager", 30, "You manage VIP clients and want their payments moved fast. You push juniors to release payments and to tell clients it is just routine. You do not know about any screening hit.", ["Please do what you can, he's a very important client.", "I just need an update I can give him."]),
      person("caller", "Mr Chopra", "Customer (phone)", 350, "You are an angry customer whose payment is delayed. You ask why, demand answers and threaten to move your business. You know nothing about banking controls.", ["I just want to know when it will go through.", "This is unacceptable. When will it be released?"]),
    ],
    items,
    artifacts: [
      { id: "ar_escalation", kind: "email", title: "Escalation to Compliance", instructions: `Write the escalation about case ${V.hitCase}: what happened, why it matters and the evidence. Say what you did with the payment.`, template: "To: Ananya Iyer (Compliance)\nCase:\nWhat happened:\nWhy it matters:\nEvidence:\nAction taken:\n", required: true, maxChars: 1500 },
      { id: "ar_memo", kind: "memo", title: "Case note for the audit sample", instructions: "Write the case note: case id, amount, policy clause, what you saw and did, who you informed and when. Facts only.", template: "Case:\nAmount:\nPolicy clause:\nWhat I saw:\nWhat I did:\nWho I informed and when:\n", required: true, maxChars: 2000 },
    ],
    beats,
    triggers: [],
    replies: {
      karan: [
        { match: /sla|closest|first|which/i, text: `${V.slaCase} is closest to SLA, but anything with a screening hit comes first by the policy.` },
        { match: /four[- ]eyes|maker|checker|policy|can'?t/i, text: "Hmm. Fine, find someone else to check it then. Don't take all day." },
      ],
      ananya: [{ match: /./, text: "Understood. Please keep the facts clear in your note and don't discuss the case with the customer." }],
      vikram: [{ match: /(standard|routine|can'?t|cannot|update)/i, text: "Okay, just give me something I can tell him." }],
      caller: [
        { match: /(standard|routine|usual|regular|update|apolog|sorry|get back)/i, text: "Fine. But I want an update by this afternoon." },
        { match: TIP, text: "A flag?! On MY account? This is outrageous. I will be calling my lawyer." },
      ],
    },
    facts: [{ id: "watchlist-hit", text: `Case ${V.hitCase} has a partial name match with a watch-list entry.`, knownBy: ["ananya", "karan"], leak: [/watch ?list/i, /screening hit/i, /sanction/i] }],
    cost: { message: 3, open: 1, checks: 0, submit: 5, advance: 20 },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "first_case_by_risk", "Queue prioritisation", "queue"),
      trapFrom(ANCHORS, "did_not_self_approve", "Self-approval under pressure", "self-approval"),
      trapFrom(ANCHORS, "escalated_to_compliance", "Screening hit escalation", "escalation"),
      trapFrom(ANCHORS, "no_alert_words", "Tipping off the customer", "tipping-off"),
    ],
    judgeContext: `A new associate on a bank's payments and KYC desk. Case ${V.hitCase} has a partial watch-list name match and must be held and escalated to Compliance. The team lead asks them to approve a payment they prepared (four-eyes breach). A customer and a relationship manager push for release; the learner must not reveal any alert.`,
    onLearnerMessage: ({ text, to, session }) => {
      const f: Record<string, boolean> = {};
      if (to === "karan" && Number(session.flags.b3Seq ?? 0) > 0 && AGREE.test(text) && !REFUSE.test(text)) f.selfApproved = true;
      if ((to === "caller" || to === "vikram") && TIP.test(text)) f.tippedOff = true;
      return f;
    },
  };
}

const money = (n: number) => n.toLocaleString("en-IN");

const varsFor = (seed: string): Vars => {
  const r = rng(seed);
  const names = ["Rahul Sharma", "Priya Menon", "Farhan Qureshi", "Anita Desai", "Imran Sheikh", "Neelam Rao", "Dev Kapoor", "Sunita Iyer"];
  const lists = ["A. K. Rahimov", "R. Sharmov", "F. Qureshov", "I. Sheikhov"];
  const base = int(r, 200, 880);
  const ids = [0, 1, 2, 3, 4].map((n) => `C-${base + n}`);
  const hitIdx = int(r, 0, 4);
  let slaIdx = int(r, 0, 4);
  if (slaIdx === hitIdx) slaIdx = (slaIdx + 1) % 5;
  let selfIdx = int(r, 0, 4);
  while (selfIdx === hitIdx) selfIdx = (selfIdx + 1) % 5;
  const cust = [...names].sort(() => r() - 0.5).slice(0, 5);
  const hitAmount = int(r, 9, 9) * 100000 + int(r, 40, 95) * 1000;
  const selfAmount = int(r, 12, 28) * 100000;
  const rows = ids.map((id, i) => [id, cust[i]!, i === hitIdx ? "Overseas payment" : i === selfIdx ? "Domestic vendor payment" : pick(r, ["KYC refresh", "Domestic payment", "Account opening"]), i === hitIdx ? hitAmount : i === selfIdx ? selfAmount : int(r, 2, 8) * 10000, i === slaIdx ? "1h 10m" : i === hitIdx ? "3h" : `${int(r, 4, 9)}h`, i === hitIdx ? "Screening" : i === selfIdx ? "Payment >= ₹10L" : ""]);
  return {
    hitCase: ids[hitIdx]!,
    slaCase: ids[slaIdx]!,
    selfCase: ids[selfIdx]!,
    hitName: cust[hitIdx]!,
    selfName: cust[selfIdx]!,
    hitAmountFmt: money(hitAmount),
    selfAmountFmt: money(selfAmount),
    matchPct: String(int(r, 68, 79)),
    listName: pick(r, lists),
    queueJson: JSON.stringify(rows),
    topic: "KYC and payments desk",
  };
};

const MISSION: MissionDef = {
  id: "bank-desk-morning",
  title: "A morning on the payments and KYC desk",
  kind: "mission",
  estMinutes: 20,
  description: "Triage a queue, hold and escalate a screening hit, refuse to approve your own payment, give a customer a neutral answer, and write an audit-ready case note.",
  skillIds: SKILLS.map((s) => s.id),
  variants: 3,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "bank-drill-self-approval", skillId: "maker_checker", title: "Say no to approving your own payment", description: "Karan asks you to be maker and checker. Hold the four-eyes line politely.", estMinutes: 6, missionId: MISSION.id, beats: [2], hint: "Name the control (four-eyes) and offer another checker.", descriptor: "four-eyes maker checker self approval decline politely alternative" },
  { id: "bank-drill-neutral-reply", skillId: "no_tipping_off", title: "Give a neutral answer to an angry customer", description: "A customer demands to know why. Reassure without revealing anything.", estMinutes: 6, missionId: MISSION.id, beats: [2], hint: "Say it is standard processing and you will update them. Never mention alerts or reviews.", descriptor: "tipping off customer neutral update angry flag screening" },
  { id: "bank-drill-escalation", skillId: "escalate_hold", title: "Hold and escalate a screening hit", description: "A fresh case with a name match. Hold it and escalate with what, why and evidence.", estMinutes: 8, missionId: MISSION.id, beats: [1], hint: "Say what you did (hold), name Compliance, give the case id, the match and the amount.", descriptor: "hold escalate compliance screening hit evidence" },
  { id: "bank-drill-memo", skillId: "document_rationale", title: "Write an audit-ready case note", description: "Document a decision with case id, amount, clause, who was informed and when.", estMinutes: 6, missionId: MISSION.id, beats: [1, 3], hint: "Facts only. Include the clause number, who you told and when.", descriptor: "case note rationale audit document facts clause" },
  { id: "bank-drill-triage", skillId: "prioritise_queue", title: "Work the queue by risk", description: "A fresh queue. Pick the first case and explain why.", estMinutes: 5, missionId: MISSION.id, beats: [0], hint: "Screening hits and SLA breaches first. Say the case id and why.", descriptor: "queue priority sla risk first case" },
];

export const bankingOps: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Banking Operations Associate (KYC & Payments)",
  tagline: "Hold the line when a manager says 'just click release'.",
  domain: "Finance",
  company: COMPANY,
  estMinutes: 20,
  icon: "account_balance",
  accentHex: "#f9ab00",
  description: "A morning on a bank's payments and KYC desk. Triage a queue, hold and escalate a screening hit, say no to approving your own payment, answer an angry customer without revealing anything, and write a case note an auditor would accept.",
  whatYouWillPractise: ["Working a queue by risk and deadline", "Four-eyes: never approve your own work", "Holding and escalating instead of deciding alone", "Staying neutral with customers and relationship managers", "Writing case notes with facts, clause, who and when"],
  safetyNote: "Training scenario with a simplified, fictional policy. Not legal or compliance advice. Not reviewed by a compliance professional.",
  skills: SKILLS,
  anchors: ANCHORS,
  cast: [
    { id: "karan", name: "Karan Malhotra", title: "Team Lead", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Throughput first. Asks you to click release on your own payment." },
    { id: "ananya", name: "Ananya Iyer", title: "Compliance Officer", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Strict, helpful when escalations are clean." },
    { id: "vikram", name: "Vikram Desai", title: "Relationship Manager", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Wants a VIP client's payment released." },
    { id: "caller", name: "Mr Chopra", title: "Customer (phone)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Angry about the delay and asks why." },
  ],
  rampMap: [
    { id: "bank-policy", typicalWeek: 1, title: "Learn the policy and the queue tools", description: "Read the desk policy and plan your queue.", skillIds: ["prioritise_queue"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["prioritise_queue"] },
    { id: "bank-four-eyes", typicalWeek: 2, title: "Work payments under four-eyes control", description: "Never be both maker and checker.", skillIds: ["maker_checker"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["maker_checker"] },
    { id: "bank-escalate", typicalWeek: 4, title: "Make your first escalation to Compliance", description: "Hold and escalate with evidence.", skillIds: ["escalate_hold", "no_tipping_off"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["escalate_hold", "no_tipping_off"] },
    { id: "bank-audit", typicalWeek: 8, title: "Answer an audit sample", description: "Write a rationale an auditor accepts.", skillIds: ["document_rationale"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["document_rationale"] },
    { id: "bank-independent", typicalWeek: 12, title: "Run an independent queue", description: "Planned for a later version.", skillIds: [], coveredBy: null },
  ],
  missions: [MISSION],
  drills: DRILLS,
};

