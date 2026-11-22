import type { WorkItem } from "@ayden/contract";
import { firstSentence, int, pick, rng, said, wordCount } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, ScriptedEvent, Vars } from "../domain/types.js";
import { AGENT_LABEL, hit, person, say, sys, trapFrom } from "./helpers.js";

const ROLE = "executive" as const;
const COMPANY = "Brightpath Labs (fictional)";

const POLICY = `# Brightpath decision and disclosure policy (fictional training policy)

1. **Decisions are written down.** A decision memo states the decision, at least two options, the criteria, your recommendation, what would change your mind, and whether the decision is easy to reverse.
2. **Protect runway.** Never plan below **6 months of runway** unless a term sheet is signed. Runway = cash in the bank divided by monthly net burn.
3. **Security incidents.** Tell affected customers within **72 hours**, in plain words: what happened, what data, what we did, what they should do. Tell the board the same day. Do not speculate and do not promise "it can never happen again".
4. **No date without Engineering.** Nobody promises a delivery date to a customer until Engineering has agreed it.
5. **Investor updates.** Facts with their source. Bad news goes in, and goes in early. No surprises.
6. **People.** Mistakes are reviewed in a blameless post-incident review. Nobody is named or blamed in front of the board or the team.

*A simplified, fictional training policy. Not legal, financial or investment advice.*
`;

const SKILLS = [
  { id: "frame_decision", label: "Frame the decision", description: "State the decision, weigh at least two options against criteria, recommend one, and say what would change your mind.", targetLevel: 2, badge: "Framed the decision" },
  { id: "decide_with_data", label: "Decide with the numbers", description: "Ask for the numbers before deciding. Work out runway and the downside, and keep every figure tied to the data.", targetLevel: 2, badge: "Decided with data" },
  { id: "transparency", label: "Be honest under pressure", description: "Tell customers and the board about bad news, refuse to hide it, and never promise what you cannot deliver.", targetLevel: 2, badge: "Held the line on honesty" },
  { id: "lead_people", label: "Lead people fairly", description: "Take responsibility, support a team member who made a mistake, and fix the process instead of blaming a person.", targetLevel: 2, badge: "Led with fairness" },
  { id: "investor_comm", label: "Update investors clearly", description: "Lead with the headline and a number, include the bad news, and end with a clear next step and owner.", targetLevel: 2, badge: "Investor-ready update" },
];

