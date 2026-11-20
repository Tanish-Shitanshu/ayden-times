import type { RolePack, MissionDef } from "../types";
import { findLearner, artifactHas, opened, learnerMsgs } from "../types";

const P = {
  farah: { id: "farah", name: "Farah Ali", title: "Analytics Lead", kind: "agent", avatarHue: 300, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  nikhil: { id: "nikhil", name: "Nikhil Jain", title: "Product Manager", kind: "agent", avatarHue: 50, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  tara: { id: "tara", name: "Tara Pillai", title: "Data Engineer", kind: "agent", avatarHue: 170, presence: "away", modelLabel: "Gemini 4 Hydrogen" },
} as const;

const DEFS = `# Metric definitions

- **Orders** = rows in \`orders\` with \`status = 'completed'\`. Cancelled and refunded orders do not count.
- **Exclude test accounts**: \`is_test = true\`.
- **Weeks start on Monday**: \`DATE_TRUNC(order_date, WEEK(MONDAY))\`.
- When a number moves more than 10% week on week, check the pipeline log with Data Engineering before you report it.
`;

const SQL = `-- Weekly completed orders
SELECT
  DATE_TRUNC(order_date, WEEK) AS week,
  COUNT(*) AS orders
FROM orders
GROUP BY week
ORDER BY week;
`;

const s = (m: { files: Record<string, string> }) => (m.files.it_sql ?? "").toLowerCase();
const okStatus = (q: string) => /status\s*=\s*'completed'/.test(q);
const okTest = (q: string) => /is_test\s*(=\s*false|is\s+false|!=\s*true|<>\s*true)|not\s+is_test/.test(q);
const okMonday = (q: string) => /week\s*\(\s*monday\s*\)/.test(q);

const mission: MissionDef = {
  id: "data-orders-drop",
  title: "Week 1 at Quill Commerce: why did orders drop?",
  description: "A PM wants one number fast. Use the metric definitions, fix the query, check with data engineering, and answer with a caveat.",
  estMinutes: 22,
  company: "Quill Commerce (fictional)",
  startLabel: { day: "Mon", minutes: 10 * 60 },
  people: [P.farah, P.nikhil, P.tara],
  skillIds: ["definitions", "sql", "sanity", "communication", "pushback"],
  items: [
    { id: "it_ticket", type: "ticket", title: "DATA-88 · Weekly orders down {{drop}}%?", key: "DATA-88", status: "To do", priority: "high", description: "The exec dashboard shows weekly orders down {{drop}}% last week. Nikhil needs to know if it is real before the noon sync." },
    { id: "it_defs", type: "doc", title: "Metric definitions", markdown: DEFS },
    { id: "it_sql", type: "file", title: "weekly_orders.sql", path: "analysis/weekly_orders.sql", language: "sql", content: SQL, editable: true },
    { id: "it_sample", type: "table", title: "orders (sample rows)", columns: ["order_id", "user_id", "order_date", "status", "amount", "is_test"], rows: [["o_9121", "u_402", "2026-11-09", "completed", 1240, "false"], ["o_9122", "u_977", "2026-11-09", "cancelled", 560, "false"], ["o_9130", "u_test_14", "2026-11-03", "completed", 10, "true"], ["o_9131", "u_test_15", "2026-11-03", "completed", 10, "true"], ["o_9140", "u_318", "2026-11-10", "refunded", 890, "false"]], note: "Sample only. The full table has about 60,000 rows." },
  ],
  artifacts: [
    { id: "ar_sql", kind: "sql", title: "Final query", instructions: "Paste the query you would share with the team.", required: true, maxChars: 2000 },
    { id: "ar_summary", kind: "text", title: "Answer for Nikhil", instructions: "Answer first, with the number and one caveat.", required: true, maxChars: 800 },
  ],
  beats: [
    { title: "Understand the question", objective: "Read the ticket and the metric definitions. Ask what you need.", enter: [{ from: "farah", body: "Welcome! First real one for you: **DATA-88**. Use the metric definitions, they exist for a reason.", meta: { quickReplies: ["Will do", "Which definition of orders should I use?"] } }], canAdvance: (m) => opened(m, "it_ticket") && (opened(m, "it_defs") || learnerMsgs(m).length > 0) },
    { title: "Fix the query", objective: "Make weekly_orders.sql follow the definitions, then run the checks.", enter: [{ from: "nikhil", wait: 15, body: "Hey, I need the drop % for the exec sync at noon. Can you just send me the number from the dashboard?", meta: { quickReplies: ["I'll have a checked number by 11:45", "Sure, it's {{drop}}%"] } }], canAdvance: (m) => m.checksRuns >= 1 },
    { title: "Answer", objective: "Submit your final query and a short answer for Nikhil. Then finish.", enter: [{ from: "farah", wait: 10, body: "Looks like you're close. Remember: answer first, then the caveat." }], canAdvance: () => false },
  ],
  replies: [
    { id: "f_def", to: "farah", match: /(definition|which|count|test|status|week)/i, reply: "Completed orders only, no test accounts, weeks from Monday. It's all in the definitions doc.", signal: "asked_definition" },
    { id: "f_any", to: "farah", match: /./, reply: "Great. Shout if anything looks odd." },
    { id: "t_pipe", to: "tara", match: /(pipeline|load|data|missing|late|backfill|test|odd|weird|drop|spike)/i, reply: "Heads up: test accounts from the load test the week before landed in production orders. That week looks inflated if you don't filter `is_test`.", signal: "checked_pipeline" },
    { id: "t_any", to: "tara", match: /./, reply: "Happy to help. What looks off?" },
    { id: "n_time", to: "nikhil", match: /(11|noon|before|checked|minutes|by|soon|verify|confirm)/i, reply: "Okay, a checked number by 11:45 works. Thanks.", signal: "set_realistic_expectation" },
    { id: "n_fast", to: "nikhil", match: /(sure|it's|\d+%)/i, reply: "Thanks, I'll put that in the deck." },
  ],
  fallback: { farah: ["Sounds good."], nikhil: ["Thanks. Noon is a hard stop."], tara: ["Let me know if you need the pipeline log."] },
  rejections: [
    { personId: "farah", summary: "Proposed tool reply(chat, \"Add WHERE is_test = false and status = 'completed'\")", reason: "Rejected: reveals the fix. The lead persona points to the definitions instead." },
    { personId: "nikhil", summary: "Proposed tool reply(chat, \"The real drop is 6%\")", reason: "Rejected: the PM persona does not know the hidden ground truth." },
  ],
  checks: (m) => {
    const q = s(m);
    return [
      { id: "d1", name: "counts_completed_only", kind: "rule", passed: okStatus(q), hidden: false, message: okStatus(q) ? undefined : "Orders should count completed orders only." },
      { id: "d2", name: "groups_by_week", kind: "rule", passed: /group by/.test(q) && /week/.test(q), hidden: false },
      { id: "d3", name: "excludes_test_accounts", kind: "rule", passed: okTest(q), hidden: true, message: okTest(q) ? undefined : "A hidden check failed. Re-read the definitions." },
      { id: "d4", name: "week_starts_monday", kind: "convention", passed: okMonday(q), hidden: true, message: okMonday(q) ? undefined : "A hidden check failed. Check how weeks are defined." },
    ];
  },
};

const drill: MissionDef = {
  id: "data-drill-definitions", title: "Drill: apply the metric definitions", description: "Fix a revenue query so it follows the team's definitions.", estMinutes: 8, company: "Quill Commerce (fictional)", startLabel: { day: "Wed", minutes: 15 * 60 },
  people: [P.farah], skillIds: ["definitions"],
  items: [{ id: "it_defs", type: "doc", title: "Metric definitions", markdown: DEFS }, { id: "it_sql", type: "file", title: "weekly_revenue.sql", path: "analysis/weekly_revenue.sql", language: "sql", content: "SELECT DATE_TRUNC(order_date, WEEK) AS week, SUM(amount) AS revenue\nFROM orders\nGROUP BY week;\n", editable: true }],
  artifacts: [{ id: "ar_sql", kind: "sql", title: "Final query", instructions: "Paste your corrected query.", required: true, maxChars: 2000 }],
  beats: [{ title: "Fix it", objective: "Apply all three definitions, run checks, and submit the query.", hint: "Three rules: completed only, exclude is_test, weeks from Monday.", enter: [{ from: "farah", body: "Same definitions, different metric. Give it a go." }], canAdvance: () => false }],
  replies: [{ id: "f", to: "farah", match: /./, reply: "Check the definitions doc, all three rules apply." }], fallback: { farah: ["You've got this."] }, rejections: [],
  checks: (m) => { const q = s(m); return [
    { id: "d1", name: "counts_completed_only", kind: "rule", passed: okStatus(q), hidden: false },
    { id: "d3", name: "excludes_test_accounts", kind: "rule", passed: okTest(q), hidden: false },
    { id: "d4", name: "week_starts_monday", kind: "convention", passed: okMonday(q), hidden: false },
  ]; },
};

export const data: RolePack = {
  summary: { id: "data-analyst", title: "Data Analyst", tagline: "One number, a noon deadline, and a definition nobody read.", domain: "Data", status: "ready", company: "Quill Commerce (fictional)", estMinutes: 22, skillCount: 5, icon: "query_stats", accentHex: "#9334e6" },
  description: "You join the analytics team at Quill Commerce, a fictional online store. A product manager wants a number before noon. The dashboard query ignores the team's definitions.",
  whatYouWillPractise: ["Using the team's metric definitions", "Fixing a SQL query and checking it", "Sanity-checking a surprising number with data engineering", "Answering a PM with a number and a caveat"],
  cast: [
    { id: "farah", name: "Farah Ali", title: "Analytics Lead", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Patient, and strict about definitions." },
    { id: "nikhil", name: "Nikhil Jain", title: "Product Manager", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Has an exec sync at noon and wants one number." },
    { id: "tara", name: "Tara Pillai", title: "Data Engineer", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Knows what happened in the pipeline last week." },
  ],
  skills: [
    { def: { id: "definitions", label: "Use the team's definitions", description: "Count what the team counts, the way the team counts it.", targetLevel: 2 }, missedFact: "Test accounts from a load test inflated the week before, which exaggerated the drop.", badge: { title: "Definitions first", description: "Your query followed the team's metric definitions." }, anchors: [
      { text: "Read the metric definitions", source: "code", test: (m) => ({ met: opened(m, "it_defs") }) },
      { text: "Counted completed orders only", source: "code", test: (m) => ({ met: okStatus(s(m)) }) },
      { text: "Excluded test accounts", source: "code", test: (m) => ({ met: okTest(s(m)) }) },
    ] },
    { def: { id: "sql", label: "Correct, checked SQL", description: "A query that runs, follows conventions and passes the checks.", targetLevel: 2 }, badge: { title: "Checked query", description: "You ran the checks and fixed what failed." }, anchors: [
      { text: "Ran the checks", source: "code", test: (m) => ({ met: m.checksRuns > 0 }) },
      { text: "Weeks start on Monday", source: "code", test: (m) => ({ met: okMonday(s(m)) }) },
      { text: "Submitted the final query", source: "code", test: (m) => artifactHas(m, "ar_sql", /select/i) },
    ] },
    { def: { id: "sanity", label: "Sanity-check surprising numbers", description: "When a number jumps, check the pipeline before you report it.", targetLevel: 1 }, badge: { title: "Checked the pipeline", description: "You checked a surprising number before reporting it." }, anchors: [
      { text: "Asked data engineering about the data", source: "judge", test: (m) => findLearner(m, /(pipeline|load|data|missing|late|backfill|test|odd|weird|drop|spike)/i, "tara") },
      { text: "Mentioned the test-account issue in the answer", source: "judge", test: (m) => artifactHas(m, "ar_summary", /(test account|load test|is_test|inflated)/i) },
    ] },
    { def: { id: "communication", label: "Answer first, with a caveat", description: "Lead with the number, then one sentence on what could change it.", targetLevel: 2 }, badge: { title: "Answer first", description: "Your answer led with the number and a caveat." }, anchors: [
      { text: "Answer includes a number", source: "code", test: (m) => artifactHas(m, "ar_summary", /\d+(\.\d+)?\s*%|\d{2,}/) },
      { text: "Includes a caveat", source: "judge", test: (m) => artifactHas(m, "ar_summary", /(caveat|note|assum|however|because|excluding|inflated)/i) },
      { text: "Short enough to read in the meeting", source: "code", test: (m) => ({ met: !!m.submitted.ar_summary && m.submitted.ar_summary.length <= 500, seq: m.submittedSeq.ar_summary }) },
    ] },
    { def: { id: "pushback", label: "Set realistic expectations", description: "Under time pressure, give a checked answer by a time instead of an unchecked one now.", targetLevel: 1 }, badge: { title: "Checked over fast", description: "You chose a checked number over a quick one." }, anchors: [
      { text: "Gave a time instead of an unchecked number", source: "judge", test: (m) => findLearner(m, /(11|noon|before|checked|minutes|by \d|verify|confirm)/i, "nikhil") },
      { text: "Did not send the dashboard number unchecked", source: "code", test: (m) => { const bad = findLearner(m, /(sure, it'?s|\d+\s*%)/i, "nikhil"); return { met: learnerMsgs(m, "nikhil").length > 0 && !bad.met }; } },
    ] },
  ],
  ramp: [
    { id: "d_w1_defs", typicalWeek: 1, title: "Learn the metric definitions", description: "Count what the team counts.", skillIds: ["definitions"], coveredBy: { kind: "mission", id: "data-orders-drop" } },
    { id: "d_w2_query", typicalWeek: 2, title: "Ship a checked query", description: "Correct, conventional and verified.", skillIds: ["sql"], coveredBy: { kind: "mission", id: "data-orders-drop" } },
    { id: "d_w2_sanity", typicalWeek: 2, title: "Sanity-check a surprising number", description: "Check the pipeline before reporting a jump.", skillIds: ["sanity"], coveredBy: { kind: "mission", id: "data-orders-drop" } },
    { id: "d_w4_answer", typicalWeek: 4, title: "Answer a stakeholder under time pressure", description: "Number, caveat, on time.", skillIds: ["communication", "pushback"], coveredBy: { kind: "mission", id: "data-orders-drop" } },
    { id: "d_w8_dash", typicalWeek: 8, title: "Own a dashboard", description: "Keep a team dashboard correct and trusted.", skillIds: [], coveredBy: null },
    { id: "d_w12_exp", typicalWeek: 12, title: "Analyse an experiment", description: "Read an A/B test result with care.", skillIds: [], coveredBy: null },
  ],
  mission,
  drills: [{ id: "data-drill-definitions", skillId: "definitions", title: "Apply the metric definitions to a revenue query", why: "", estMinutes: 8, mission: drill }],
  variants: [
    { seed: "Q18W", label: "weekly orders drop", vars: { drop: "18" } },
    { seed: "Q23W", label: "steeper orders drop", vars: { drop: "23" } },
  ],
  consequence: { title: "The exec deck had the wrong number", detail: "The unfiltered query counted load-test orders, so the drop looked bigger than it was.", when: (m) => !okTest(s(m)) },
  headline: (st, g) => st.length && g.length ? `Strong on ${st[0].toLowerCase()}. Next: ${g[0].toLowerCase()}.` : g.length ? `A good first query. Next: ${g[0].toLowerCase()}.` : "Checked, clear and on time. Try a fresh variant.",
};
