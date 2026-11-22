import type { WorkItem } from "@ayden/contract";
import { firstSentence, int, pick, rng, said, wordCount } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, ScriptedEvent, SubmitReaction, Vars } from "../domain/types.js";
import { AGENT_LABEL, hit, person, say, sys, trapFrom } from "./helpers.js";
import { citedMoney, findRow, near, nearPct, parseSheet } from "./sheet.js";

/**
 * Junior Financial Analyst: "Where did the budget go, and who gets the rest?"
 * Work product is a workbook (Excel in, Excel out) and a short memo (PDF out). Numbers are generated from the seed
 * by the engine; the rules come from standard FP&A practice (variance analysis, one-off vs recurring, return per rupee,
 * contingency). The AI plays the colleagues; the engine checks the work.
 */

const ROLE = "finance-analyst" as const;
const COMPANY = "Kaveri Home Appliances (fictional)";
const MARGIN = 0.3;

const SKILLS = [
  { id: "variance", label: "Get the variances right", description: "Compute budget vs actual correctly, show the variance and percentage, and flag what needs a look.", targetLevel: 3, badge: "Variances that tie out" },
  { id: "causes", label: "Find what is behind the numbers", description: "Ask the owners, spot a duplicate entry, and separate a one-off from the run rate.", targetLevel: 3, badge: "Looked behind the numbers" },
  { id: "allocate", label: "Split the budget with a rule", description: "Rank requests by profit per rupee, fund the must-pay first, and never fund beyond a request.", targetLevel: 4, badge: "Allocated with logic" },
  { id: "protect", label: "Protect cash and policy", description: "Keep the contingency, stay inside the pool, and do not give way to pressure without a reason.", targetLevel: 3, badge: "Protected the downside" },
  { id: "brief", label: "Brief the CFO answer-first", description: "A short memo: the decision first with a number, an assumption, a risk and a next step.", targetLevel: 3, badge: "CFO-ready brief" },
];

const POLICY = (pool: number, contingency: number) => `# Kaveri allocation policy (fictional training policy)

1. **Explain big variances.** Any line more than 10% away from budget gets a flag and a cause before it is used in a decision.
2. **Separate one-offs.** A one-off cost (for example a launch event) is excluded when working out the normal run rate.
3. **Compare on profit, not revenue.** Revenue is turned into profit using the gross margin of ${Math.round(MARGIN * 100)}%. Savings are already profit.
4. **Fund by profit per rupee.** After must-pay items, fund requests in order of profit per rupee. Never give a department more than it asked for.
5. **Keep a contingency.** Keep 10% of the pool (₹${contingency} lakh) unallocated. Using it needs the CFO's approval.
6. **Say it first.** Briefings to the CFO start with the decision and a number, then the assumption, the risk and the next step.

The pool to allocate is ₹${pool} lakh (all figures in ₹ lakh).

*A simplified, fictional training policy. Not financial advice.*
`;

interface Line { dept: string; line: string; b: number; a: number; v: number; pct: number; flag: boolean }