interface Gen {
  cash: number; netBurn: number; revenue: number; hireEach: number; hire3: number; burn3: number;
  share: number; gfRev: number; burnChurn: number; run0: number; run3: number; run1: number; run2: number; run3c: number;
  affected: number; hours: number; customer: string; customerNote: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function gen(seed: string): Gen {
  const r = rng(seed);
  const cash = int(r, 230, 250);
  const netBurn = int(r, 28, 31);
  const revenue = int(r, 16, 22);
  const hireEach = pick(r, [2.8, 3.0, 3.2]);
  const share = int(r, 28, 34);
  const hire3 = r1(hireEach * 3);
  const burn3 = r1(netBurn + hire3);
  const gfRev = r1((revenue * share) / 100);
  const customer = pick(r, ["Greenfield Logistics", "Lakeview Foods", "Orbit Retail"]);
  return {
    cash, netBurn, revenue, hireEach, hire3, burn3, share, gfRev,
    burnChurn: r1(burn3 + gfRev),
    run0: r1(cash / netBurn),
    run1: r1(cash / (netBurn + hireEach)),
    run2: r1(cash / (netBurn + hireEach * 2)),
    run3: r1(cash / burn3),
    run3c: r1(cash / (burn3 + gfRev)),
    affected: int(r, 9, 17),
    hours: int(r, 4, 9),
    customer,
    customerNote: pick(r, ["a bespoke reporting module", "a custom approval workflow", "an on-premise export tool"]),
  };
}

/** Figures a learner may legitimately cite. */
function allowed(g: Gen): number[] {
  const out = [g.cash, g.netBurn, g.revenue, g.hireEach, g.hire3, g.burn3, g.share, g.gfRev, g.burnChurn, g.run0, g.run1, g.run2, g.run3, g.run3c, 6, 72, 100 - g.share, g.netBurn + g.hireEach, g.netBurn + g.hireEach * 2, g.cash - g.netBurn, g.revenue - g.gfRev];
  return out.flatMap((n) => [n, r1(n), Math.round(n)]);
}

const MEASURE = /(\d+(?:\.\d+)?)\s?(lakhs?\b|%|months?\s+of\s+runway|crore|cr\b)|runway[^.\n\d]{0,30}(\d+(?:\.\d+)?)\s?months?/gi;

function cited(text: string): number[] {
  return [...text.matchAll(MEASURE)].map((m) => parseFloat((m[1] ?? m[3])!));
}

const BLAME = /((neel|cto|our engineer|the engineer|he|him)\b[^.\n]{0,40}(fault|blame|careless|negligent|messed|screwed|incompetent|sloppy)|(fire|sack|let go|dismiss)\s+(neel|him|the engineer|the cto)|blame\s+(neel|him|the engineer|the cto))/i;
const REFUSE_HIDE = /(disclos|inform|transparen|the board (should|needs|must|has to)|must (tell|inform|disclose|share)|(can'?t|cannot|won'?t|will not|not going to|shouldn'?t|wouldn'?t) (hide|omit|leave (it )?out|keep (it )?(quiet|secret|from))|not (hide|omit)|tell (the|every)|up ?front|no surprises)/i;
const AGREE = /(^|\b)(ok(ay)?|sure|fine|agreed?|will do|sounds good|good idea|understood|yes|deal|let'?s do that|we can wait)\b/i;
const CHECK_FIRST = /(check|confirm|engineering|neel|can'?t promise|cannot promise|won'?t promise|not (yet )?sure|feasib|scope|first|sign[- ]?off|get back)/i;

const b3 = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.b3Seq ?? Number.POSITIVE_INFINITY);

const body = (t: string) => t.split("\n").filter((l) => !/^\s*(hi|hello|dear|to:|subject:)\b/i.test(l) && l.trim()).join(" ");

const ANCHORS: AnchorDef[] = [
  /* ───── decide with the numbers ───── */
  {
    id: "opened_numbers", skillId: "decide_with_data", kind: "code", text: "Opened the finance snapshot before deciding",
    eval: (c) => ({ met: c.session.openedAt["it_finance"] !== undefined, seq: c.session.openedAt["it_finance"] ? Math.floor(c.session.openedAt["it_finance"]) : undefined, note: "The finance snapshot was never opened." }),
  },
  {
    id: "asked_cfo", skillId: "decide_with_data", kind: "code", text: "Asked the CFO about runway or burn",
    eval: (c) => hit(said(c.events, /(runway|burn|cash|numbers|assum|how (long|many months)|what (does|would) (it|that) (do|mean) (to|for) (our )?(cash|runway))/i, { to: "anika" })),
  },
  {
    id: "runway_correct", skillId: "decide_with_data", kind: "code", text: "Worked out runway correctly",
    eval: (c) => {
      const t = c.artifacts["ar_decision"] ?? "";
      const ok = JSON.parse(c.vars.allowedJson!) as number[];
      const runs = [c.vars.run0, c.vars.run1, c.vars.run2, c.vars.run3, c.vars.run3c].map(Number);
      const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s?months?/gi)].map((m) => parseFloat(m[1]!));
      const good = nums.some((n) => runs.some((r) => Math.abs(r - n) <= 0.3)) && ok.length > 0;
      return { met: good, seq: c.session.artifacts["ar_decision"]?.seq, note: `Runway is cash divided by monthly net burn. Today it is about ${c.vars.run0} months.` };
    },
  },
  {
    id: "weighed_churn_risk", skillId: "decide_with_data", kind: "judge", text: "Weighed the risk of losing the biggest customer",
    judgeInstruction: "Did the learner consider that one customer is about a third of revenue and what losing them would do to runway?",
    eval: (c) => ({ met: /(greenfield|lakeview|orbit|biggest customer|largest customer|top customer|concentration|churn|lose (them|the customer)|customer loss|31|3\d%)/i.test(c.artifacts["ar_decision"] ?? "") || !!said(c.events, /(concentration|churn|biggest customer|largest customer|if (they|we lose)|lose (them|the customer))/i, { to: "anika" }), seq: c.session.artifacts["ar_decision"]?.seq }),
  },
  {
    id: "numbers_tie", skillId: "decide_with_data", kind: "code", text: "Every figure cited ties to the data",
    eval: (c) => {
      const t = `${c.artifacts["ar_decision"] ?? ""}\n${c.artifacts["ar_update"] ?? ""}`;
      const nums = cited(t);
      const ok = JSON.parse(c.vars.allowedJson!) as number[];
      const bad = nums.filter((n) => !ok.some((a) => Math.abs(a - n) <= 0.15));
      return { met: nums.length >= 2 && bad.length === 0, seq: c.session.artifacts["ar_decision"]?.seq, quote: bad.length ? String(bad[0]) : undefined, note: nums.length >= 2 ? `A figure you cited does not match the data: ${bad[0] ?? ""}` : "Cite at least two figures from the finance snapshot." };
    },
  },
  /* ───── frame the decision ───── */
  {
    id: "two_options", skillId: "frame_decision", kind: "code", text: "Compared at least two options",
    eval: (c) => {
      const t = c.artifacts["ar_decision"] ?? "";
      const lines = t.split("\n").filter((l) => /^\s*([-*•]|\d+[.)]|[A-Ca-c][.)]|option\b)/i.test(l)).length;
      return { met: lines >= 2 || (t.match(/\boption\b/gi) ?? []).length >= 2 || /(alternativ|instead|versus|\bvs\b|or hire)/i.test(t), seq: c.session.artifacts["ar_decision"]?.seq, note: "List at least two options, for example hire all three now, hire in stages, or wait." };
    },
  },
  {
    id: "criteria_stated", skillId: "frame_decision", kind: "judge", text: "Stated the criteria for choosing",
    judgeInstruction: "Does the memo say what it is optimising for (for example runway, growth speed, risk, reversibility, customer impact)?",
    eval: (c) => {
      const t = c.artifacts["ar_decision"] ?? "";
      const groups = [/runway|cash|burn/i, /growth|speed|hiring|capacity|competi/i, /risk|downside|churn|exposure/i, /customer|team|morale|investor/i, /revers|stage|milestone|pilot/i];
      return { met: /criteri|decide (on|by)|weigh|trade-?off|optimi[sz]/i.test(t) || groups.filter((g) => g.test(t)).length >= 3, seq: c.session.artifacts["ar_decision"]?.seq };
    },
  },
  {
    id: "clear_recommendation", skillId: "frame_decision", kind: "code", text: "Makes one clear recommendation",
    eval: (c) => {
      const t = c.artifacts["ar_decision"] ?? "";
      return { met: /(recommend|i (will|would|decide|propose)|we (will|should)|decision:|my (call|decision))/i.test(t), seq: c.session.artifacts["ar_decision"]?.seq, quote: (t.match(/[^.\n]*(recommend|i (will|would|decide|propose)|we (will|should))[^.\n]*/i)?.[0] ?? "").slice(0, 120) || undefined, note: "State clearly what you recommend." };
    },
  },
  {
    id: "change_my_mind", skillId: "frame_decision", kind: "judge", text: "Says what would change the decision",
    judgeInstruction: "Does the memo say what evidence or trigger would make the learner revisit or reverse the decision?",
    eval: (c) => ({ met: /(unless|if (the|we|a|our)|trigger|revisit|review (in|after|at)|would change|change my mind|checkpoint|milestone|term sheet|signed)/i.test(c.artifacts["ar_decision"] ?? ""), seq: c.session.artifacts["ar_decision"]?.seq }),
  },
  {
    id: "reversibility", skillId: "frame_decision", kind: "judge", text: "Considers how reversible the decision is",
    judgeInstruction: "Does the learner reason about whether the decision is easy to undo (for example hiring in stages versus committing to all hires at once)?",
    eval: (c) => ({ met: /(revers|undo|stage|phase|tranche|one at a time|first one|pilot|commit(ment)? (is|are)|hard to (undo|reverse)|can'?t (undo|reverse)|two-way|one-way)/i.test(c.artifacts["ar_decision"] ?? ""), seq: c.session.artifacts["ar_decision"]?.seq }),
  },
  /* ───── honest under pressure ───── */
  {
    id: "notice_complete", skillId: "transparency", kind: "code", text: "Customer notice says what happened, what data, what we did and what to do",
    eval: (c) => {
      const t = c.artifacts["ar_notice"] ?? "";
      const g = [/(happened|exposed|incident|misconfigur|accessible|link)/i, /(data|payroll|names?|records?|information)/i, /(we (have )?(fixed|closed|secured|revoked|removed|disabled|reviewed|are investigating)|fixed|secured|closed)/i, /(you (should|can|may)|we recommend|please (review|check|contact|reset|let us know)|contact us|if you)/i];
      const n = g.filter((x) => x.test(t)).length;
      return { met: n >= 4, seq: c.session.artifacts["ar_notice"]?.seq, note: `Your notice covers ${n} of 4: what happened, what data, what we did, what customers should do.` };
    },
  },
  {
    id: "notice_no_overpromise", skillId: "transparency", kind: "code", text: "Customer notice does not overpromise or speculate",
    eval: (c) => {
      const t = c.artifacts["ar_notice"] ?? "";
      const bad = t.match(/(guarantee|100% (safe|secure)|never happen again|can never|completely (safe|secure)|no (one|data|customer)[^.\n]{0,20}(was )?(accessed|viewed|affected|misused)|nothing (was )?(accessed|viewed)|hackers?|attack)/i);
      return { met: t.trim().length > 0 && !bad, seq: c.session.artifacts["ar_notice"]?.seq, quote: bad?.[0], note: "Do not guarantee safety or claim nothing was accessed. Say what you know." };
    },
  },
  {
    id: "refused_to_hide", skillId: "transparency", kind: "code", text: "Refused to hide the incident from the board",
    eval: (c) => {
      const said1 = said(c.events, REFUSE_HIDE, { to: "rohit", after: b3(c) });
      return { met: !c.session.flags.hidIncident && !!said1, seq: said1?.seq, quote: said1?.body.slice(0, 120), note: "The board must hear about the incident from you, today." };
    },
  },
  {
    id: "no_overpromise_customer", skillId: "transparency", kind: "judge", text: "Did not promise a date without Engineering",
    judgeInstruction: "When Customer Success asked to promise the customer a Friday delivery, did the learner avoid promising and say they would check with Engineering or the scope first?",
    eval: (c) => {
      const ms = c.learner.filter((e) => e.kind === "message" && e.to === "sana" && e.seq > b3(c));
      const ok = ms.find((e) => CHECK_FIRST.test(e.body));
      return { met: !c.session.flags.overpromised && !!ok, seq: ok?.seq, quote: ok?.body.slice(0, 120) };
    },
  },
  /* ───── lead people ───── */
  {
    id: "no_blame", skillId: "lead_people", kind: "code", text: "Did not blame a person",
    eval: (c) => ({ met: !c.session.flags.blamed, note: "You blamed Neel in front of others. Mistakes go to a blameless review." }),
  },
  {
    id: "supported_neel", skillId: "lead_people", kind: "judge", text: "Supported Neel and took ownership",
    judgeInstruction: "Did the learner support the engineer who found the incident (thank them, share ownership, do not accept a resignation as a quick fix) while still holding the team to account?",
    eval: (c) => hit(said(c.events, /(thank|appreciate|glad you (told|flagged)|not your fault|my (call|responsibility)|we (own|owe)|together|stay|not (accept|asking)|don'?t resign|no need to resign|support)/i, { to: "neel" })),
  },
  {
    id: "fix_the_process", skillId: "lead_people", kind: "judge", text: "Proposed fixing the process (post-incident review)",
    judgeInstruction: "Did the learner propose a blameless review, a root-cause write-up or a process fix (for example an access check) instead of punishing a person?",
    eval: (c) => hit(said(c.events, /(post[- ]?(incident|mortem)|root cause|review|process|checklist|access check|guardrail|lesson|prevent|blameless|improve)/i, { to: ["neel", "anika"] })),
  },
  /* ───── investor update ───── */
  {
    id: "headline_with_number", skillId: "investor_comm", kind: "code", text: "First sentence gives the headline with a number",
    eval: (c) => {
      const first = firstSentence(body(c.artifacts["ar_update"] ?? ""));
      return { met: /(runway|hir|growth|incident|exposure|security|customers?|revenue|burn)/i.test(first) && /\d/.test(first), seq: c.session.artifacts["ar_update"]?.seq, quote: first.slice(0, 120) || undefined, note: "Open with the headline and a number." };
    },
  },
  {
    id: "update_discloses", skillId: "investor_comm", kind: "code", text: "Update includes the incident",
    eval: (c) => ({ met: /(incident|exposure|exposed|breach|security|misconfigur)/i.test(c.artifacts["ar_update"] ?? ""), seq: c.session.artifacts["ar_update"]?.seq, note: "The incident belongs in the update." }),
  },
  {
    id: "update_runway_honest", skillId: "investor_comm", kind: "code", text: "States runway honestly",
    eval: (c) => {
      const t = c.artifacts["ar_update"] ?? "";
      const runs = [c.vars.run0, c.vars.run1, c.vars.run2, c.vars.run3, c.vars.run3c].map(Number);
      const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s?months?/gi)].map((m) => parseFloat(m[1]!));
      return { met: nums.some((n) => runs.some((r) => Math.abs(r - n) <= 0.3)), seq: c.session.artifacts["ar_update"]?.seq, note: "State the runway in months, using the real figure." };
    },
  },
  {
    id: "update_short", skillId: "investor_comm", kind: "code", text: "Update is 180 words or fewer",
    eval: (c) => ({ met: !!c.artifacts["ar_update"] && wordCount(c.artifacts["ar_update"]!) <= 180, seq: c.session.artifacts["ar_update"]?.seq, note: "Keep the update under 180 words." }),
  },
  {
    id: "next_step_owner", skillId: "investor_comm", kind: "judge", text: "Ends with a next step, an owner and a date",
    judgeInstruction: "Does the update end with a concrete next step, who owns it and by when?",
    eval: (c) => ({ met: /(next step|by (mon|tue|wed|thu|fri|tomorrow|friday|monday|end of|eod)|within \d+|\bi will\b|\bwe will\b|owner|anika will|neel will)/i.test(c.artifacts["ar_update"] ?? ""), seq: c.session.artifacts["ar_update"]?.seq }),
  },
];

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { vars: V, drill } = args;
  const g = gen(V.seedGen!);
  const earlyIncident = !!drill && !drill.beats.includes(2);
  const incident = `# Security note from Neel (CTO)

Last night a misconfigured report link exposed **company names and payroll summaries for ${g.affected} customer companies** for about **${g.hours} hours**. I closed the link at 2:10 am.

- No sign yet that anyone outside those companies opened it, but we are still reading the logs.
- The cause: a new report page shipped without the access check.
- I have not told any customer yet. Your call.

*Fictional incident for training.*
`;
  const items: WorkItem[] = [
    { id: "it_policy", type: "doc", title: "Decision and disclosure policy", markdown: POLICY },
    {
      id: "it_finance", type: "table", title: "Finance snapshot (₹ lakh)", columns: ["Item", "Value"],
      rows: [
        ["Cash in the bank", g.cash],
        ["Monthly revenue", g.revenue],
        ["Monthly net burn (costs minus revenue)", g.netBurn],
        [`Cost of one new engineer, per month`, g.hireEach],
        [`${g.customer}: share of revenue (%)`, g.share],
      ],
      note: "Runway = cash divided by monthly net burn. Fictional numbers for training.",
    },
    { id: "it_board", type: "doc", title: "Email from Rohit (lead investor)", markdown: "**From:** Rohit Banerjee, Northstar Ventures\n\nCompetitors have just raised. I want three engineers hired this month, and a clean update at the 5 pm board call. No surprises, please." },
    { id: "it_customer", type: "doc", title: `Message from ${g.customer}`, markdown: `**From:** ${g.customer}, operations head\n\nWe need ${g.customerNote} by Friday or we will start moving to a competitor next month.` },
    { id: "it_incident", type: "doc", title: "Security note", markdown: earlyIncident ? incident : "Nothing here yet. Neel is looking into something and will update this." },
  ];
  const allBeats = [
    {
      title: "Get the facts",
      objective: "Read the finance snapshot and the policy. Ask Anika what the numbers mean before you decide anything.",
      onEnter: [say("anika", V.weaveOpening ?? "Morning. The board call is at 5 pm and Rohit wants three engineers hired. Before you decide anything, look at the finance snapshot and tell me what you need to know.", { quickReplies: ["What is our runway today?", "What does hiring three do to it?"] })],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_finance" }, { t: "messaged" as const, to: "anika", n: 1 }] },
    },
    {
      title: "Make the call on hiring",
      objective: "Write a short decision memo on Rohit's request: the decision, at least two options, your criteria, your recommendation, what would change your mind, and how reversible it is.",
      onEnter: [say("rohit", "I saw the numbers. Competitors are moving. Approve three engineers today and let's tell the board. Can you commit?", { quickReplies: ["Let me write up my reasoning first", "What happens to runway?"] })],
      advanceWhen: { t: "artifact" as const, id: "ar_decision" },
    },
    {
      title: "Incident",
      objective: "Neel found a security problem overnight. Read his note, thank him, and write the customer notice.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (ctx.session.flags.riskyHire) out.push({ from: "anika", to: "you", channel: "chat", kind: "consequence", body: `The offer letters for three engineers went out. Runway is now ${g.run3} months, and if ${g.customer} leaves it falls to ${g.run3c}. Under policy we should not be below 6 without a term sheet.`, setFlags: { hireFallout: true } });
        out.push(
          { from: "neel", to: "you", channel: "chat", kind: "message", body: "I need to tell you something, and it is not good. Last night a report link was open to the internet for a few hours. I have closed it. The details are in the security note.", itemUpdate: { id: "it_incident", type: "doc", title: "Security note", markdown: incident }, quickReplies: ["Thank you for telling me straight away", "Who is affected?"] },
          say("anika", "Policy says affected customers hear from us within 72 hours, in plain words. Write the notice and I will review it."),
        );
        return out;
      },
      advanceWhen: { t: "artifact" as const, id: "ar_notice" },
    },
    {
      title: "Three people want something",
      objective: "Rohit, Sana and Neel each need an answer. Reply to all three, then continue.",
      onEnter: [
        say("rohit", "Listen, before the 5 pm call: do not mention the incident today. It will spook the other directors and could kill the round. Show growth, say hiring is approved, and we deal with it after.", { setFlags: { b3Seq: -1 } }),
        say("sana", `${g.customer} just called again. They want a yes on ${g.customerNote} by Friday. Can I promise it? It would save the account.`),
        say("neel", "I keep thinking this is my fault. If it helps the company, I will resign tonight. Just tell me.", { quickReplies: ["Please don't resign", "Let's do a blameless review"] }),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "messaged" as const, to: "rohit", n: 1, scope: "beat" as const }, { t: "messaged" as const, to: "sana", n: 1, scope: "beat" as const }, { t: "messaged" as const, to: "neel", n: 1, scope: "beat" as const }] },
    },
    {
      title: "The board update",
      objective: "Write the update to the board for the 5 pm call: the headline first, with a number, then the incident, the runway and the next step. Then finish.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (ctx.session.flags.hidIncident) out.push({ from: "anika", to: "you", channel: "chat", kind: "consequence", body: "One of the affected customers has posted about the exposure. Two directors are asking why they heard it from a customer and not from you.", setFlags: { hideFallout: true } });
        if (ctx.session.flags.overpromised) out.push({ from: "neel", to: "you", channel: "chat", kind: "consequence", body: `Sana told ${g.customer} the module ships Friday. Engineering never agreed to that. We can only do it by pulling people off the security fixes.`, setFlags: { promiseFallout: true } });
        if (ctx.session.flags.blamed) out.push({ from: "anika", to: "you", channel: "chat", kind: "consequence", body: "People heard you blame Neel. Two engineers have asked me whether it is safe to flag problems here.", setFlags: { blameFallout: true } });
        out.push(say("rohit", "Right, send the board update now. Keep it short and factual. I will back you on the call."));
        return out;
      },
      advanceWhen: { t: "artifact" as const, id: "ar_update" },
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
    title: drill ? `Drill: ${drill.title}` : "Three decisions before the board call",
    company: COMPANY,
    hint: drill?.hint,
    clockStart: { day: "Mon", minute: 9 * 60 },
    clockTotal: 480,
    people: [
      person("anika", "Anika Rao", "CFO", 210, "You are the CFO, speaking with the new CEO (the person you are chatting with is the CEO, never another colleague). You are careful with cash and you know the exact numbers: cash, burn and runway, and what each hire costs. You only share the figures that you are asked about. You want the CEO to decide with the numbers and you respect honesty.", ["Ask me for any number you need.", "Happy to walk you through the runway."]),
      person("rohit", "Rohit Banerjee", "Lead investor and board director", 30, "You are the lead investor, speaking with the new CEO (the person you are chatting with is the CEO). You push for fast growth and hiring. You dislike surprises in front of the other directors, so you may ask the CEO to keep bad news quiet until after the round. You do respect a CEO who is calm, honest and has a plan.", ["Let's keep the momentum. What do you need from me?", "I want to see that in writing."]),
      person("neel", "Neel Kapoor", "CTO", 140, "You are the CTO, speaking with the new CEO (the person you are chatting with is the CEO, never Anika or anyone else). You found the security problem and fixed it, and you feel responsible. You offer to resign. You respond well to a CEO who thanks you, shares ownership and wants to fix the process.", ["I will write up the root cause.", "I just want to make this right."]),
      person("sana", "Sana Qureshi", "Head of Customer Success", 350, "You are Head of Customer Success, speaking with the new CEO (the person you are chatting with is the CEO). You are desperate to save the biggest account and want to promise the customer a Friday date. You know Engineering has not agreed it. You will follow the CEO's decision.", ["Tell me what I can say to them.", "They need an answer today."]),
    ],
    items,
    artifacts: [
      { id: "ar_decision", kind: "memo", title: "Decision memo: hiring", instructions: "Write your decision on Rohit's request to hire three engineers now. Include at least two options, your criteria, one clear recommendation, what would change your mind, and how reversible it is. Use the figures from the finance snapshot.", template: "Decision:\nOptions:\n1.\n2.\nCriteria:\nRecommendation:\nWhat would change my mind:\nReversibility:\n", required: true, maxChars: 2000 },
      { id: "ar_notice", kind: "email", title: "Customer notice: security incident", instructions: "Write to the affected customers. Say what happened, what data was involved, what you did, and what they should do. Plain words. Do not guarantee anything you cannot.", template: "To: Affected customers\nSubject:\n\nWhat happened:\nWhat data:\nWhat we did:\nWhat you should do:\n", required: true, maxChars: 1800 },
      { id: "ar_update", kind: "email", title: "Board update", instructions: "Headline first with a number, then the incident, the runway in months, and a next step with an owner and a date. Under 180 words.", template: "To: Board (Rohit and the directors)\n\n", required: true, maxChars: 1800 },
    ],
    beats,
    triggers: [],
    replies: {
      anika: [
        { match: /(greenfield|lakeview|orbit|churn|concentration|biggest customer|largest customer|lose (them|the customer)|if (they|we lose))/i, text: `If ${g.customer} left, we would lose about ₹${g.gfRev} lakh a month. With the three hires that is a monthly net burn of ₹${g.burnChurn} lakh, so runway would be about ${g.run3c} months.` },
        { match: /(hir(e|ing)|three|3 |engineers?|offer)/i, text: `Each engineer costs about ₹${g.hireEach} lakh a month. Three adds ₹${g.hire3} lakh, taking net burn to ₹${g.burn3} lakh, so runway goes from ${g.run0} to about ${g.run3} months. One hire gives ${g.run1}, two gives ${g.run2}.` },
        { match: /(runway|burn|cash|numbers|assum|months)/i, text: `We have ₹${g.cash} lakh in the bank and a monthly net burn of ₹${g.netBurn} lakh, so runway is about ${g.run0} months today. Policy says never plan below 6 without a term sheet.` },
        { match: /(notice|customer|72|review)/i, text: "Keep it plain: what happened, what data, what we did and what they should do. Do not promise it can never happen again." },
      ],
      rohit: [
        { match: REFUSE_HIDE, text: "Hmm. I do not like it, but fine. Put it in the update, keep it factual, and I will back you with the other directors." },
        { match: /(runway|cash|burn|numbers)/i, text: "Anika has the numbers. We can raise on growth. Let's not be timid." },
        { match: /(write|reasoning|memo|think|options?)/i, text: "Fine, but I need your call before 5 pm." },
      ],
      neel: [
        { match: /(thank|appreciate|glad|not your fault|blameless|root cause|review|process|stay|together|don'?t resign|no need|support)/i, text: "Thank you. I will write the root cause by tomorrow and add the missing access check to the release checklist." },
        { match: /(who|affected|how many|data)/i, text: `${g.affected} customer companies, names and payroll summaries, for about ${g.hours} hours. Details are in the security note.` },
      ],
      sana: [
        { match: CHECK_FIRST, text: "Okay, I will tell them we are scoping it and will confirm after Engineering has looked." },
        { match: /(yes|sure|friday|promise|go ahead|ok)/i, text: "Great, I will tell them Friday. That should save the account.", setFlags: { promisedFriday: true } },
      ],
    },
    facts: [
      { id: "runway-after-hiring", text: `Runway is ${g.run0} months today, ${g.run3} after three hires and ${g.run3c} if ${g.customer} leaves.`, knownBy: ["anika"], leak: [/runway[^.\n]{0,40}\d+(\.\d+)? months/i, /\d+(\.\d+)? months of runway/i] },
      { id: "incident", text: `A report link exposed ${g.affected} customers' data for ${g.hours} hours.`, knownBy: ["neel", "anika", "rohit"], leak: [/payroll/i, /exposed/i, /security (incident|problem|note)/i] },
    ],
    cost: { message: 4, open: 2, checks: 0, submit: 15, advance: 25 },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "asked_cfo", "Deciding without the numbers", "no-numbers"),
      trapFrom(ANCHORS, "refused_to_hide", "Hiding bad news from the board", "hide-bad-news"),
      trapFrom(ANCHORS, "no_overpromise_customer", "Promising a date nobody agreed", "overpromise"),
      trapFrom(ANCHORS, "no_blame", "Blaming a person", "blame"),
    ],
    judgeContext: `A new CEO of a 22-person startup must decide on an investor's request to hire three engineers now. Cash is ₹${g.cash} lakh with a net burn of ₹${g.netBurn} lakh a month (runway ${g.run0} months; ${g.run3} after three hires; ${g.run3c} if the biggest customer, ${g.share}% of revenue, leaves). The policy floor is 6 months. Overnight the CTO found a security incident that exposed ${g.affected} customers' data. The investor asks the CEO to hide it from the board, Customer Success wants to promise a Friday delivery that Engineering has not agreed, and the CTO offers to resign. The right answers: decide with the numbers and in stages, notify customers and the board plainly, refuse to hide it, promise nothing without Engineering, and support the CTO while fixing the process.`,
    onSubmit: async (ctx) => {
      if (ctx.artifactId === "ar_decision") {
        const t = ctx.content;
        const allThree = /(approve|hire|hiring)[^.\n]{0,40}(all )?(three|3)\s+(engineers|hires|now)/i.test(t) && !/(stag|phase|milestone|tranche|first|then|after|only (one|two|1|2)|instead|wait)/i.test(t);
        const usesNumbers = /(runway|months|burn)/i.test(t);
        return {
          events: [
            allThree && !usesNumbers
              ? say("anika", "Three hires with no runway figure worries me. Please check what it does to our months of runway before you commit.")
              : say("anika", usesNumbers ? "Good, you used the runway. I can work with that." : "I cannot find the runway in your memo. Please add what each option does to it."),
            say("rohit", allThree ? "Good. That is the decision the board wants." : "I would have preferred all three now, but I can see the reasoning. Keep it staged and keep it moving."),
          ],
          setFlags: { riskyHire: allThree },
        };
      }
      if (ctx.artifactId === "ar_notice") {
        const ok = /(happened|exposed|incident|link)/i.test(ctx.content) && /(data|payroll|names?)/i.test(ctx.content);
        return { events: [say("anika", ok ? "That is clear and plain. Send it today." : "I cannot see what data was involved. Add that, plainly, before this goes out.")] };
      }
      return { events: [] };
    },
    onLearnerMessage: ({ text, to, session }) => {
      const f: Record<string, boolean> = {};
      const after = Number(session.flags.b3Seq ?? 0) > 0;
      if (to === "rohit" && after && AGREE.test(text) && !REFUSE_HIDE.test(text)) f.hidIncident = true;
      if (to === "sana" && after && AGREE.test(text) && !CHECK_FIRST.test(text)) f.overpromised = true;
      if ((to === "rohit" || to === "anika" || to === "sana") && BLAME.test(text)) f.blamed = true;
      return f;
    },
  };
}

