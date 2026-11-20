import type { RolePack, MissionDef } from "../types";
import { findLearner, artifactHas, opened, learnerMsgs } from "../types";

const people = {
  priya: { id: "priya", name: "Priya Nair", title: "Engineering Manager", kind: "agent", avatarHue: 210, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  arjun: { id: "arjun", name: "Arjun Rao", title: "Senior Engineer (reviewer)", kind: "agent", avatarHue: 140, presence: "busy", modelLabel: "Gemini 4 Hydrogen" },
  neha: { id: "neha", name: "Neha Shah", title: "QA Engineer", kind: "agent", avatarHue: 30, presence: "online", modelLabel: "Gemini 4 Hydrogen + code execution" },
  rohan: { id: "rohan", name: "Rohan Mehta", title: "Buddy (engineer, 1 year in)", kind: "agent", avatarHue: 280, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
} as const;

const PRICING = `"""Order pricing for the storefront."""

VOLUME_THRESHOLD = {{threshold}}


def line_total(price, quantity, discount_rate):
    subtotal = price * quantity
    if quantity >= VOLUME_THRESHOLD:
        subtotal = subtotal * (1 - discount_rate)
    return subtotal


def total(items, discount_rate):
    """Return the order total. The volume discount applies once, to the whole order."""
    amount = 0
    for item in items:
        amount += line_total(item["price"], item["quantity"], discount_rate)
    if sum(item["quantity"] for item in items) >= VOLUME_THRESHOLD:
        amount = amount * (1 - discount_rate)
    return round(amount, 2)
`;

const TESTS = `from src.pricing import total


def test_total_simple():
    assert total([{"price": 100, "quantity": 2}], 0.{{rate}}) == 200


def test_small_order_no_discount():
    assert total([{"price": 50, "quantity": 3}], 0.{{rate}}) == 150


def test_bulk_discount_once():
    items = [{"price": 10, "quantity": {{threshold}}}]
    assert total(items, 0.{{rate}}) == round(10 * {{threshold}} * (1 - 0.{{rate}}), 2)
`;

const GUIDE = `# How we work at Meridian Labs

## Commits
- Subject: \`type(scope): summary (TICKET)\`, for example \`fix(cart): stop rounding twice (INV-98)\`.
- Keep the subject under 72 characters, in the imperative mood.
- The body says **why** the change was needed.

## Pull requests
- Use the template: **Why · What changed · How I tested · Risks**.
- Every bug fix ships with a test that would have caught it.
- Reviewers aim to respond within two hours.

## Asking for help
- Stuck for more than 20 minutes? Ask your buddy. Nobody minds.
- Post a short status update to your manager before lunch.

## Running checks
- \`Run checks\` runs the test suite in a sandbox. Some checks are hidden until review, like in real CI.
`;

const fixedOnce = (src: string) => (src.match(/\(\s*1\s*-\s*discount_rate\s*\)/g) ?? []).length === 1;
const guardsQty = (src: string) => /quantity\s*<=\s*0|quantity\s*<\s*1|quantity\s*<\s*0|ValueError/.test(src);
const testsEdge = (src: string) => /["']quantity["']\s*:\s*(0|-\d)|quantity\s*=\s*(0|-\d)|pytest\.raises/.test(src);

const mission: MissionDef = {
  id: "swe-day3-bugfix",
  title: "Day 3 at Meridian Labs: fix the double-discount bug",
  description: "Pick up a real bug ticket, ask the right questions, fix it with tests, write a commit and PR, and handle review.",
  estMinutes: 25,
  company: "Meridian Labs",
  startLabel: { day: "Wed", minutes: 9 * 60 + 30 },
  people: [people.priya, people.arjun, people.neha, people.rohan],
  skillIds: ["clarify", "verify", "git_hygiene", "feedback", "team_norms"],
  items: [
    { id: "it_ticket", type: "ticket", title: "{{ticket}} · Discount applied twice on {{segment}}", key: "{{ticket}}", status: "To do", priority: "high", description: "Customers report that {{segment}} get the volume discount twice. Finance is issuing refunds. See `src/pricing.py`.\n\nAcceptance: the volume discount applies **once**, to the whole order, when total quantity reaches {{threshold}}." },
    { id: "it_guide", type: "doc", title: "CONTRIBUTING.md", markdown: GUIDE },
    { id: "it_pricing", type: "file", title: "pricing.py", path: "src/pricing.py", language: "python", content: PRICING, editable: true },
    { id: "it_tests", type: "file", title: "test_pricing.py", path: "tests/test_pricing.py", language: "python", content: TESTS, editable: true },
    { id: "it_orders", type: "table", title: "Refund requests this week", columns: ["Order", "Items", "Quantity", "Charged", "Expected"], rows: [["#88412", 2, 14, "₹1,134.00", "₹1,260.00"], ["#88419", 1, 30, "₹2,430.00", "₹2,700.00"], ["#88430", 3, 9, "₹900.00", "₹900.00"]], note: "Orders at or above the threshold were charged less than expected." },
  ],
  artifacts: [
    { id: "ar_commit", kind: "commit_message", title: "Commit message", instructions: "Write the commit message you would push. Follow the team guide.", required: true, maxChars: 400 },
    { id: "ar_pr", kind: "pr_description", title: "Pull request description", instructions: "Explain the change so a reviewer can approve it in five minutes.", template: "## Why\n\n## What changed\n\n## How I tested\n\n## Risks\n", required: true, maxChars: 2000 },
  ],
  beats: [
    {
      title: "Understand the ticket",
      objective: "Read the ticket and the team guide. Ask whatever you need before you touch the code.",
      enter: [
        { from: "priya", body: "Morning! Welcome to day 3. I've put **{{ticket}}** on your board. Customers are getting a double discount. Can you take it? Release is Friday.", meta: { quickReplies: ["Yes, I'll start now", "Can I ask a few questions first?"] } },
      ],
      canAdvance: (m) => opened(m, "it_ticket") && learnerMsgs(m).length > 0,
    },
    {
      title: "Fix the bug",
      objective: "Fix the double discount in pricing.py and run the checks.",
      enter: [
        { from: "rohan", body: "Hey, I'm your buddy this week. Code is in `src/pricing.py`, tests in `tests/`. **Run checks** runs them in the sandbox. Ping me if you get stuck.", wait: 10 },
      ],
      canAdvance: (m) => m.checksRuns >= 1,
    },
    {
      title: "Ship it",
      objective: "Write the commit message and the pull request description, then submit both.",
      enter: [
        { from: "priya", body: "Nice progress. Write the commit and the PR so Arjun can review. The format is in the team guide.", wait: 15 },
      ],
      canAdvance: (m) => !!m.submitted.ar_commit && !!m.submitted.ar_pr,
    },
    {
      title: "Handle the review",
      objective: "Respond to the review, fix what it asks for, and run the checks again. Then finish.",
      enter: [
        { from: "neha", body: "I'm testing the demo build now. Bulk orders, small orders, and a few odd inputs.", wait: 20 },
      ],
      canAdvance: () => false,
    },
  ],
  replies: [
    { id: "p_scope", to: "priya", match: /(whole order|per line|line item|each item|apply|applies)/i, reply: "Good question. Whole order, once. Details are in the guide. Ask Rohan if the codebase confuses you.", signal: "asked_clarifying_question_before_edit" },
    { id: "p_deadline", to: "priya", match: /(when|deadline|friday|priority|by when|urgent)/i, reply: "Release is Friday at 4 PM, so I'd like the PR up by Thursday. It's high priority because finance is issuing refunds.", signal: "checked_deadline" },
    { id: "p_ask", to: "priya", match: /(question|can i ask|clarif)/i, reply: "Of course. What would you like to know?", quick: ["Does the discount apply per line or to the whole order?", "When do you need it by?"] },
    { id: "p_status", to: "priya", match: /(done|update|status|ready|pushed|\bpr\b|fixed|submitted)/i, reply: "Thanks for the update, that's exactly what I like to hear before lunch. Arjun will review once the PR is up.", signal: "gave_status_update" },
    { id: "p_yes", to: "priya", match: /(yes|start|on it|sure|will do|ok)/i, reply: "Great. Read the ticket and the team guide first, it saves review rounds." },
    { id: "r_where", to: "rohan", match: /(where|which file|find|look|start)/i, reply: "Logic lives in `src/pricing.py`, tests in `tests/test_pricing.py`. Look at where `line_total` and `total` both touch the discount.", signal: "asked_buddy" },
    { id: "r_stuck", to: "rohan", match: /(stuck|help|confus|hint|lost|understand)/i, reply: "Totally normal on day 3. Trace one bulk order through both functions by hand. You'll spot it.", signal: "asked_buddy" },
    { id: "r_commit", to: "rohan", match: /(commit|format|pr|review|arjun)/i, reply: "Check CONTRIBUTING.md, the commit format is strict here. Arjun bounces PRs without the ticket key.", signal: "asked_buddy" },
    { id: "a_ack", to: "arjun", match: /(thanks|thank you|good catch|agree|will add|adding|added|you're right|makes sense|fair)/i, reply: "Thanks. Ping me when the test is in and checks are green, I'll approve.", signal: "acknowledged_review" },
    { id: "a_push", to: "arjun", match: /(why|disagree|not needed|unnecessary|but )/i, reply: "Fair to ask. Zero and negative quantities come in from the returns flow, so this has broken before. A test keeps it fixed." },
    { id: "n_test", to: "neha", match: /(test|qa|edge|build|case)/i, reply: "I check bulk orders, zero quantities and returns on every pricing change. If you cover those in tests, my job is easy." },
  ],
  fallback: {
    priya: ["Sounds good. Keep me posted.", "Makes sense. Rohan is the best person for code questions."],
    rohan: ["Happy to help. What are you looking at?", "Good thinking. Try it and run the checks."],
    arjun: ["I'll look once the PR is up.", "Noted. I review in the order PRs arrive."],
    neha: ["I'll test as soon as there's a build.", "Thanks, noted for my test plan."],
  },
  rejections: [
    { personId: "priya", summary: "Proposed tool reply(chat, \"The fix is to remove the discount from line_total…\")", reason: "Reveals the solution. The manager persona may not give the answer." },
    { personId: "rohan", summary: "Proposed tool reply(chat, \"Skip the test, it's a one-line fix\")", reason: "Contradicts the team guide rule: every bug fix ships with a test." },
    { personId: "arjun", summary: "Proposed tool approve_pr()", reason: "Approval blocked: the review checklist item 'edge-case test' is not satisfied." },
  ],
  checks: (m) => {
    const src = m.files.it_pricing ?? "";
    const tests = m.files.it_tests ?? "";
    const ok = /def total/.test(src);
    return [
      { id: "c1", name: "test_total_simple", kind: "test", passed: ok, hidden: false, message: ok ? undefined : "total() is missing." },
      { id: "c2", name: "test_small_order_no_discount", kind: "test", passed: ok, hidden: false },
      { id: "c3", name: "test_bulk_discount_once", kind: "test", passed: ok && fixedOnce(src), hidden: false, message: ok && fixedOnce(src) ? undefined : "Expected the discount once; it was applied more than once." },
      { id: "c4", name: "no_debug_prints", kind: "lint", passed: !/print\(/.test(src), hidden: false, message: /print\(/.test(src) ? "Remove print() calls from src/." : undefined },
      { id: "c5", name: "rejects_non_positive_quantity", kind: "test", passed: guardsQty(src), hidden: true, message: guardsQty(src) ? undefined : "A hidden check failed. Think about unusual inputs." },
      { id: "c6", name: "regression_test_added", kind: "convention", passed: testsEdge(tests), hidden: true, message: testsEdge(tests) ? undefined : "A hidden check failed. Read the team guide again." },
    ];
  },
  onSubmit: (artifactId, content, _m, vars) => {
    if (artifactId === "ar_commit") {
      const subject = content.split("\n")[0] ?? "";
      const conv = /^(fix|feat|refactor|test|chore|docs)(\([\w-]+\))?!?: \S/.test(subject);
      const key = content.includes(vars.ticket);
      return {
        lines: [],
        trace: [
          { summary: `Deterministic check: subject matches type(scope): summary → ${conv ? "pass" : "fail"}`, verdict: "accepted" },
          { summary: `Deterministic check: references ${vars.ticket} → ${key ? "pass" : "fail"}`, verdict: "accepted" },
          { summary: `Deterministic check: subject length ${subject.length}/72 → ${subject.length <= 72 ? "pass" : "fail"}`, verdict: "accepted" },
        ],
      };
    }
    if (artifactId === "ar_pr") {
      return {
        lines: [
          { from: "arjun", kind: "review_comment", channel: "review", wait: 25, body: "This fixes the double discount, thanks. Could you add a test for quantity = 0 and negative quantities? They come in from the returns flow and have regressed before.", meta: { commentFile: "src/pricing.py", commentLine: 6, severity: "blocker" } },
          { from: "arjun", kind: "review_comment", channel: "review", body: "Small one: `line_total` could use a docstring now that it no longer discounts.", meta: { commentFile: "src/pricing.py", commentLine: 6, severity: "nit" } },
        ],
        trace: [{ summary: "Reviewer agent proposed 2 review comments on src/pricing.py", verdict: "accepted" }],
      };
    }
    return { lines: [], trace: [] };
  },
};

const drillCommit: MissionDef = {
  id: "swe-drill-commit-hygiene-b",
  title: "Drill: commit and PR for a different bug",
  description: "Write a commit and PR a reviewer can approve in five minutes.",
  estMinutes: 8,
  company: "Meridian Labs",
  startLabel: { day: "Thu", minutes: 14 * 60 },
  people: [people.arjun],
  skillIds: ["git_hygiene"],
  items: [
    { id: "it_ticket", type: "ticket", title: "INV-311 · Coupon codes are case sensitive", key: "INV-311", status: "In review", priority: "medium", description: "`SAVE10` works but `save10` is rejected. The fix lower-cases codes before lookup. The change is done; write the commit and PR." },
    { id: "it_diff", type: "doc", title: "Your diff", markdown: "```diff\n- code = request.coupon\n+ code = request.coupon.strip().lower()\n```\nAdded `test_coupon_case_insensitive` in `tests/test_coupons.py`." },
    { id: "it_guide", type: "doc", title: "CONTRIBUTING.md", markdown: GUIDE },
  ],
  artifacts: [
    { id: "ar_commit", kind: "commit_message", title: "Commit message", instructions: "Commit for INV-311, following the team guide.", required: true, maxChars: 400 },
    { id: "ar_pr", kind: "pr_description", title: "Pull request description", instructions: "Why, what changed, how you tested, risks.", template: "## Why\n\n## What changed\n\n## How I tested\n\n## Risks\n", required: true, maxChars: 2000 },
  ],
  beats: [
    { title: "Write it up", objective: "Submit a commit message and a PR description for INV-311.", hint: "Subject format: fix(coupons): accept codes in any case (INV-311). The body says why customers were affected.", enter: [{ from: "arjun", body: "The coupon fix looks good. Write it up properly and I'll approve." }], canAdvance: () => false },
  ],
  replies: [{ id: "a_q", to: "arjun", match: /./, reply: "Follow CONTRIBUTING.md and you'll be fine. I mostly look for the why." }],
  fallback: { arjun: ["Ready when you are."] },
  rejections: [],
};

const drillFeedback: MissionDef = {
  id: "swe-drill-feedback",
  title: "Drill: reply to a blocking review",
  description: "A reviewer blocks your PR. Reply well and say what you will change.",
  estMinutes: 6,
  company: "Meridian Labs",
  startLabel: { day: "Fri", minutes: 11 * 60 },
  people: [people.arjun],
  skillIds: ["feedback"],
  items: [{ id: "it_pr", type: "doc", title: "PR #418 · fix(search): trim whitespace (INV-322)", markdown: "## Why\nSearch ignored results when queries had trailing spaces.\n\n## What changed\nTrim the query before lookup.\n\n## How I tested\nManual test in the browser." }],
  artifacts: [{ id: "ar_reply", kind: "text", title: "Your plan", instructions: "In two or three lines: what you will change and when.", required: true, maxChars: 600 }],
  beats: [
    { title: "Respond", objective: "Reply to Arjun in chat, then submit your plan.", hint: "Thank the reviewer, agree on the change, and give a time.", enter: [{ from: "arjun", kind: "review_comment", channel: "review", body: "Blocking: there is no automated test. Manual browser testing will not catch this next time.", meta: { severity: "blocker", commentFile: "src/search.py", commentLine: 12 } }], canAdvance: () => false },
  ],
  replies: [{ id: "a_ack", to: "arjun", match: /(thanks|agree|will|add|right)/i, reply: "Great, thanks. I'll approve once the test is in.", signal: "acknowledged_review" }],
  fallback: { arjun: ["I'd still like a test before I approve."] },
  rejections: [],
};

export const swe: RolePack = {
  summary: { id: "software-engineer", title: "Software Engineer (Graduate / Intern)", tagline: "Your first pull request, reviewed by a real team.", domain: "Technology", status: "ready", company: "Meridian Labs", estMinutes: 25, skillCount: 5, icon: "terminal", accentHex: "#1a73e8" },
  description: "You join the payments team at Meridian Labs, a fictional storefront company. On day 3 you get a real bug, a strict team guide, a busy reviewer and a QA engineer who tests the odd cases.",
  whatYouWillPractise: ["Asking the question that removes the ambiguity", "Fixing a bug and proving it with tests", "Writing a commit and pull request a teammate can follow", "Taking review feedback without friction"],
  cast: [
    { id: "priya", name: "Priya Nair", title: "Engineering Manager", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Clear and kind, but expects a status update and protects the Friday release." },
    { id: "arjun", name: "Arjun Rao", title: "Senior Engineer (reviewer)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Reviews carefully. Will not approve a bug fix without a test that would have caught it." },
    { id: "neha", name: "Neha Shah", title: "QA Engineer", kind: "agent", modelLabel: "Gemini 4 Hydrogen + code execution", blurb: "Tests the inputs nobody thinks about, like zero and returns." },
    { id: "rohan", name: "Rohan Mehta", title: "Buddy (engineer, 1 year in)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Remembers his own first month. Happy to help if you ask." },
  ],
  skills: [
    { def: { id: "clarify", label: "Ask before you build", description: "Remove the main ambiguity with one precise question before writing code.", targetLevel: 2 }, missedFact: "The discount applies once, to the whole order. Priya would have told you if you had asked.", badge: { title: "Asked before building", description: "You removed the ambiguity before touching the code." }, anchors: [
      { text: "Asked a clarifying question before editing code", source: "code", test: (m) => findLearner(m, /\?/) },
      { text: "Confirmed how the discount should apply", source: "judge", test: (m) => findLearner(m, /(whole order|per line|line item|each item|once)/i) },
      { text: "Read the ticket first", source: "code", test: (m) => ({ met: opened(m, "it_ticket") }) },
      { text: "Checked the deadline or priority", source: "judge", test: (m) => findLearner(m, /(friday|deadline|by when|when do you|priority|release)/i) },
    ] },
    { def: { id: "verify", label: "Verify before you ship", description: "Run the checks, cover the edge cases, and re-check after changes.", targetLevel: 3 }, missedFact: "The returns flow sends quantity 0 and negative quantities. A hidden check tested for it.", badge: { title: "Verified before shipping", description: "You ran the checks and covered the edge case before submitting." }, anchors: [
      { text: "Ran the checks before submitting", source: "code", test: (m) => ({ met: m.checksRuns > 0 && (!m.submittedSeq.ar_commit || m.events.some((e) => e.kind === "check_result" && e.seq < m.submittedSeq.ar_commit)) }) },
      { text: "Fixed the double discount", source: "code", test: (m) => ({ met: fixedOnce(m.files.it_pricing ?? "") }) },
      { text: "Handled quantity 0 or less", source: "code", test: (m) => ({ met: guardsQty(m.files.it_pricing ?? "") }) },
      { text: "Re-ran checks after the review", source: "code", test: (m) => { const r = m.events.find((e) => e.kind === "review_comment"); return { met: !!r && m.events.some((e) => e.kind === "check_result" && e.seq > r.seq) }; } },
    ] },
    { def: { id: "git_hygiene", label: "Commits and pull requests teammates can follow", description: "A commit subject in the team's format and a PR that explains why.", targetLevel: 4 }, missedFact: "The team guide asks for the ticket key in every commit subject.", badge: { title: "Reviewer-ready write-up", description: "Your commit and PR followed the team format." }, anchors: [
      { text: "Commit subject follows type(scope): summary", source: "code", test: (m) => { const r = artifactHas(m, "ar_commit", /^(fix|feat|refactor|test|chore|docs)(\([\w-]+\))?!?: \S/); return { ...r, note: r.met ? "The subject follows the team format." : "The subject does not follow type(scope): summary." }; } },
      { text: "Commit references the ticket key", source: "code", test: (m, v) => artifactHas(m, "ar_commit", new RegExp(v.ticket)) },
      { text: "Subject is under 72 characters", source: "code", test: (m) => { const c = m.submitted.ar_commit; return { met: !!c && (c.split("\n")[0] ?? "").length <= 72, seq: m.submittedSeq.ar_commit }; } },
      { text: "PR explains why, not only what", source: "judge", test: (m) => artifactHas(m, "ar_pr", /## Why\s*\n+\s*\S.{15,}/) },
      { text: "PR says how it was tested", source: "judge", test: (m) => artifactHas(m, "ar_pr", /## How I tested\s*\n+\s*\S.{8,}/) },
    ] },
    { def: { id: "feedback", label: "Take review feedback well", description: "Acknowledge the point, agree on the change, and say when it will be done.", targetLevel: 2 }, badge: { title: "Smooth reviews", description: "You turned a blocking comment into an agreed change." }, anchors: [
      { text: "Replied to the reviewer", source: "code", test: (m) => { const e = learnerMsgs(m, "arjun")[0]; return e ? { met: true, seq: e.seq, quote: e.body.slice(0, 100) } : { met: false }; } },
      { text: "Acknowledged the point without arguing", source: "judge", test: (m) => findLearner(m, /(thanks|thank you|good catch|agree|you're right|makes sense|fair)/i, "arjun") },
      { text: "Said what will change and when", source: "judge", test: (m) => findLearner(m, /(will add|i'll add|adding|added|pushed|today|in \d+ ?min|now)/i, "arjun") },
    ] },
    { def: { id: "team_norms", label: "Read the team's unwritten rules", description: "Use the guide, ask the buddy, and keep your manager informed.", targetLevel: 2 }, missedFact: "The guide asks for a short status update to your manager before lunch.", badge: { title: "Knows how the team works", description: "You used the team guide and kept people informed." }, anchors: [
      { text: "Read CONTRIBUTING.md", source: "code", test: (m) => ({ met: opened(m, "it_guide") }) },
      { text: "Asked the buddy instead of guessing", source: "code", test: (m) => { const e = learnerMsgs(m, "rohan")[0]; return e ? { met: true, seq: e.seq, quote: e.body.slice(0, 100) } : { met: false }; } },
      { text: "Gave the manager a status update", source: "judge", test: (m) => findLearner(m, /(done|update|status|ready|pushed|\bpr\b|fixed|submitted)/i, "priya") },
    ] },
  ],
  ramp: [
    { id: "swe_w1_guide", typicalWeek: 1, title: "Learn how the team works", description: "Read the team guide and know who to ask for what.", skillIds: ["team_norms"], coveredBy: { kind: "mission", id: "swe-day3-bugfix" } },
    { id: "swe_w2_clarify", typicalWeek: 2, title: "Clarify a ticket before coding", description: "Ask the question that removes the main ambiguity.", skillIds: ["clarify"], coveredBy: { kind: "mission", id: "swe-day3-bugfix" } },
    { id: "swe_w2_ship", typicalWeek: 2, title: "Ship your first reviewed change", description: "A tested fix with a commit and PR a reviewer can follow.", skillIds: ["git_hygiene", "verify"], coveredBy: { kind: "mission", id: "swe-day3-bugfix" } },
    { id: "swe_w4_review", typicalWeek: 4, title: "Handle review feedback without friction", description: "Turn a blocking review into an agreed change.", skillIds: ["feedback"], coveredBy: { kind: "drill", id: "swe-drill-feedback" } },
    { id: "swe_w8_feature", typicalWeek: 8, title: "Own a small feature end to end", description: "Scope, build, test and release something small on your own.", skillIds: [], coveredBy: null },
    { id: "swe_w12_mentor", typicalWeek: 12, title: "Help the next new hire", description: "Answer a newer teammate's question about how the team works.", skillIds: [], coveredBy: null },
  ],
  mission,
  drills: [
    { id: "swe-drill-commit-hygiene-b", skillId: "git_hygiene", title: "Write a commit and PR for a different bug", why: "", estMinutes: 8, mission: drillCommit },
    { id: "swe-drill-feedback", skillId: "feedback", title: "Reply to a blocking review", why: "", estMinutes: 6, mission: drillFeedback },
  ],
  variants: [
    { seed: "K7F2", label: "bulk-order pricing", vars: { ticket: "INV-142", segment: "bulk orders", threshold: "10", rate: "10" } },
    { seed: "P3XQ", label: "wholesale pricing", vars: { ticket: "INV-207", segment: "wholesale orders", threshold: "25", rate: "15" } },
    { seed: "M9TD", label: "school-supplies pricing", vars: { ticket: "INV-263", segment: "school bulk orders", threshold: "20", rate: "12" } },
  ],
  consequence: { title: "Your skipped edge-case test came back", detail: "QA found that an order line with quantity 0 or less is accepted and produces a wrong total in the demo build.", when: (m) => !guardsQty(m.files.it_pricing ?? "") },
  headline: (strong, gaps) => strong.length && gaps.length ? `Strong on ${strong[0].toLowerCase()}. Next: ${gaps[0].toLowerCase()}.` : gaps.length ? `A useful first shift. Next: ${gaps[0].toLowerCase()}.` : "A clean first shift. Now prove it on a fresh variant.",
};
