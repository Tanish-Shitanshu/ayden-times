import type { WorkItem } from "@ayden/contract";
import { firstSentence, int, pick, rng, said, wordCount } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, ScriptedEvent, Vars } from "../domain/types.js";
import { AGENT_LABEL, hit, person, say, sys, trapFrom } from "./helpers.js";
import { CONTROL_ANCHORS, CONTROL_DRILLS, CONTROL_MISSION, CONTROL_SKILLS } from "./consulting-controls.js";
import { near, parseSheet, findRow } from "./sheet.js";

const ROLE = "tech-consulting" as const;
const COMPANY = "Northbridge Advisory (fictional)";

const SCOPE = `# Engagement scope: FreshCart Retail margin review

**In scope:** explain why gross margin fell this year versus last year; recommend next analysis steps.
**Out of scope (needs a change request via Rhea):** store staffing analysis, supplier renegotiation support, pricing strategy.
**Deadline:** headline for the client call at 4 pm today.

*Fictional engagement for training.*
`;

const SKILLS = [
  { id: "structure", label: "Structure the problem (MECE)", description: "Break the question into non-overlapping branches and state a hypothesis to test.", targetLevel: 2, badge: "Structured the problem" },
  { id: "answer_first", label: "Lead with the answer", description: "Put the conclusion and a number first, then 2 or 3 reasons, briefly.", targetLevel: 2, badge: "Answer-first communicator" },
  { id: "numbers_integrity", label: "Numbers that tie to the data", description: "Every number you cite is in the data or derived from it. Flag data conflicts.", targetLevel: 2, badge: "Numbers that tie" },
  { id: "scope_mgmt", label: "Manage scope and confidence", description: "Do not agree to extra work directly. Loop in your manager. State your confidence.", targetLevel: 2, badge: "Protected the scope" },
  { id: "stakeholder_comm", label: "Communicate to a senior client", description: "Be concise and respectful and propose a next step with an owner.", targetLevel: 2, badge: "Client-ready communication" },
  { id: "recommend", label: "Say what to do about it", description: "Put a rupee figure on the impact, recommend an action, name a risk, and give the next step.", targetLevel: 3, badge: "Recommended with impact" },
];

export interface Gen {
  cats: string[];
  s0: number[]; s1: number[]; m0: number[]; m1: number[];
  total0: number; total1: number; drop: number; mix: number; rate: number; mixShare: number;
  fin: number; ops: number; impact: number;
}

export function gen(seed: string): Gen {
  const r = rng(seed);
  const names = pick(r, [["Fresh produce", "Packaged foods", "Private label"], ["Dairy", "Beverages", "Value range"], ["Bakery", "Household", "Store brand"]]);
  const cShift = int(r, 8, 12);
  const s0 = [45, 35, 20];
  const s1 = [45 - cShift + 1, 34, 20 + cShift - 1 + 0];
  const sum = s1.reduce((a, b) => a + b, 0);
  s1[1] += 100 - sum;
  const m0 = [32, 24, 12];
  const m1 = [m0[0]! - 0.4, m0[1]! - 0.2, m0[2]! - 0.2];
  const tot = (s: number[], m: number[]) => s.reduce((a, v, i) => a + (v / 100) * m[i]!, 0);
  const total0 = tot(s0, m0);
  const total1 = tot(s1, m1);
  const mix = s1.reduce((a, v, i) => a + ((v - s0[i]!) / 100) * m0[i]!, 0);
  const rate = s1.reduce((a, v, i) => a + (v / 100) * (m1[i]! - m0[i]!), 0);
  const drop = total0 - total1;
  const fin = int(r, 410, 480);
  return { cats: names, s0, s1, m0, m1, total0, total1, drop, mix: -mix, rate: -rate, mixShare: Math.round((mix / (mix + rate)) * 100), fin, ops: Math.round(fin * 1.021 * 10) / 10, impact: Math.round(fin * drop * 10) / 1000 };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Numbers a learner may legitimately cite. */
function allowed(g: Gen): number[] {
  const out = [...g.s0, ...g.s1, ...g.m0, ...g.m1, g.total0, g.total1, g.drop, g.mix, g.rate, g.mixShare, 100 - g.mixShare, g.fin, g.ops, 1.4, 2.1, g.fin * 0.021, g.impact, g.fin * g.mix / 100, g.fin * g.rate / 100];
  for (let i = 0; i < 3; i++) out.push(g.s1[i]! - g.s0[i]!, g.m0[i]! - g.m1[i]!);
  return out.flatMap((n) => [n, r1(n), Math.round(n)]);
}

const MEASURE = /(\d+(?:\.\d+)?)\s?(%|pts?\b|points?\b|pp\b|crore|cr\b)/gi;

function cited(text: string): number[] {
  return [...text.matchAll(MEASURE)].map((m) => parseFloat(m[1]!));
}

const body = (t: string) => t.split("\n").filter((l) => !/^\s*(hi|hello|dear)\b/i.test(l) && l.trim()).join(" ");
const b3 = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.b3Seq ?? Number.POSITIVE_INFINITY);