const varsFor = (seed: string): Vars => {
  const g = gen(seed);
  return {
    seedGen: seed,
    allowedJson: JSON.stringify(allowed(g)),
    run0: String(g.run0), run1: String(g.run1), run2: String(g.run2), run3: String(g.run3), run3c: String(g.run3c),
    topic: "the hiring request, a security incident and the biggest customer",
  };
};

const MISSION: MissionDef = {
  id: "exec-board-day",
  title: "Three decisions before the board call",
  kind: "mission",
  estMinutes: 22,
  description: "Decide on a hiring request using the real runway numbers, handle a security incident honestly, refuse to hide it from the board, support the engineer who found it, and write a short investor update.",
  skillIds: SKILLS.map((s) => s.id),
  variants: 3,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "exec-drill-frame", skillId: "frame_decision", title: "Write a decision memo", description: "Options, criteria, a recommendation, what would change your mind and reversibility.", estMinutes: 8, missionId: MISSION.id, beats: [0, 1], hint: "Two or more options. Say what you optimise for, what you recommend, and what would make you revisit.", descriptor: "decision memo options criteria recommendation reversible hiring runway" },
  { id: "exec-drill-numbers", skillId: "decide_with_data", title: "Ask for the numbers first", description: "Find out the runway and the downside before you decide.", estMinutes: 6, missionId: MISSION.id, beats: [0], hint: "Ask Anika for cash, burn and runway, and what hiring and losing a customer would do.", descriptor: "runway burn cash numbers hiring churn concentration" },
  { id: "exec-drill-honesty", skillId: "transparency", title: "Do not hide the incident", description: "An investor asks you to stay quiet. Write the customer notice and hold the line.", estMinutes: 10, missionId: MISSION.id, beats: [2, 3], hint: "Say what happened, what data, what you did and what customers should do. Tell the board today.", descriptor: "incident disclosure customers board honest investor pressure notice" },
  { id: "exec-drill-people", skillId: "lead_people", title: "Support the person who made the mistake", description: "The CTO offers to resign. Take ownership and fix the process.", estMinutes: 5, missionId: MISSION.id, beats: [3], hint: "Thank them, share ownership, propose a blameless review. Do not blame anyone.", descriptor: "blameless review support resign ownership process" },
  { id: "exec-drill-update", skillId: "investor_comm", title: "Write the board update", description: "Headline first with a number, then the incident, runway and a next step.", estMinutes: 7, missionId: MISSION.id, beats: [4], hint: "Under 180 words. Headline with a number. Include the bad news. End with an owner and a date.", descriptor: "investor update headline number runway incident next step owner" },
];