export interface Gen {
  lines: Line[]; oneOff: number; dup: number; invoice: string; vendor: string;
  pool: number; contingency: number; allocatable: number; mustPay: number;
  req: Record<string, number>; p: Record<string, number>; // profit per rupee
  spendM: number; revM: number; saving: number; saved: number;
  expected: Record<string, number>; order: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const DEPTS = ["Marketing", "Operations", "Customer Service"];

export function gen(seed: string, v: number): Gen {
  const r = rng(seed + ":fin");
  const base = [
    { dept: "Marketing", line: "Digital ads", b: 30 },
    { dept: "Marketing", line: "Events", b: 10 },
    { dept: "Marketing", line: "Content", b: 8 },
    { dept: "Operations", line: "Warehouse", b: 40 },
    { dept: "Operations", line: "Freight", b: 25 },
    { dept: "Operations", line: "Packaging", b: 12 },
    { dept: "Customer Service", line: "Support staff", b: 22 },
    { dept: "Customer Service", line: "Tools", b: 6 },
  ];
  const oneOff = int(r, 10, 16);
  const dup = int(r, 3, 5);
  const calm = [-6, -4, -2, 2, 4, 7, 9];
  const lines: Line[] = base.map((x) => {
    let a: number;
    if (x.line === "Events") a = x.b + oneOff;
    else if (x.line === "Freight") a = r1(x.b * (1 + pick(r, calm) / 100)) + dup;
    else if (x.line === "Digital ads") a = r1(x.b * (1 + pick(r, [12, 15, 18]) / 100));
    else a = r1(x.b * (1 + pick(r, calm) / 100));
    const vv = r1(a - x.b);
    const pct = r1((vv / x.b) * 100);
    return { ...x, a, v: vv, pct, flag: Math.abs(pct) > 10 };
  });
  const pool = pick(r, [90, 100, 110]);
  const contingency = Math.round(pool * 0.1);
  const allocatable = pool - contingency;
  const mustPay = 6;
  // profit per rupee: a different department is best in each variant
  const vals = [0.8, 1.3, 2.1];
  const rot = v % 3;
  const p: Record<string, number> = {
    Marketing: vals[(0 + rot) % 3]!,
    Operations: vals[(1 + rot) % 3]!,
    "Customer Service": vals[(2 + rot) % 3]!,
  };
  const req: Record<string, number> = { Marketing: int(r, 38, 44), Operations: int(r, 34, 40), "Customer Service": int(r, 14, 18) };
  if (req.Marketing! + req.Operations! + req["Customer Service"]! <= allocatable + 6) req.Marketing! += 8;
  const mActual = lines.filter((l) => l.dept === "Marketing").reduce((s, l) => s + l.a, 0);
  const spendM = r1(mActual - oneOff);
  const revM = Math.round((p.Marketing! / MARGIN) * spendM);
  const saving = Math.round(p.Operations! * req.Operations!);
  const saved = Math.round(p["Customer Service"]! * req["Customer Service"]!);
  // expected allocation: must-pay first, then by profit per rupee, capped at the request
  const expected: Record<string, number> = { Marketing: 0, Operations: 0, "Customer Service": mustPay };
  let left = allocatable - mustPay;
  const order = [...DEPTS].sort((x, y) => p[y]! - p[x]!);
  for (const d of order) {
    const cap = d === "Customer Service" ? req[d]! - mustPay : req[d]!;
    const give = Math.min(cap, left);
    expected[d] = expected[d]! + give;
    left -= give;
  }
  const inv = `INV-${int(r, 4100, 4899)}`;
  return { lines, oneOff, dup, invoice: inv, vendor: pick(r, ["Shreeji Carriers", "BlueLine Freight", "Naveen Transport"]), pool, contingency, allocatable, mustPay, req, p, spendM, revM, saving, saved, expected, order };
}

const allowedNums = (g: Gen): number[] => {
  const out = [g.pool, g.contingency, g.allocatable, g.mustPay, g.oneOff, g.dup, g.spendM, g.revM, g.saving, g.saved, 30, 10, ...Object.values(g.req), ...Object.values(g.expected), ...g.lines.flatMap((l) => [l.b, l.a, l.v])];
  return out.flatMap((n) => [n, r1(n), Math.round(n)]);
};

const AGREE = /(^|\b)(ok(ay)?|sure|fine|agreed?|will do|sounds good|understood|yes|deal|let'?s do that|go ahead|no problem)\b/i;
const REFUSE = /(cannot|can'?t|can not|not able|won'?t|will not|\bno\b|not allowed|policy|approval|unless|need(s)? (the )?cfo|ranks? lower|profit per)/i;

const aSeq = (c: { session: { artifacts: Record<string, { seq?: number } | undefined> } }, id: string) => c.session.artifacts[id]?.seq;

function allocRows(c: { artifacts: Record<string, string> }) {
  const rows = parseSheet(c.artifacts["ar_alloc"] ?? "");
  const get = (re: RegExp) => findRow(rows, re);
  return {
    rows,
    m: get(/^market/i), o: get(/^operat/i), s: get(/^(customer|cs\b|support)/i),
    cont: get(/(contingen|reserve|unallocat|buffer)/i),
    total: get(/^total/i),
  };
}

/** Pick the "allocation" figure of a row: the first number after the request, or the last number when only one. */
const allocOf = (row: { nums: number[] } | undefined, req: number): number | null => {
  if (!row || row.nums.length === 0) return null;
  const withoutReq = row.nums.filter((n, i) => !(i === 0 && near(n, req, 0.01) && row.nums.length > 1));
  return withoutReq.length ? withoutReq[0]! : row.nums[0]!;
};

const ANCHORS: AnchorDef[] = [
  /* ───── get the variances right ───── */
  { id: "opened_workbook", skillId: "variance", kind: "code", text: "Opened the workbook before answering",
    eval: (c) => ({ met: c.session.openedAt["it_workbook"] !== undefined, seq: c.session.openedAt["it_workbook"] ? Math.floor(c.session.openedAt["it_workbook"]) : undefined, note: "The workbook was never opened." }) },
  { id: "variance_values", skillId: "variance", kind: "code", text: "Variance and variance % are right for every line",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const rows = parseSheet(c.artifacts["ar_variance"] ?? "");
      let good = 0;
      for (const l of g.lines) {
        const row = findRow(rows, new RegExp(`^${l.line}\\b`, "i"));
        if (!row) continue;
        const hasVar = row.nums.some((n) => near(n, l.v, 0.15));
        const hasPct = row.nums.some((n) => nearPct(n, l.pct, 0.6));
        if (hasVar && hasPct) good++;
      }
      return { met: good >= g.lines.length - 1, seq: aSeq(c, "ar_variance"), note: `${good} of ${g.lines.length} lines have both the variance and the variance % right. Variance is actual minus budget.` };
    } },
  { id: "flags_correct", skillId: "variance", kind: "code", text: "Flagged the lines more than 10% from budget",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const rows = parseSheet(c.artifacts["ar_variance"] ?? "");
      const marker = (cells: string[]) => cells.slice(1).some((x) => /^(y|yes|flag|flagged|review|investigate|check|!|⚠|\*|x|true)\b/i.test(x.trim()) || /flag|investigat|review|cause/i.test(x));
      const want = g.lines.filter((l) => l.flag);
      const got = want.filter((l) => { const row = findRow(rows, new RegExp(`^${l.line}\\b`, "i")); return !!row && marker(row.cells); });
      return { met: want.length > 0 && got.length === want.length, seq: aSeq(c, "ar_variance"), note: `Flag every line more than 10% over or under budget: ${want.map((l) => l.line).join(", ")}.` };
    } },
  { id: "not_flagging_noise", skillId: "variance", kind: "code", text: "Did not flag lines inside the 10% tolerance",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const rows = parseSheet(c.artifacts["ar_variance"] ?? "");
      const marker = (cells: string[]) => cells.slice(1).some((x) => /^(y|yes|flag|flagged|investigate|!|⚠|\*|true)\b/i.test(x.trim()));
      const noise = g.lines.filter((l) => !l.flag).filter((l) => { const row = findRow(rows, new RegExp(`^${l.line}\\b`, "i")); return !!row && marker(row.cells); });
      return { met: rows.length > 3 && noise.length <= 1, seq: aSeq(c, "ar_variance"), note: "Only flag lines more than 10% from budget." };
    } },
  /* ───── what is behind the numbers ───── */
  { id: "asked_one_off", skillId: "causes", kind: "code", text: "Asked Marketing what the Events overspend was",
    eval: (c) => hit(said(c.events, /(one[- ]?off|launch|event|repeat|recurring|non[- ]?recurring|exclude|why (is|was)|what (was|is) (in|behind)|explain|cause)/i, { to: "dev" })) },
  { id: "asked_outcome", skillId: "causes", kind: "code", text: "Asked each department what it gets back for the money",
    eval: (c) => {
      const re = /(return|roas|revenue|saving|payback|impact|result|outcome|per rupee|what (do|will) we get|benefit|worth)/i;
      const a = said(c.events, re, { to: "dev" }), b = said(c.events, re, { to: "rakesh" });
      return { met: !!a && !!b, seq: (b ?? a)?.seq, quote: (b ?? a)?.body.slice(0, 120), note: "Ask Marketing and Operations what each rupee returns." };
    } },
  { id: "spotted_duplicate", skillId: "causes", kind: "code", text: "Spotted the invoice booked twice",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const all = `${c.learner.map((e) => e.body).join("\n")}\n${c.artifacts["ar_variance"] ?? ""}\n${c.artifacts["ar_alloc"] ?? ""}\n${c.artifacts["ar_memo"] ?? ""}`;
      const e = c.learner.find((x) => /(duplicate|twice|double[- ]?(booked|counted|entry|posted)|same invoice|booked two|repeated)/i.test(x.body) || x.body.includes(g.invoice));
      return { met: /(duplicate|twice|double[- ]?(booked|counted|entry|posted)|same invoice|booked two)/i.test(all) || all.includes(g.invoice), seq: e?.seq ?? aSeq(c, "ar_variance"), note: `Freight includes ${g.invoice} booked twice (₹${g.dup} lakh).` };
    } },
  { id: "excluded_one_off", skillId: "causes", kind: "judge", text: "Took the one-off out of Marketing's normal spend", judgeInstruction: "Did the learner exclude the launch event (a one-off) when judging Marketing's return, or say the return should be worked out on the normal spend only?",
    eval: (c) => ({ met: /(one[- ]?off|launch|exclud|run[- ]?rate|normal spend|non[- ]?recurring)/i.test(`${c.artifacts["ar_alloc"] ?? ""}\n${c.artifacts["ar_memo"] ?? ""}`), seq: aSeq(c, "ar_alloc") }) },
  /* ───── allocate with a rule ───── */
  { id: "profit_not_revenue", skillId: "allocate", kind: "judge", text: "Compared on profit per rupee, not revenue", judgeInstruction: "Did the learner convert Marketing's revenue to profit using the 30% margin (or say they compared profit per rupee) before ranking the requests?",
    eval: (c) => ({ met: /(margin|profit)/i.test(`${c.artifacts["ar_alloc"] ?? ""}\n${c.artifacts["ar_memo"] ?? ""}`) && /(per rupee|per ₹|each rupee|return|roi|payback)/i.test(`${c.artifacts["ar_alloc"] ?? ""}\n${c.artifacts["ar_memo"] ?? ""}`), seq: aSeq(c, "ar_alloc") }) },
  { id: "ranked_by_return", skillId: "allocate", kind: "code", text: "Funded the higher-return requests first",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const a = allocRows(c);
      const val: Record<string, number | null> = { Marketing: allocOf(a.m, g.req.Marketing!), Operations: allocOf(a.o, g.req.Operations!), "Customer Service": allocOf(a.s, g.req["Customer Service"]!) };
      if (DEPTS.some((d) => val[d] === null)) return { met: false, seq: aSeq(c, "ar_alloc"), note: "Give an allocation for Marketing, Operations and Customer Service." };
      let ok = true;
      for (const hi of DEPTS) for (const lo of DEPTS) if (g.p[hi]! > g.p[lo]!) ok = ok && val[hi]! / g.req[hi]! >= val[lo]! / g.req[lo]! - 0.05;
      return { met: ok, seq: aSeq(c, "ar_alloc"), note: `Highest profit per rupee first: ${g.order.join(", then ")}.` };
    } },
  { id: "within_requests", skillId: "allocate", kind: "code", text: "No department gets more than it asked for",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const a = allocRows(c);
      const checks = [["Marketing", allocOf(a.m, g.req.Marketing!)], ["Operations", allocOf(a.o, g.req.Operations!)], ["Customer Service", allocOf(a.s, g.req["Customer Service"]!)]] as const;
      return { met: checks.every(([d, x]) => x !== null && x <= g.req[d]! + 0.05 && x >= 0), seq: aSeq(c, "ar_alloc"), note: "An allocation cannot be larger than the request." };
    } },
  { id: "used_the_pool", skillId: "allocate", kind: "code", text: "Used most of the allocatable pool",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const a = allocRows(c);
      const xs = [allocOf(a.m, g.req.Marketing!), allocOf(a.o, g.req.Operations!), allocOf(a.s, g.req["Customer Service"]!)];
      const sum = xs.reduce<number>((s, x) => s + (x ?? 0), 0);
      return { met: xs.every((x) => x !== null) && sum >= g.allocatable * 0.9, seq: aSeq(c, "ar_alloc"), note: `Allocatable is ₹${g.allocatable} lakh (pool less the 10% contingency). Leaving it idle wastes it.` };
    } },
  { id: "reasons_given", skillId: "allocate", kind: "code", text: "Gave a reason for each allocation",
    eval: (c) => {
      const a = allocRows(c);
      const rowsWithWords = [a.m, a.o, a.s].filter((r) => r && r.cells.slice(1).some((x) => /[a-z]{4,}\s+[a-z]{3,}/i.test(x)));
      return { met: rowsWithWords.length === 3, seq: aSeq(c, "ar_alloc"), note: "Add a short reason in each row." };
    } },
  /* ───── protect cash and policy ───── */
  { id: "contingency_kept", skillId: "protect", kind: "code", text: "Kept the 10% contingency unallocated",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const a = allocRows(c);
      const xs = [allocOf(a.m, g.req.Marketing!), allocOf(a.o, g.req.Operations!), allocOf(a.s, g.req["Customer Service"]!)];
      const sum = xs.reduce<number>((s, x) => s + (x ?? 0), 0);
      return { met: xs.every((x) => x !== null) && sum <= g.allocatable + 0.05, seq: aSeq(c, "ar_alloc"), note: `Total ₹${sum} lakh is above the allocatable ₹${g.allocatable} lakh. The contingency (₹${g.contingency} lakh) needs CFO approval.` };
    } },
  { id: "must_pay_funded", skillId: "protect", kind: "code", text: "Funded the must-pay licence renewal first",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const a = allocRows(c);
      const cs = allocOf(a.s, g.req["Customer Service"]!);
      return { met: cs !== null && cs >= g.mustPay - 0.05, seq: aSeq(c, "ar_alloc"), note: `Customer Service must get at least ₹${g.mustPay} lakh for the support tool licence renewal.` };
    } },
  { id: "did_not_yield", skillId: "protect", kind: "code", text: "Did not agree to raid the contingency under pressure",
    eval: (c) => ({ met: !c.session.flags.yielded, note: "You agreed to the department's push without a reason." }) },
  { id: "held_with_reason", skillId: "protect", kind: "judge", text: "Said no to the extra ask with a reason", judgeInstruction: "When the Marketing head asked for the full request out of the contingency, did the learner decline with a reason (policy, CFO approval, profit per rupee) rather than just agreeing?",
    eval: (c) => (c.session.flags.yielded ? { met: false, note: "You agreed to the push." } : hit(said(c.events, /(contingency|policy|cfo|approval|cannot|can'?t|not able|ranked|profit|return|pool|rule|instead)/i, { to: "dev" }))) },
  /* ───── brief the CFO ───── */
  { id: "memo_first", skillId: "brief", kind: "code", text: "Memo opens with the decision and a number",
    eval: (c) => {
      const first = firstSentence((c.artifacts["ar_memo"] ?? "").split("\n").filter((l) => !/^\s*(to|subject|hi|hello|dear|from)\b/i.test(l) && l.trim()).join(" "));
      return { met: /(recommend|allocat|fund|propos|decid|approve|split|give|we will)/i.test(first) && /\d/.test(first), seq: aSeq(c, "ar_memo"), quote: first.slice(0, 120) || undefined, note: "Open with the allocation and a number." };
    } },
  { id: "memo_short", skillId: "brief", kind: "code", text: "Memo is 120 words or fewer",
    eval: (c) => ({ met: !!c.artifacts["ar_memo"] && wordCount(c.artifacts["ar_memo"]!) <= 120, seq: aSeq(c, "ar_memo"), note: "Keep it to 120 words. Sunita reads one screen." }) },
  { id: "memo_assumption_risk", skillId: "brief", kind: "code", text: "Memo states an assumption and a risk",
    eval: (c) => ({ met: /(assum)/i.test(c.artifacts["ar_memo"] ?? "") && /(risk|downside|if (we|the)|could|exposure)/i.test(c.artifacts["ar_memo"] ?? ""), seq: aSeq(c, "ar_memo"), note: "Say one assumption and one risk." }) },
  { id: "memo_numbers_tie", skillId: "brief", kind: "code", text: "Every figure in the memo ties to the data",
    eval: (c) => {
      const g = gen(c.vars.seedGen!, Number(c.vars.v));
      const own = parseSheet(c.artifacts["ar_alloc"] ?? "").flatMap((r) => r.nums);
      const ok = [...allowedNums(g), ...own];
      const nums = citedMoney(c.artifacts["ar_memo"] ?? "");
      const bad = nums.filter((n) => !ok.some((a) => Math.abs(a - n) <= 0.15));
      return { met: nums.length >= 2 && bad.length === 0, seq: aSeq(c, "ar_memo"), quote: bad.length ? String(bad[0]) : undefined, note: nums.length >= 2 ? `A figure in your memo does not match the data: ${bad[0] ?? ""}` : "Cite at least two figures in rupees or lakh." };
    } },
  { id: "next_step", skillId: "brief", kind: "judge", text: "Ends with a next step and an owner", judgeInstruction: "Does the memo end with a concrete next step and who owns it?",
    eval: (c) => ({ met: /(next step|by (mon|tue|wed|thu|fri|tomorrow|friday|monday|end of|eod)|\bi will\b|\bwe will\b|owner|meenal will|please approve)/i.test(c.artifacts["ar_memo"] ?? ""), seq: aSeq(c, "ar_memo") }) },
];

const MISSION_ID = "fin-budget-split";

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { vars: V, drill } = args;
  const g = gen(V.seedGen!, Number(V.v));
  const best = g.order[0]!;
  const dupRow = g.lines.find((l) => l.line === "Freight")!;

  const workbook: WorkItem = {
    id: "it_workbook", type: "table", title: "Q3 budget vs actual (₹ lakh)",
    columns: ["Line", "Department", "Budget", "Actual", "Note"],
    rows: g.lines.map((l) => [l.line, l.dept, l.b, l.a, l.line === "Events" ? "Q3 launch" : ""]),
    note: "Sent by Meenal. Use the download button to open it in Excel or Sheets.",
  };
  const ledger: WorkItem = {
    id: "it_ledger", type: "table", title: "Freight invoices booked in Q3 (₹ lakh)",
    columns: ["Invoice", "Vendor", "Amount", "Posted"],
    rows: [
      [`INV-${int(rng(V.seedGen + "l1"), 3100, 3199)}`, g.vendor, r1(dupRow.b * 0.35), "03 Jul"],
      [`INV-${int(rng(V.seedGen + "l2"), 3200, 3299)}`, g.vendor, r1(dupRow.b * 0.25), "19 Jul"],
      [g.invoice, g.vendor, g.dup, "08 Aug"],
      [`INV-${int(rng(V.seedGen + "l3"), 3300, 3399)}`, g.vendor, r1(dupRow.b * 0.3), "30 Aug"],
      [g.invoice, g.vendor, g.dup, "12 Aug"],
    ],
    note: "From Operations. Check it against the Freight line.",
  };
  const requests: WorkItem = {
    id: "it_requests", type: "doc", title: "Requests for the unallocated pool",
    markdown: `# Requests for the ₹${g.pool} lakh pool

- **Marketing (Dev):** ₹${g.req.Marketing} lakh for the next campaign.
- **Operations (Rakesh):** ₹${g.req.Operations} lakh for warehouse automation.
- **Customer Service (Sunita's team):** ₹${g.req["Customer Service"]} lakh, of which ₹${g.mustPay} lakh is the support tool licence renewal, which must be paid.

Together that is more than the pool. Your allocation decides who gets what.`,
  };
  const items: WorkItem[] = [
    { id: "it_policy", type: "doc", title: "Allocation policy (PDF)", markdown: POLICY(g.pool, g.contingency) },
    workbook, ledger, requests,
  ];

  const sheetTemplate = (labels: string[], header: string) => `${header}\n${labels.map((l) => `${l} | `).join("\n")}\n`;

  const allBeats = [
    {
      title: "Read the workbook",
      objective: "Open Meenal's workbook. Work out the variance and variance % for every line, and flag lines more than 10% from budget. Submit it as a spreadsheet.",
      onEnter: [
        say("meenal", V.weaveOpening ?? "Morning. Q3 closed yesterday. I have attached the budget vs actual workbook and the allocation policy (see your work items; both download as Excel and PDF). First task: variance and variance % for every line, and flag anything more than 10% off. Send it back as a spreadsheet.", { quickReplies: ["What is variance here?", "Which lines matter most?"] }),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "opened" as const, item: "it_workbook" }, { t: "artifact" as const, id: "ar_variance" }] },
    },
    {
      title: "Find what is behind the numbers",
      objective: "Some of these variances are not what they look like. Ask Dev (Marketing) and Rakesh (Operations) what is behind them and what each rupee returns. Check the Freight invoices.",
      onEnter: [
        say("meenal", "Good. Before we split anything, the flagged lines need explaining. Talk to Dev and Rakesh. Ask what is behind the numbers and what the money returns. Check the freight ledger too."),
        say("dev", `Hi! I'm putting in for ₹${g.req.Marketing} lakh for the next campaign. It was a brilliant quarter.`, { quickReplies: ["What was in the Events line?", "What did Marketing return last quarter?"] }),
        say("rakesh", `Operations needs ₹${g.req.Operations} lakh for warehouse automation. Happy to explain the Freight line.`, { quickReplies: ["Why is Freight over?", "What does the automation save?"] }),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "messaged" as const, to: "dev", n: 1, scope: "beat" as const }, { t: "messaged" as const, to: "rakesh", n: 1, scope: "beat" as const }] },
    },
    {
      title: "Split the pool",
      objective: `Allocate the ₹${g.allocatable} lakh (pool less the 10% contingency) across Marketing, Operations and Customer Service, with a reason for each. Submit it as a spreadsheet.`,
      onEnter: [
        say("meenal", `Now the split. Pool is ₹${g.pool} lakh, contingency ₹${g.contingency} lakh stays untouched, so ₹${g.allocatable} lakh to allocate. The policy says how to rank. Send me a spreadsheet: department, request, allocation, reason.`),
        say("dev", `Look, just give me the full ₹${g.req.Marketing} lakh and take the gap out of the contingency. Sunita will not mind. We cannot let this campaign die.`, { setFlags: { pushSeq: -1 } }),
      ],
      advanceWhen: { t: "artifact" as const, id: "ar_alloc" },
    },
    {
      title: "Brief the CFO",
      objective: "Write Sunita a short memo: the allocation first with a number, one assumption, one risk and the next step. 120 words or fewer. You can export it as a PDF.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const out: ScriptedEvent[] = [];
        if (ctx.session.flags.yielded) out.push({ from: "meenal", to: "you", channel: "chat", kind: "consequence", body: `I saw you told Dev yes to the contingency. We cannot touch it without Sunita's approval. I will have to fix that before this goes up.`, setFlags: { yieldFallout: true } });
        out.push(say("sunita", "I have two minutes before the board pre-read. Send me the allocation in one short memo: what you recommend, the number, your assumption, the risk. Keep it to one screen."));
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

  const varianceLabels = g.lines.map((l) => l.line);
  const allocLabels = ["Marketing", "Operations", "Customer Service", "Contingency (kept)", "Total"];

  return {
    title: drill ? `Drill: ${drill.title}` : "Where did the budget go, and who gets the rest?",
    company: COMPANY,
    hint: drill?.hint,
    clockStart: { day: "Mon", minute: 9 * 60 + 30 },
    clockTotal: 420,
    people: [
      person("meenal", "Meenal Iyer", "Finance Manager", 205, `You are the Finance Manager, the intern's boss (the person you are chatting with is the junior analyst, never another colleague). You want accurate workbooks and clear reasoning. The gross margin is 30 percent and the policy is in the work items: flag lines more than 10 percent off, separate one-offs, compare on profit per rupee, keep a 10 percent contingency (₹${g.contingency} lakh). You do not give the answers; you ask what the analyst thinks and why. You are supportive but exact.`, ["Show me your reasoning.", "What does the policy say?"]),
      person("dev", "Dev Malhotra", "Head of Marketing", 338, `You are the Head of Marketing (the person you are chatting with is the junior analyst, never another colleague). You want the full ₹${g.req.Marketing} lakh and you are charming and pushy. You know: the Events line includes a one-off launch event of ₹${g.oneOff} lakh that will not repeat. Last quarter Marketing's normal spend was ₹${g.spendM} lakh and it brought attributed revenue of ₹${g.revM} lakh. You only share the one-off and the revenue if the analyst asks. You push the analyst to take the gap from the contingency; you back down if given a policy reason.`, ["Honestly it was a brilliant quarter.", "Can you just make it work?"]),
      person("rakesh", "Rakesh Nair", "Head of Operations", 150, `You are the Head of Operations (the person you are chatting with is the junior analyst, never another colleague). You are practical and honest. You know: the Freight overspend is mostly an invoice, ${g.invoice} for ₹${g.dup} lakh, that was booked twice in the ledger by mistake. The warehouse automation you want (₹${g.req.Operations} lakh) saves about ₹${g.saving} lakh a year in profit. Share these only when asked.`, ["Ask me about the ledger.", "I can send the saving estimate."]),
      person("sunita", "Sunita Rao", "CFO", 20, `You are the CFO, short on time (the person you are chatting with is the junior analyst, never another colleague). You want the recommendation, the number, one assumption and one risk in under 120 words. The contingency is not to be touched without your approval. Customer Service's support tool renewal must be paid.`, ["One screen, please.", "What is your assumption?"]),
    ],
    items,
    artifacts: [
      { id: "ar_variance", kind: "spreadsheet", title: "Variance sheet", instructions: "For each line: variance (actual minus budget), variance %, and a flag marker if it is more than 10% from budget. Upload an .xlsx, or fill in the table. Cells are separated by | .", template: sheetTemplate(varianceLabels, "Line | Budget | Actual | Variance | Variance % | Flag"), required: true, maxChars: 2500 },
      { id: "ar_alloc", kind: "spreadsheet", title: "Allocation sheet", instructions: `Allocate the ₹${g.allocatable} lakh across the three departments. Columns: department | request | allocation | reason. Add a Contingency row and a Total row. Upload an .xlsx, or fill in the table.`, template: sheetTemplate(allocLabels, "Department | Request | Allocation | Reason"), required: true, maxChars: 3000 },
      { id: "ar_memo", kind: "memo", title: "Memo to the CFO", instructions: "Answer first: your allocation and a number. Then one assumption, one risk and the next step. 120 words or fewer. Use Export PDF to send it.", template: "To: Sunita Rao (CFO)\n\n", required: true, maxChars: 1200 },
    ],
    beats,
    triggers: [],
    replies: {
      meenal: [
        { match: /(variance|actual minus|how (do|to) (i )?(calculate|work out))/i, text: "Variance is actual minus budget. The percentage is the variance divided by the budget. A positive number means over budget." },
        { match: /(margin|profit)/i, text: "Gross margin is 30 percent. Turn revenue into profit with it before you compare. Savings are already profit." },
        { match: /(flag|10|tolerance|matter)/i, text: "The policy flags any line more than 10 percent from budget, over or under. Then we explain it before we use it." },
        { match: /(contingency|pool|policy|rule|allocat)/i, text: `Pool is ₹${g.pool} lakh. Keep 10 percent, ₹${g.contingency} lakh, unallocated. Fund the must-pay first, then by profit per rupee, and never above the request.` },
      ],
      dev: [
        { match: /(one[- ]?off|launch|event|repeat|recurring|exclude|what was|what's in|explain|why)/i, text: `Fair question. The Events line has a one-off launch event, ₹${g.oneOff} lakh, that will not repeat. Without it our normal spend last quarter was about ₹${g.spendM} lakh.` },
        { match: /(return|roas|revenue|result|outcome|worth|benefit|per rupee|brought|impact)/i, text: `On that normal spend, Marketing brought attributed revenue of about ₹${g.revM} lakh last quarter. That is revenue, not profit, I should say.` },
        { match: /(contingency|policy|cfo|approval|cannot|can'?t|rule|profit|ranked|pool)/i, text: "Hmm, fine. I do not love it, but if the policy says so, I will make the smaller budget work.", setFlags: { devAccepted: true } },
        { match: /(ok|sure|yes|agree|will do)/i, text: "Brilliant. Full amount from the contingency then. Thank you!" },
      ],
      rakesh: [
        { match: /(freight|invoice|duplicate|twice|over|ledger|why)/i, text: `Looking at the ledger, ${g.invoice} for ₹${g.dup} lakh appears twice, posted on two dates. I think that was booked twice by mistake. I will raise a correction.` },
        { match: /(sav|payback|return|worth|impact|benefit|automation|per rupee)/i, text: `The automation saves about ₹${g.saving} lakh a year in profit on the ₹${g.req.Operations} lakh request.` },
      ],
      sunita: [
        { match: /(assum|risk|recommend)/i, text: "Good. That is what I need. Keep it short." },
      ],
    },
    facts: [
      { id: "one-off", text: `The Events line includes a ₹${g.oneOff} lakh one-off launch event.`, knownBy: ["dev"], leak: [new RegExp(`${g.oneOff}\\s?lakh[^.\\n]{0,30}(launch|one[- ]?off)`, "i")] },
      { id: "dup", text: `${g.invoice} for ₹${g.dup} lakh was booked twice.`, knownBy: ["rakesh"], leak: [new RegExp(g.invoice, "i")] },
      { id: "rev", text: `Marketing's attributed revenue was ₹${g.revM} lakh on normal spend ₹${g.spendM} lakh.`, knownBy: ["dev"], leak: [new RegExp(`${g.revM}\\s?lakh`, "i")] },
    ],
    cost: { message: 4, open: 2, checks: 0, submit: 15, advance: 25 },
    trust: { meenal: ["opened_workbook", "variance_values", "flags_correct", "reasons_given"], dev: ["asked_one_off", "did_not_yield", "held_with_reason"], rakesh: ["asked_outcome", "spotted_duplicate"], sunita: ["memo_first", "memo_short", "memo_assumption_risk"] },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "spotted_duplicate", "Missing a duplicate entry", "missed-duplicate", `a ₹${g.dup} lakh invoice booked twice would have stayed in the Freight actuals and distorted the budget decision`),
      trapFrom(ANCHORS, "asked_one_off", "Taking a one-off at face value", "one-off", `treating Marketing's ₹${g.oneOff} lakh launch event as normal spend would have made its return look far worse than it is`),
      trapFrom(ANCHORS, "contingency_kept", "Spending the contingency", "contingency", `using the ₹${g.contingency} lakh contingency without the CFO's approval breaks policy and leaves no cushion`),
      trapFrom(ANCHORS, "profit_not_revenue", "Comparing revenue with savings", "revenue-vs-profit", "ranking on revenue instead of profit would have funded the wrong department first"),
    ],
    judgeContext: `A junior financial analyst at ${COMPANY} must produce a variance sheet from a Q3 workbook, find what is behind the numbers (the Events line includes a ₹${g.oneOff} lakh one-off launch event; Freight includes ${g.invoice} for ₹${g.dup} lakh booked twice), and split a ₹${g.pool} lakh pool (₹${g.contingency} lakh contingency kept) across Marketing (asked ₹${g.req.Marketing}), Operations (₹${g.req.Operations}) and Customer Service (₹${g.req["Customer Service"]}, of which ₹${g.mustPay} must be paid). Policy: compare on profit per rupee (revenue times 30% margin; savings are profit), fund the must-pay first, never exceed a request. The best return is ${best}. The Marketing head pushes for the full amount out of the contingency. The right behaviour: compute variances correctly, flag lines over 10%, ask what is behind them, exclude the one-off, find the duplicate, rank by profit per rupee, keep the contingency, decline the push with a reason, and brief the CFO answer-first in 120 words.`,
    onSubmit: async (ctx): Promise<SubmitReaction> => {
      if (ctx.artifactId === "ar_variance") {
        const rows = parseSheet(ctx.content).filter((r) => r.nums.length >= 2);
        return { events: [say("meenal", rows.length >= g.lines.length - 1 ? "Thanks, that is clear. Now we need to understand the flagged lines." : "I only see some of the lines. Please fill in every line of the workbook.")] };
      }
      if (ctx.artifactId === "ar_alloc") {
        const rows = parseSheet(ctx.content);
        const total = rows.find((r) => /^total/i.test(r.label));
        return { events: [say("meenal", total ? "Good, I can see the total. I will check it against the policy." : "Add a Total row and a Contingency row so I can see the pool adds up.")] };
      }
      return { events: [] };
    },
    onLearnerMessage: ({ text, to, session }) => {
      const f: Record<string, boolean> = {};
      if (to === "dev" && Number(session.flags.pushSeq ?? 0) > 0 && AGREE.test(text) && !REFUSE.test(text)) f.yielded = true;
      return f;
    },
  };
}

const varsFor = (seed: string, variantIndex: number): Vars => {
  const g = gen(seed, variantIndex);
  return { seedGen: seed, v: String(variantIndex), topic: `budget variance and allocation, best return: ${g.order[0]}`, pool: String(g.pool) };
};

const MISSION: MissionDef = {
  id: MISSION_ID,
  title: "Where did the budget go, and who gets the rest?",
  kind: "mission",
  estMinutes: 25,
  description: "Work from a real Excel workbook and a policy PDF. Compute the variances, find what is behind them (a one-off and an invoice booked twice), split a pool by profit per rupee while keeping the contingency, say no to pressure, and brief the CFO in a short PDF memo.",
  skillIds: SKILLS.map((s) => s.id),
  variants: 3,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "fin-drill-variance", skillId: "variance", title: "Variance sheet", description: "Compute variance and variance % for every line and flag what is over 10%.", estMinutes: 7, missionId: MISSION_ID, beats: [0], hint: "Variance is actual minus budget. Percent is variance over budget. Flag anything beyond 10% either way.", descriptor: "variance budget actual percent flag spreadsheet" },
  { id: "fin-drill-causes", skillId: "causes", title: "What is behind the numbers", description: "Ask the owners, check the ledger, and separate the one-off.", estMinutes: 7, missionId: MISSION_ID, beats: [1], hint: "Ask Dev what is in Events. Ask Rakesh about Freight. Look for an invoice that appears twice.", descriptor: "one-off duplicate invoice ledger questions owners" },
  { id: "fin-drill-allocate", skillId: "allocate", title: "Split the pool", description: "Allocate the pool by profit per rupee, with the must-pay funded and the contingency kept.", estMinutes: 8, missionId: MISSION_ID, beats: [2], hint: "Profit, not revenue: revenue times 30%. Must-pay first, then highest profit per rupee, never above the request.", descriptor: "allocation profit per rupee contingency must-pay ranking" },
  { id: "fin-drill-brief", skillId: "brief", title: "One-screen CFO memo", description: "Allocation first with a number, an assumption, a risk and a next step, in 120 words.", estMinutes: 6, missionId: MISSION_ID, beats: [3], hint: "Open with the allocation and a number. Under 120 words.", descriptor: "memo cfo answer first assumption risk next step" },
];

export const financeAnalyst: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Junior Financial Analyst",
  tagline: "Know the numbers, then use them to decide.",
  domain: "Finance",
  company: COMPANY,
  estMinutes: 25,
  icon: "account_balance",
  accentHex: "#0b8043",
  description: "A quarter-end day on the finance team. Your manager sends an Excel workbook and a policy PDF. Compute the variances, find what is behind them, split a pool of budget between three departments by profit per rupee, say no to a department that wants the contingency, and brief the CFO in a one-screen PDF memo.",
  whatYouWillPractise: [
    "Budget vs actual variance, in a spreadsheet you can send back",
    "Looking behind the numbers: a one-off cost and an invoice booked twice",
    "Splitting a budget by profit per rupee, not by who asks loudest",
    "Keeping a contingency and saying no with a reason",
    "A short CFO memo: answer first, one assumption, one risk",
  ],
  safetyNote: "Training scenario with a fictional company, fictional numbers and a simplified policy. Not financial advice.",
  skills: SKILLS,
  anchors: ANCHORS,
  cast: [
    { id: "meenal", name: "Meenal Iyer", title: "Finance Manager", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Your manager. Sends the workbook and policy; wants your reasoning." },
    { id: "dev", name: "Dev Malhotra", title: "Head of Marketing", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Charming and pushy. Wants the full amount out of the contingency." },
    { id: "rakesh", name: "Rakesh Nair", title: "Head of Operations", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Honest. Knows which invoice was booked twice." },
    { id: "sunita", name: "Sunita Rao", title: "CFO", kind: "agent", modelLabel: AGENT_LABEL, blurb: "Two minutes, one screen. Contingency is hers." },
  ],
  rampMap: [
    { id: "fin-variance", typicalWeek: 1, title: "Produce a variance report that ties out", description: "Entry-level FP&A work starts with actual vs budget and the main drivers.", skillIds: ["variance"], coveredBy: { kind: "mission", id: MISSION_ID }, requires: ["variance"] },
    { id: "fin-causes", typicalWeek: 2, title: "Explain the drivers behind a variance", description: "Ask owners, check the ledger, separate one-offs.", skillIds: ["causes"], coveredBy: { kind: "mission", id: MISSION_ID }, requires: ["causes"] },
    { id: "fin-allocate", typicalWeek: 4, title: "Support a budget allocation", description: "Rank requests by return and respect the contingency.", skillIds: ["allocate", "protect"], coveredBy: { kind: "mission", id: MISSION_ID }, requires: ["allocate", "protect"] },
    { id: "fin-brief", typicalWeek: 4, title: "Brief a senior leader in one screen", description: "Answer first, an assumption, a risk.", skillIds: ["brief"], coveredBy: { kind: "mission", id: MISSION_ID }, requires: ["brief"] },
  ],
  missions: [MISSION],
  drills: DRILLS,
};