const ANCHORS: AnchorDef[] = [
  {
    id: "tree_branches", skillId: "structure", kind: "code", text: "Issue tree has at least 3 branches",
    eval: (c) => {
      const t = c.artifacts["ar_tree"] ?? "";
      return { met: t.split("\n").filter((l) => /^\s*([-*•]|\d+[.)]|[A-Za-z][.)])\s+\S/.test(l)).length >= 3, seq: c.session.artifacts["ar_tree"]?.seq, note: "List at least three branches (for example price, volume, mix, cost)." };
    },
  },
  {
    id: "tree_mece", skillId: "structure", kind: "judge", text: "Branches cover price, volume, mix and cost without overlapping",
    judgeInstruction: "Are the branches mutually exclusive and collectively exhaustive for a margin question (price, volume, mix, cost)?",
    eval: (c) => {
      const t = c.artifacts["ar_tree"] ?? "";
      const groups = [/price|pricing|discount|promo/i, /volume|units|traffic|footfall/i, /mix|category|share|composition/i, /cost|supplier|procure|cogs/i];
      return { met: groups.filter((g) => g.test(t)).length >= 3, seq: c.session.artifacts["ar_tree"]?.seq, note: "Cover at least three of price, volume, mix and cost." };
    },
  },
  {
    id: "hypothesis", skillId: "structure", kind: "judge", text: "States a hypothesis to test",
    judgeInstruction: "Does the learner state a hypothesis (a first guess to test) rather than only listing areas?",
    eval: (c) => ({ met: /(hypothes|i (think|suspect|expect|believe)|likely|probably)/i.test(c.artifacts["ar_tree"] ?? "") || !!said(c.events, /(hypothes|i (think|suspect)|likely)/i, { to: "rhea" }), seq: c.session.artifacts["ar_tree"]?.seq }),
  },
  {
    id: "first_line_answer", skillId: "answer_first", kind: "code", text: "First sentence gives the answer with a number",
    eval: (c) => {
      const t = body(c.artifacts["ar_update"] ?? "");
      const first = firstSentence(t);
      return { met: /(mix|supplier|price|volume|cost|shift)/i.test(first) && /\d/.test(first), seq: c.session.artifacts["ar_update"]?.seq, quote: first.slice(0, 120) || undefined, note: "Open with the answer and a number." };
    },
  },
  {
    id: "supports_reasons", skillId: "answer_first", kind: "judge", text: "Supports it with two or three reasons",
    judgeInstruction: "After the answer, does the update give two or three supporting reasons?",
    eval: (c) => { const t = c.artifacts["ar_update"] ?? ""; return { met: t.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l)).length >= 2 || /(first|second|because)/i.test(t), seq: c.session.artifacts["ar_update"]?.seq }; },
  },
  {
    id: "short", skillId: "answer_first", kind: "code", text: "Update is 150 words or fewer",
    eval: (c) => ({ met: !!c.artifacts["ar_update"] && wordCount(c.artifacts["ar_update"]!) <= 150, seq: c.session.artifacts["ar_update"]?.seq, note: "Keep it under 150 words." }),
  },
  {
    id: "numbers_tie", skillId: "numbers_integrity", kind: "code", text: "Every number cited ties to the data",
    eval: (c) => {
      const t = c.artifacts["ar_update"] ?? "";
      const nums = cited(t);
      const ok = JSON.parse(c.vars.allowedJson!) as number[];
      const bad = nums.filter((n) => !ok.some((a) => Math.abs(a - n) <= 0.15));
      return { met: nums.length >= 1 && bad.length === 0, seq: c.session.artifacts["ar_update"]?.seq, quote: bad.length ? String(bad[0]) : undefined, note: nums.length ? `A number you cited does not match the data: ${bad[0] ?? ""}` : "Cite at least one number from the data." };
    },
  },
  {
    id: "cites_mix", skillId: "numbers_integrity", kind: "code", text: "Identifies mix shift (not supplier price) as the main driver",
    eval: (c) => {
      const t = c.artifacts["ar_update"] ?? "";
      const first = firstSentence(body(t));
      return { met: /mix|share|category shift|shift (to|towards)/i.test(t) && !(/supplier/i.test(first) && !/mix/i.test(first)), seq: c.session.artifacts["ar_update"]?.seq, quote: first.slice(0, 120) || undefined, note: "The data points to mix shift, not supplier prices." };
    },
  },
  {
    id: "flags_discrepancy", skillId: "numbers_integrity", kind: "judge", text: "Flags the finance-versus-ops data discrepancy",
    judgeInstruction: "Did the learner flag that two data sources (finance and ops) disagree on total revenue?",
    eval: (c) => ({ met: /(discrepan|differ|mismatch|reconcil|two sources|finance.*ops|ops.*finance)/i.test(c.artifacts["ar_update"] ?? "") || !!said(c.events, /(discrepan|differ|mismatch|reconcil|two sources)/i, { to: ["rhea", "imran"] }), seq: c.session.artifacts["ar_update"]?.seq }),
  },
  {
    id: "no_direct_yes", skillId: "scope_mgmt", kind: "judge", text: "Did not agree to the extra analysis directly",
    judgeInstruction: "When the client asked for an extra analysis, did the learner avoid agreeing directly and instead involve their manager / scope?",
    eval: (c) => {
      const ms = c.learner.filter((e) => e.kind === "message" && e.to === "sethi" && e.seq > b3(c));
      const agrees = ms.some((e) => /(sure|yes|will do|no problem|by monday|i'?ll (do|send))/i.test(e.body) && !/(rhea|discuss|scope|check with|team|change request)/i.test(e.body));
      return ms.length > 0 && !agrees ? { met: true, seq: ms[0]!.seq, quote: ms[0]!.body.slice(0, 120) } : { met: false };
    },
  },
  {
    id: "pinged_rhea", skillId: "scope_mgmt", kind: "code", text: "Told Rhea about the scope request",
    eval: (c) => hit(said(c.events, /(staff|store|scope|extra|monday|change request|additional)/i, { to: "rhea", after: b3(c) })),
  },
  {
    id: "stated_confidence", skillId: "scope_mgmt", kind: "judge", text: "Stated confidence and caveats",
    judgeInstruction: "Did the learner state how confident they are and what could change the answer (caveats, assumptions, data reconciliation)?",
    eval: (c) => hit(said(c.events, /(confiden|caveat|depends|subject to|assum|preliminar|early|validate|not (yet )?sure)/i, { to: "sethi" })),
  },
  {
    id: "concise_respectful", skillId: "stakeholder_comm", kind: "code", text: "Replies to the client are concise",
    eval: (c) => {
      const ms = c.learner.filter((e) => e.kind === "message" && e.to === "sethi");
      return { met: ms.length > 0 && ms.every((e) => wordCount(e.body) <= 90), seq: ms[0]?.seq, note: "Keep replies to the client under 90 words." };
    },
  },
  {
    id: "next_step", skillId: "stakeholder_comm", kind: "judge", text: "Proposed a next step with an owner",
    judgeInstruction: "Did the learner propose a concrete next step and say who owns it?",
    eval: (c) => hit(said(c.events, /(next step|next|will|by (mon|tue|wed|thu|fri|tomorrow|end of day|eod)|we (will|can)|rhea)/i, { to: "sethi" })),
  },
  {
    id: "asked_objective", skillId: "structure", kind: "code", text: "Asked what decision the client needs to make",
    eval: (c) => hit(said(c.events, /(decision|objective|what (does|do) (he|they|the client) (want|need)|goal|success|who (is|are)|what.{0,20}(for|use)|by when|deadline|scope)/i, { to: "rhea" })),
  },
  {
    id: "bridge_values", skillId: "numbers_integrity", kind: "code", text: "Margin bridge ties: last year, mix, rate and this year",
    eval: (c) => {
      const g = gen(c.vars.seedGen!);
      const rows = parseSheet(c.artifacts["ar_bridge"] ?? "");
      const has = (re: RegExp, target: number) => { const r = findRow(rows, re); return !!r && r.nums.some((n) => near(Math.abs(n), target, 0.06)); };
      const ok = [has(/last year/i, g.total0), has(/mix/i, g.mix), has(/rate|within|price|cost/i, g.rate), has(/this year/i, g.total1)];
      return { met: ok.filter(Boolean).length === 4, seq: c.session.artifacts["ar_bridge"]?.seq, note: `${ok.filter(Boolean).length} of 4 bridge rows tie. Last year ${r1(g.total0)}%, mix -${r1(g.mix)}, rate -${r1(g.rate)}, this year ${r1(g.total1)}%.` };
    },
  },
  {
    id: "quantified_impact", skillId: "recommend", kind: "code", text: "Puts a rupee figure on the impact",
    eval: (c) => {
      const g = gen(c.vars.seedGen!);
      const t = c.artifacts["ar_update"] ?? "";
      const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s?(?:crore|cr\b)/gi)].map((m) => parseFloat(m[1]!));
      return { met: nums.some((n) => near(n, g.impact, 0.4)), seq: c.session.artifacts["ar_update"]?.seq, note: `The margin fall is worth about ₹${g.impact} crore of gross profit on ₹${g.fin} crore revenue.` };
    },
  },
  {
    id: "recommendation", skillId: "recommend", kind: "code", text: "Recommends a specific action",
    eval: (c) => {
      const t = c.artifacts["ar_update"] ?? "";
      return { met: /(recommend|should|propose|suggest|we (will|can) )/i.test(t) && /(assortment|range|pricing|price|promo|shelf|space|pack|bundle|private label|mix|rebalanc|margin)/i.test(t), seq: c.session.artifacts["ar_update"]?.seq, note: "Say what the client should do about the mix, for example rebalancing the range or promotions." };
    },
  },
  {
    id: "risk_and_next", skillId: "recommend", kind: "judge", text: "Names a risk or caveat and a next step", judgeInstruction: "Does the summary name one risk or caveat (for example the revenue data conflict) and a concrete next step?",
    eval: (c) => ({ met: /(risk|caveat|assum|confiden|depends|reconcil|discrepan)/i.test(c.artifacts["ar_update"] ?? "") && /(next step|by (mon|tue|wed|thu|fri|tomorrow|end of)|we will|i will|rhea will|owner)/i.test(c.artifacts["ar_update"] ?? ""), seq: c.session.artifacts["ar_update"]?.seq }),
  },
  {
    id: "stated_source", skillId: "recommend", kind: "code", text: "Said which revenue source the figure uses",
    eval: (c) => ({ met: /(finance (ledger|figure|number)|ledger|ops (system|figure)|operations (system|figure)|source)/i.test(`${c.artifacts["ar_update"] ?? ""}\n${c.artifacts["ar_bridge"] ?? ""}`), seq: c.session.artifacts["ar_update"]?.seq, note: "Say whether the rupee figure uses the finance ledger or the operations system." }),
  },
];

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { vars: V, drill } = args;
  const g = gen(V.seedGen!);
  const items: WorkItem[] = [
    { id: "it_scope", type: "doc", title: "Engagement scope", markdown: SCOPE },
    { id: "it_margin", type: "table", title: "Margin by category", columns: ["Category", "Revenue share last year (%)", "Revenue share this year (%)", "Margin last year (%)", "Margin this year (%)"], rows: g.cats.map((c, i) => [c, g.s0[i]!, g.s1[i]!, g.m0[i]!, g.m1[i]!]), note: `Overall gross margin: ${r1(g.total0)}% last year, ${r1(g.total1)}% this year.` },
    { id: "it_supplier", type: "table", title: "Supplier price change", columns: ["Category", "Supplier price change this year (%)"], rows: g.cats.map((c) => [c, 1.4]) },
    { id: "it_recon", type: "table", title: "Total revenue, two sources (₹ crore)", columns: ["Source", "Total revenue"], rows: [["Finance ledger", g.fin], ["Operations system", g.ops]], note: "The two sources disagree." },
    { id: "it_method", type: "doc", title: "How to build a margin bridge", markdown: `# Margin bridge (standard method)

A **bridge** splits the change in gross margin (in percentage points) into causes.

- **Mix effect** = sum over categories of (share this year minus share last year) x margin last year. It shows what the shift between categories did.
- **Rate effect** = sum over categories of share this year x (margin this year minus margin last year). It shows what a change in the margin *within* each category did.
- Last year's margin + mix effect + rate effect = this year's margin.
- **Impact in rupees** = this year's revenue x the fall in margin points / 100.

Use the finance ledger revenue unless told otherwise, and say which source you used.` },
    { id: "it_email", type: "doc", title: "Client email", markdown: "**From:** Arvind Sethi (CFO, FreshCart)\n\nWhy did our gross margin fall this year? Please send your view before our 4 pm call." },
  ];
  const allBeats = [
    {
      title: "Brief and clarify",
      objective: "Read the engagement scope and the client's email. Ask Rhea anything unclear before you start.",
      onEnter: [say("rhea", V.weaveOpening ?? "Morning. FreshCart's CFO wants to know why gross margin fell this year. Call is at 4 pm. Have a look at the scope and the data and tell me if anything is unclear.", { quickReplies: ["What do you need by when?", "Is store staffing in scope?"] })],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_scope" }, { t: "messaged" as const, to: "rhea", n: 1 }] },
    },
    {
      title: "Structure the problem",
      objective: "Write your issue tree: the branches you will test, and your first hypothesis.",
      onEnter: [say("imran", "FYI: the finance ledger and the operations system disagree on total revenue by about 2%. Not sure which one is right. Might matter.")],
      advanceWhen: { t: "artifact" as const, id: "ar_tree" },
    },
    {
      title: "Build the margin bridge",
      objective: "Use the margin table and the method note to split the fall in margin into mix and rate effects, in Excel. Submit the bridge as a spreadsheet.",
      onEnter: [say("rhea", "Good. Before we write anything, I want the numbers: a margin bridge, last year to this year, split into mix and rate. The method is in your work items. Send it as a spreadsheet.", { quickReplies: ["Which revenue figure do I use?", "How do I treat the data conflict?"] })],
      advanceWhen: { t: "artifact" as const, id: "ar_bridge" },
    },
    {
      title: "Write the executive summary",
      objective: "Write the one-paragraph executive summary for the 4 pm call: the answer first with a number, the ₹ impact, two reasons, a recommendation, one risk and the next step. 150 words or fewer. You can export it as a PDF.",
      onEnter: [say("rhea", "Nice. Now the headline I can use on the call. Answer first, the rupee impact, what you recommend, and the next step. Keep it short.")],
      advanceWhen: { t: "artifact" as const, id: "ar_update" },
    },
    {
      title: "Client call",
      objective: "The client has replied. Answer him and handle his extra request. Then finish.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (ctx.session.flags.claimedSupplier) out.push({ from: "rhea", to: "you", channel: "chat", kind: "consequence", body: "FreshCart's procurement has started renegotiating supplier contracts based on our note. The data points to mix shift, not supplier prices. We need to correct this with the client.", setFlags: { retract: true } });
        out.push(
          say("partner", "Rhea tells me you have the headline. What is it in one sentence?"),
          say("sethi", "Thanks for the update. So it's supplier prices, right? I'll ask procurement to renegotiate today. Also, can you do a store-staffing analysis by Monday?", { setFlags: { b3Seq: -1 } }),
        );
        return out;
      },
      advanceWhen: { t: "messaged" as const, to: "sethi", n: 1, scope: "beat" as const },
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
    title: drill ? `Drill: ${drill.title}` : "Why did FreshCart's margin fall?",
    company: COMPANY,
    hint: drill?.hint,
    clockStart: { day: "Thu", minute: 9 * 60 },
    clockTotal: 420,
    people: [
      person("rhea", "Rhea Kulkarni", "Engagement Manager", 350, "You are the engagement manager. You want answers first, short, with numbers that tie to the data. You do not like surprises with scope. You know the data shows mix shift.", ["Fine. What do you need from me?", "Keep it short and answer first."]),
      person("imran", "Imran Qureshi", "Analyst teammate", 140, "You are a friendly analyst who shares data. You noticed that finance and ops totals differ by about 2% and you are not sure what to do.", ["Happy to help. Check the recon table.", "Not sure which is right, honestly."]),
      person("sethi", "Arvind Sethi", "Client CFO (FreshCart)", 30, "You are the client's CFO. You are senior, direct and impatient. You jump to conclusions (supplier prices) and ask for extra work casually. You respect people who are clear and calm.", ["I need something I can act on today.", "Please keep it brief."]),
      person("partner", "Dev Malhotra", "Partner", 210, "You are the partner. You ask for the headline in one sentence and have little time.", ["One sentence, please.", "Good. Keep Rhea in the loop."]),
    ],
    items,
    artifacts: [
      { id: "ar_tree", kind: "text", title: "Issue tree", instructions: "List the branches you will test (non-overlapping) and your first hypothesis.", template: "Question: why did gross margin fall?\n- Branch 1:\n- Branch 2:\n- Branch 3:\nHypothesis:\n", required: true, maxChars: 1500 },
      { id: "ar_bridge", kind: "spreadsheet", title: "Margin bridge", instructions: "Four rows: margin last year, mix effect, rate effect, margin this year, all in percentage points. Upload an .xlsx, or fill in the table. Cells are separated by | .", template: "Item | Percentage points\nMargin last year | \nMix effect | \nRate effect | \nMargin this year | \n", required: true, maxChars: 1500 },
      { id: "ar_update", kind: "email", title: "Executive summary", instructions: "Answer first with a number, the rupee impact, 2 or 3 reasons, a recommendation, one risk and the next step. Under 150 words. Mention data caveats. Use Export PDF to send it.", template: "Hi Rhea,\n\n", required: true, maxChars: 1500 },
    ],
    beats,
    triggers: [],
    replies: {
      rhea: [
        { match: /(staff|scope|in scope|extra)/i, text: "Store staffing is out of scope. If the client asks, tell me and we'll raise a change request." },
        { match: /(when|by|deadline|need)/i, text: "Headline by 3:30 for the 4 pm call." },
      ],
      imran: [{ match: /(which|right|finance|ops|recon)/i, text: "I'd flag it as a caveat. I can't tell which is right yet." }],
      sethi: [
        { match: /(rhea|scope|change request|team|discuss)/i, text: "Okay, fine, speak to Rhea. But I need an answer soon." },
        { match: /(sure|yes|will do|no problem|monday)/i, text: "Excellent. I'll tell my team it's coming Monday.", setFlags: { promisedStaffing: true } },
      ],
      partner: [{ match: /./, text: "Good. Keep Rhea in the loop on anything beyond the headline." }],
    },
    facts: [{ id: "mix-answer", text: `The margin fall is mostly mix shift (${g.mixShare}% of the drop).`, knownBy: ["rhea"], leak: [/mix shift/i, /\d+% of the drop/i] }],
    cost: { message: 3, open: 1, checks: 0, submit: 10, advance: 10 },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "cites_mix", "Blaming supplier prices", "supplier-price"),
      trapFrom(ANCHORS, "numbers_tie", "Numbers that do not tie", "numbers"),
      trapFrom(ANCHORS, "flags_discrepancy", "Unflagged data conflict", "data-conflict"),
      trapFrom(ANCHORS, "no_direct_yes", "Scope creep from the client", "scope-creep"),
    ],
    judgeContext: `A graduate consultant must explain a margin fall of ${r1(g.drop)} points. The true cause is mostly mix shift (${g.mixShare}% of the drop), not supplier prices. Finance and ops revenue totals disagree by about 2%. The client CFO jumps to supplier prices and asks for an out-of-scope store-staffing analysis.`,
    onSubmit: async (ctx) => {
      if (ctx.artifactId === "ar_tree") return { events: [say("rhea", ctx.content.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])/.test(l)).length >= 3 ? "Good structure. Test mix first, I suspect it matters most." : "I can only see a couple of branches. Think price, volume, mix and cost.")] };
      if (ctx.artifactId === "ar_bridge") {
        const rows = parseSheet(ctx.content).filter((r) => r.nums.length >= 1);
        return { events: [say("rhea", rows.length >= 4 ? "Thanks. That tells us where to look. Now the summary for the call." : "I need all four rows: last year, mix effect, rate effect, this year.")] };
      }
      if (ctx.artifactId !== "ar_update") return { events: [] };
      const first = firstSentence(body(ctx.content));
      const claimsSupplier = /supplier/i.test(first) && !/mix/i.test(first);
      const answerFirst = /\d/.test(first) && /(mix|supplier|price|volume|cost|shift)/i.test(first);
      return {
        events: [
          answerFirst
            ? say("rhea", claimsSupplier ? "Clear, but are we sure it's supplier prices? Check against the margin table before I use this." : "Clear. I'll use that on the 4 pm call.", { rephrase: { personId: "rhea", mustContain: [claimsSupplier ? "sure" : "4 pm"] } })
            : say("rhea", "I can't find the answer in the first line. Rework it so the first sentence says what happened and by how much."),
        ],
        setFlags: { claimedSupplier: claimsSupplier },
      };
    },
    // seedGen is part of vars so builds are reproducible
  };
}