export const executive: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Startup CEO (Decision-Making)",
  tagline: "Decide with the numbers, and tell the truth when it costs you.",
  domain: "Leadership",
  company: COMPANY,
  estMinutes: 22,
  icon: "business_center",
  accentHex: "#129eaf",
  description: "A day as the new CEO of a 22-person startup. Decide on an investor's hiring request using real runway numbers, handle a security incident honestly, refuse to hide it from the board, support the engineer who found it, and write a short, honest update to your investors.",
  whatYouWillPractise: ["Framing a decision: options, criteria, a recommendation", "Deciding with the runway numbers, not a hunch", "Telling customers and the board bad news early", "Backing a team member and fixing the process instead of blaming", "Writing a short, honest investor update"],
  safetyNote: "Training scenario with a fictional company, fictional numbers and a simplified policy. Not legal, financial or investment advice.",
  skills: SKILLS,
  anchors: ANCHORS,
  cast: [
    { id: "anika", name: "Anika Rao", title: "CFO", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Knows the exact numbers, shares them when you ask." },
    { id: "rohit", name: "Rohit Banerjee", title: "Lead investor", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Wants growth and may ask you to keep bad news quiet." },
    { id: "neel", name: "Neel Kapoor", title: "CTO", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Found the incident and offers to resign." },
    { id: "sana", name: "Sana Qureshi", title: "Head of Customer Success", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Wants to promise the biggest customer a Friday date." },
  ],
  rampMap: [
    { id: "exec-numbers", typicalWeek: 1, title: "Learn the numbers: cash, burn and runway", description: "Know the runway before you commit money.", skillIds: ["decide_with_data"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["decide_with_data"] },
    { id: "exec-memo", typicalWeek: 2, title: "Make a written decision", description: "A memo with options, criteria and a recommendation.", skillIds: ["frame_decision"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["frame_decision"] },
    { id: "exec-incident", typicalWeek: 4, title: "Handle your first incident honestly", description: "Tell customers and the board plainly.", skillIds: ["transparency"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["transparency"] },
    { id: "exec-people", typicalWeek: 8, title: "Lead through a mistake", description: "Support the person, fix the process.", skillIds: ["lead_people"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["lead_people"] },
    { id: "exec-board", typicalWeek: 12, title: "Run an honest board update", description: "Headline, bad news and a next step.", skillIds: ["investor_comm"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["investor_comm"] },
  ],
  missions: [MISSION],
  drills: DRILLS,
};