const varsFor = (seed: string): Vars => {
  const g = gen(seed);
  return { seedGen: seed, allowedJson: JSON.stringify(allowed(g)), topic: "retail margin review", mixShare: String(g.mixShare) };
};

const MISSION: MissionDef = {
  id: "cons-margin-review",
  title: "Why did the client's margin fall, and what should they do?",
  kind: "mission",
  estMinutes: 25,
  description: "A strategy-style case. Structure the problem, build a margin bridge in Excel, put a rupee figure on the impact, write an answer-first executive summary with a recommendation, flag a data conflict, and handle a client who jumps to the wrong conclusion and asks for out-of-scope work.",
  skillIds: SKILLS.map((s) => s.id),
  variants: 3,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "cons-drill-answer-first", skillId: "answer_first", title: "Write the headline first", description: "A fresh dataset. Write an update where the first sentence is the answer.", estMinutes: 8, missionId: MISSION.id, beats: [2, 3], hint: "First sentence: what happened and by how much. Then 2 or 3 reasons.", descriptor: "answer first headline short update numbers reasons" },
  { id: "cons-drill-numbers", skillId: "numbers_integrity", title: "Make every number tie to the data", description: "Build the margin bridge and flag the data conflict.", estMinutes: 8, missionId: MISSION.id, beats: [1, 2], hint: "Cite only numbers from the tables or derived from them. Flag where sources disagree.", descriptor: "numbers tie data conflict discrepancy mix supplier" },
  { id: "cons-drill-scope", skillId: "scope_mgmt", title: "Say no to scope creep politely", description: "The client asks for extra work. Route it through your manager.", estMinutes: 5, missionId: MISSION.id, beats: [4], hint: "Do not agree directly. Involve Rhea and state your confidence.", descriptor: "scope creep client extra analysis manager change request confidence" },
  { id: "cons-drill-recommend", skillId: "recommend", title: "Put a rupee figure on it and recommend", description: "Turn the margin fall into rupees and say what to do.", estMinutes: 7, missionId: MISSION.id, beats: [3], hint: "Revenue x the fall in margin points / 100. Then a recommendation, a risk and a next step.", descriptor: "recommendation rupee impact next step risk executive summary" },
  { id: "cons-drill-structure", skillId: "structure", title: "Build a MECE issue tree", description: "Write non-overlapping branches and a hypothesis.", estMinutes: 6, missionId: MISSION.id, beats: [0, 1], hint: "Price, volume, mix, cost. State a hypothesis.", descriptor: "issue tree mece branches hypothesis" },
  { id: "cons-drill-client", skillId: "stakeholder_comm", title: "Reply to a senior client", description: "Be concise and propose a next step with an owner.", estMinutes: 5, missionId: MISSION.id, beats: [4], hint: "Under 90 words. Say who does what by when.", descriptor: "client communication concise next step owner" },
];

export const techConsulting: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Consulting and Advisory Analyst",
  tagline: "Structure it, prove it with numbers, recommend, and stay independent.",
  domain: "Consulting",
  company: COMPANY,
  estMinutes: 25,
  icon: "insights",
  accentHex: "#d93025",
  description: "The first projects of a graduate at a strategy or Big-4 style advisory firm. Mission 1 (strategy): structure a margin problem, build a margin bridge in Excel, put a rupee figure on it, and recommend, while handling a CFO who jumps to the wrong answer. Mission 2 (advisory): test a payment sample against a control, rate each exception, write an honest finding, and stay independent when the client wants it softened. Practice for these firms; not affiliated with any of them.",
  whatYouWillPractise: ["Structuring a problem without overlap (MECE) and stating a hypothesis", "A margin bridge in Excel: mix versus rate", "An answer-first executive summary with a rupee impact and a recommendation", "Testing a sample against a control and rating each exception", "Independence: not softening a finding, not sharing a draft", "Managing scope and talking to a senior client"],
  skills: [...SKILLS, ...CONTROL_SKILLS],
  anchors: [...ANCHORS, ...CONTROL_ANCHORS],
  cast: [
    { id: "rhea", name: "Rhea Kulkarni", title: "Engagement Manager", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Wants the answer first, short, with numbers that tie." },
    { id: "imran", name: "Imran Qureshi", title: "Analyst teammate", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Shares data and spots a discrepancy." },
    { id: "sethi", name: "Arvind Sethi", title: "Client CFO", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Jumps to supplier prices and asks for extra work." },
    { id: "partner", name: "Dev Malhotra", title: "Partner", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Wants the headline in one sentence." },
  ],
  rampMap: [
    { id: "cons-scope", typicalWeek: 1, title: "Understand the client and the scope", description: "Know what is in and out of scope.", skillIds: ["scope_mgmt"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["scope_mgmt"] },
    { id: "cons-numbers", typicalWeek: 1, title: "Do a first data pull and sanity check", description: "Numbers tie and conflicts are flagged.", skillIds: ["numbers_integrity"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["numbers_integrity"] },
    { id: "cons-update", typicalWeek: 2, title: "Send a first structured, answer-first update", description: "Structure and lead with the answer.", skillIds: ["structure", "answer_first"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["structure", "answer_first"] },
    { id: "cons-client", typicalWeek: 4, title: "Speak to a senior client", description: "Concise, with next steps.", skillIds: ["stakeholder_comm"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["stakeholder_comm"] },
    { id: "cons-recommend", typicalWeek: 4, title: "Quantify the impact and recommend", description: "A rupee figure, an action, a risk and a next step.", skillIds: ["recommend"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["recommend"] },
    { id: "cons-controls", typicalWeek: 4, title: "Test a control and write a finding", description: "Advisory mission: test, rate and report honestly.", skillIds: ["test_sample", "rate_risk", "write_finding", "independence"], coveredBy: { kind: "mission", id: CONTROL_MISSION.id }, requires: ["test_sample", "write_finding"] },
    { id: "cons-slide", typicalWeek: 8, title: "Own a workstream slide", description: "Planned for a later version.", skillIds: [], coveredBy: null },
    { id: "cons-module", typicalWeek: 12, title: "Lead a module", description: "Planned for a later version.", skillIds: [], coveredBy: null },
  ],
  missions: [MISSION, CONTROL_MISSION],
  drills: [...DRILLS, ...CONTROL_DRILLS],
};
