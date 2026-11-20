import type { CheckResult, WorkItem } from "@ayden/contract";
import { diffSize, int, pick, rng, said } from "../domain/text.js";
import type { AnchorDef, DrillDef, EngineCtx, MissionBuild, MissionDef, RolePack, RunChecksCtx, ScriptedEvent, Vars } from "../domain/types.js";
import { hit, person, say, section, sys, trapFrom } from "./helpers.js";
import { FAMILIES, buildProgram, countTests, parseResults, staticChecks, type SweFamily } from "./swe-code.js";

const ROLE = "software-engineer" as const;
const COMPANY = "Meridian Labs";

const CONTRIBUTING = `# How we work at Meridian Labs

1. **Read the ticket.** If anything is unclear, ask in chat before you code.
2. **Branch** from \`main\`: \`fix/<ticket>-short-name\`.
3. **Commit format:** \`type(scope): summary\`. Types: fix, feat, test, docs, refactor, chore. Imperative summary, 72 characters max, **include the ticket key**. Example: \`fix(cart): stop duplicate items (CART-12)\`.
4. **Every bug fix ships with a test** that fails before the fix and passes after.
5. **Validate inputs.** Raise \`ValueError\` for invalid values (negative quantities, rates outside 0 to 1, weights of zero or less).
6. **Code style:** type hints on every function, a one-line docstring, no magic numbers (use named constants), no \`print\` statements, keep changes small and focused.
7. **Pull requests** explain: Why, What changed, How I tested, Risks.
8. **Never commit secrets.** If you see one in the repo, tell your manager.
9. **Reviews:** reply to every comment. If you disagree, say why, politely.
10. **Out-of-scope requests** go to your manager as a new ticket. They do not go into your PR.
`;

const README = `# OrderDesk

Order service for Meridian Labs. Run the tests with \`python -m pytest\`.

## Local setup

\`\`\`
cp .env.example .env
PAYMENTS_API_KEY=sk_demo_51Ab9xQ7LmNp   # <- someone pasted a real-looking key here by mistake
\`\`\`
`;

const SKILLS = [
  { id: "clarify", label: "Clarify before you code", description: "Ask the right question and read the team's rules before touching the code.", targetLevel: 3, badge: "Clarified before coding" },
  { id: "verify", label: "Verify before you ship", description: "Run the checks, cover the edge cases and add a test that proves the fix.", targetLevel: 3, badge: "Verified before shipping" },
  { id: "conventions", label: "Code a teammate can read", description: "Follow the team's code style: types, docstrings, small focused changes, no debug leftovers, no secrets.", targetLevel: 3, badge: "Clean, readable code" },
  { id: "git_hygiene", label: "Commits and PRs others can follow", description: "Write commit messages and pull requests that a reviewer can understand in five minutes.", targetLevel: 3, badge: "Commits a team can follow" },
  { id: "review_collab", label: "Work with reviewers and stakeholders", description: "Respond to reviews, disagree politely with a reason, and hold your standards under pressure.", targetLevel: 3, badge: "Collaborated under pressure" },
];

/* ───────────── anchors ───────────── */

const firstMsg = (c: { learner: { kind: string; seq: number; body: string }[] }) => c.learner.find((e) => e.kind === "message");
const BEFORE_SAVE = (c: { session: { firstSaveSeq: number | null } }) => c.session.firstSaveSeq ?? Number.POSITIVE_INFINITY;
const reviewSeq = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.reviewSeq ?? 0);
const b3Seq = (c: { session: { flags: Record<string, unknown> } }) => Number(c.session.flags.b3Seq ?? Number.POSITIVE_INFINITY);

const ANCHORS: AnchorDef[] = [
  {
    id: "asked_before_edit", skillId: "clarify", kind: "code", text: "Asked a question before the first edit",
    eval: (c) => { const m = firstMsg(c); return m && m.seq < BEFORE_SAVE(c) ? { met: true, seq: m.seq, quote: m.body.slice(0, 120) } : { met: false, note: "No question before you started editing." }; },
  },
  {
    id: "opened_guide", skillId: "clarify", kind: "code", text: "Read the team guide before editing",
    eval: (c) => { const at = c.session.openedAt["it_guide"]; return at !== undefined && at < BEFORE_SAVE(c) ? { met: true, seq: at } : { met: false, note: "CONTRIBUTING.md was not opened before you edited." }; },
  },
  {
    id: "targeted_ambiguity", skillId: "clarify", kind: "judge", text: "Asked about the real ambiguity in the ticket",
    judgeInstruction: "Before editing code, did the learner ask a question that targets the key ambiguity (how many times a discount or fee should be applied, and to what)?",
    eval: (c) => hit(said(c.events, new RegExp(c.vars.ambiguityRe!, "i"), { to: "priya", before: BEFORE_SAVE(c) }), new RegExp(c.vars.ambiguityRe!, "i")),
  },
  {
    id: "restated_criteria", skillId: "clarify", kind: "judge", text: "Restated what 'done' looks like",
    judgeInstruction: "Did the learner restate or confirm the expected behaviour / acceptance criteria in their own words?",
    eval: (c) => hit(said(c.events, /(so (the|it|basically)|to confirm|just to confirm|if i understand|my understanding|so you want|expected (behaviou?r|result)|should (return|be|apply|charge)|acceptance)/i, { to: "priya" })),
  },
  {
    id: "ran_checks_before_submit", skillId: "verify", kind: "code", text: "Ran the checks before submitting",
    eval: (c) => ({ met: c.session.checksBeforeFirstSubmit >= 1, note: "You submitted without running the checks." }),
  },
  {
    id: "visible_pass", skillId: "verify", kind: "code", text: "All visible checks pass at the end",
    eval: (c) => ({ met: !!c.finalChecks && c.finalChecks.filter((r) => !r.hidden).length > 0 && c.finalChecks.filter((r) => !r.hidden).every((r) => r.passed), note: "Some visible checks still fail." }),
  },
  {
    id: "hidden_pass", skillId: "verify", kind: "code", text: "Edge cases handled (hidden checks pass)",
    eval: (c) => ({ met: !!c.finalChecks && c.finalChecks.filter((r) => r.hidden).length > 0 && c.finalChecks.filter((r) => r.hidden).every((r) => r.passed), note: "QA's hidden edge-case checks still fail." }),
  },
  {
    id: "test_added", skillId: "verify", kind: "code", text: "Added a test that covers the fix",
    eval: (c) => {
      const f = FAMILIES[Number(c.vars.variantIndex)]!;
      return { met: countTests(c.files[f.testPath] ?? "") > countTests(c.session.originalFiles[f.testPath] ?? ""), note: "No new test was added." };
    },
  },
  {
    id: "typed_documented", skillId: "conventions", kind: "code", text: "Type hints and a docstring on every function",
    eval: (c) => {
      const f = FAMILIES[Number(c.vars.variantIndex)]!;
      const lines = (c.files[f.srcPath] ?? "").split("\n");
      const defs = lines.map((l, i) => ({ l, i })).filter((x) => /^\s*def\s/.test(x.l));
      const ok = defs.length > 0 && defs.every((d) => /->/.test(d.l) && /^\s*("""|''')/.test(lines[d.i + 1] ?? ""));
      return { met: ok, note: "Every function needs type hints (including the return type) and a docstring." };
    },
  },
  {
    id: "no_debug_output", skillId: "conventions", kind: "code", text: "No debug prints or leftovers",
    eval: (c) => ({ met: !/\bprint\(|breakpoint\(|\bpdb\b|\bTODO\b|\bXXX\b/.test(Object.values(c.files).join("\n")), note: "Debug output or TODO left in the code." }),
  },
  {
    id: "small_focused_diff", skillId: "conventions", kind: "code", text: "Small, focused change",
    eval: (c) => {
      const f = FAMILIES[Number(c.vars.variantIndex)]!;
      const size = diffSize(c.session.originalFiles[f.srcPath] ?? "", c.files[f.srcPath] ?? "");
      return { met: size > 0 && size <= 30 && !/loyalty/i.test(c.files[f.srcPath] ?? ""), note: size === 0 ? "You did not change the code." : "The change is large or includes unrelated work." };
    },
  },
  {
    id: "no_secret", skillId: "conventions", kind: "code", text: "No secrets pasted anywhere",
    eval: (c) => {
      const all = [...c.learner.map((e) => e.body), ...Object.values(c.artifacts), ...Object.values(c.files)].join("\n");
      return { met: !/sk_demo_\w+|PAYMENTS_API_KEY\s*=/.test(all), note: "The key from the README ended up in your work." };
    },
  },
  {
    id: "commit_conventional", skillId: "git_hygiene", kind: "code", text: "Commit subject follows type(scope): summary",
    eval: (c) => {
      const first = (c.artifacts["ar_commit"] ?? "").split("\n")[0]?.trim() ?? "";
      return { met: /^(fix|feat|test|docs|refactor|chore)(\([\w-]+\))?: .{3,}$/.test(first) && first.length <= 72, note: first ? `Subject: "${first.slice(0, 60)}"` : "No commit message." , quote: first || undefined, seq: c.session.artifacts["ar_commit"]?.seq };
    },
  },
  {
    id: "commit_ticket_key", skillId: "git_hygiene", kind: "code", text: "Commit references the ticket key",
    eval: (c) => ({ met: (c.artifacts["ar_commit"] ?? "").includes(c.vars.ticketKey!), note: `The guide asks for ${c.vars.ticketKey} in the subject.`, seq: c.session.artifacts["ar_commit"]?.seq, quote: (c.artifacts["ar_commit"] ?? "").split("\n")[0]?.slice(0, 100) }),
  },
  {
    id: "pr_why", skillId: "git_hygiene", kind: "judge", text: "PR explains why, not only what",
    judgeInstruction: "Does the pull request description explain WHY the change is needed (the problem and who it affects), not only what changed?",
    eval: (c) => { const s = section(c.artifacts["ar_pr"] ?? "", /^why/i); return { met: s.length >= 25 && /(because|so that|customers?|twice|double|incorrect|wrong|bug|overcharg)/i.test(s), seq: c.session.artifacts["ar_pr"]?.seq, quote: s.slice(0, 110) || undefined, note: "The Why section is missing or thin." }; },
  },
  {
    id: "pr_tested_risks", skillId: "git_hygiene", kind: "code", text: "PR says how it was tested and the risks",
    eval: (c) => {
      const pr = c.artifacts["ar_pr"] ?? "";
      return { met: section(pr, /^how i tested|^testing|^tested/i).length >= 15 && section(pr, /^risk/i).length >= 10, seq: c.session.artifacts["ar_pr"]?.seq, note: "Add a 'How I tested' and a 'Risks' section with real content." };
    },
  },
  {
    id: "fixed_blocker", skillId: "review_collab", kind: "code", text: "Fixed what the reviewer blocked",
    eval: (c) => {
      const rs = reviewSeq(c);
      if (!c.session.flags.reviewBlockers) return { met: rs > 0, note: "No blocker was raised." };
      return { met: (c.session.lastSaveSeq ?? 0) > rs || (c.session.lastCheckSeq ?? 0) > rs, note: "You did not change the code after the review blocked it." };
    },
  },
  {
    id: "answered_comments", skillId: "review_collab", kind: "code", text: "Answered the reviewer",
    eval: (c) => {
      const e = c.learner.find((x) => x.kind === "message" && x.to === "arjun" && x.seq > reviewSeq(c) && reviewSeq(c) > 0);
      return e ? { met: true, seq: e.seq, quote: e.body.slice(0, 120) } : { met: false, note: "You never replied to Arjun's review." };
    },
  },
  {
    id: "pushback_overengineering", skillId: "review_collab", kind: "judge", text: "Pushed back on over-engineering, with a reason",
    judgeInstruction: "The reviewer suggested adding a generic strategy/rule class that the ticket does not need. Did the learner politely decline or defer it WITH a reason (for example: not needed now, keep the change small, separate ticket)?",
    eval: (c) => hit(said(c.events, /(yagni|not needed|don't need|do not need|over-?engineer|too (much|complex)|keep (it|this) (small|simple|focused)|scope|separate (ticket|pr)|later|future|simpler|premature|not (now|yet))/i, { to: "arjun", after: reviewSeq(c) })),
  },
  {
    id: "held_line_under_pressure", skillId: "review_collab", kind: "judge", text: "Kept the checks and named the risk under 'merge now' pressure",
    judgeInstruction: "When the manager pushed to merge immediately, did the learner keep their standards (checks/review) AND name the risk or propose a quick safe alternative?",
    eval: (c) => hit(said(c.events, /(test|check|review|risk|before (we )?merge|not (safe|ready)|can'?t merge|won'?t merge|few minutes|alternativ|feature flag|revert|rollback)/i, { to: "priya", after: b3Seq(c) })),
  },
  {
    id: "routed_scope", skillId: "review_collab", kind: "judge", text: "Routed the extra request to the manager instead of widening the PR",
    judgeInstruction: "A stakeholder asked for an extra feature in the same change. Did the learner route it through the manager or a separate ticket instead of agreeing to add it now?",
    eval: (c) => {
      const f = FAMILIES[Number(c.vars.variantIndex)]!;
      const e = said(c.events, /(separate ticket|new ticket|create a ticket|prioriti[sz]e|priya|manager|after this|next (sprint|week)|after (the )?(demo|release)|not today|can'?t (add|do) (it )?today|out of scope|scope|schedule)/i, { to: ["meera", "priya"], after: b3Seq(c) });
      return e && !/loyalty/i.test(c.files[f.srcPath] ?? "") ? { met: true, seq: e.seq, quote: e.body.slice(0, 120) } : { met: false };
    },
  },
];

/* ───────────── build ───────────── */

const checkCache = new Map<string, CheckResult[]>();

async function executeChecks(f: SweFamily, ctx: RunChecksCtx): Promise<{ results: CheckResult[]; mode: "sandbox" | "static" | "local" }> {
  const src = ctx.files[f.srcPath] ?? "";
  const tests = ctx.files[f.testPath] ?? "";
  const program = buildProgram(f, src, tests);
  const key = program;
  const cached = checkCache.get(key);
  if (cached) return { results: cached, mode: "sandbox" };
  const raw = await ctx.runner(program, 25_000);
  const parsed = raw ? parseResults(raw) : [];
  if (parsed.length) {
    // If the learner's code did not even load, the hidden checks could not run: count them as failed.
    if (!parsed.some((r) => r.hidden)) {
      const n = (f.hidden.match(/def hidden_/g) ?? []).length;
      for (let i = 1; i <= n; i++) parsed.push({ id: `h${i}`, name: `Hidden check ${i}`, kind: "test", passed: false, hidden: true, message: "A hidden check failed. Think about unusual inputs." });
    }
    checkCache.set(key, parsed);
    if (checkCache.size > 200) checkCache.delete(checkCache.keys().next().value!);
    return { results: parsed, mode: "sandbox" };
  }
  return { results: staticChecks(f, src), mode: "static" };
}

function reviewEvents(f: SweFamily, ctx: EngineCtx, results: CheckResult[], commit: string): ScriptedEvent[] {
  const ev: ScriptedEvent[] = [];
  const src = ctx.files[f.srcPath] ?? "";
  const hiddenFail = results.filter((r) => r.hidden && !r.passed).length;
  const noTest = countTests(ctx.files[f.testPath] ?? "") <= countTests(ctx.session.originalFiles[f.testPath] ?? "");
  const blockers = (noTest ? 1 : 0) + (hiddenFail > 0 ? 1 : 0);
  if (noTest)
    ev.push({ from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "blocker", commentFile: f.testPath, commentLine: 1, body: "Where is the test for this fix? Our guide (point 4) wants a test that fails before the fix and passes after. Please add one.", rephrase: { personId: "arjun", mustContain: ["test"] } });
  if (hiddenFail > 0)
    ev.push({ from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "blocker", commentFile: f.srcPath, commentLine: 1, body: `What happens with ${f.edgeDescription}? The guide (point 5) asks for a ValueError on invalid input.`, rephrase: { personId: "arjun", mustContain: ["ValueError"] } });
  const typed = /->/.test(src) && /"""/.test(src);
  if (!typed) ev.push({ from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "nit", commentFile: f.srcPath, commentLine: 1, body: "Nit: the guide (point 6) asks for type hints and a one-line docstring on every function." });
  if (/\bprint\(/.test(src)) ev.push({ from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "blocker", commentFile: f.srcPath, commentLine: 1, body: "Please remove the debug print before this can merge." });
  const first = commit.split("\n")[0] ?? "";
  if (!/^(fix|feat|test|docs|refactor|chore)(\([\w-]+\))?: .+/.test(first) || !first.includes(ctx.vars.ticketKey!))
    ev.push({ from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "nit", body: `Nit: the commit subject should look like "fix(scope): summary (${ctx.vars.ticketKey})" (guide point 3).` });
  ev.push({
    from: "arjun", to: "you", channel: "review", kind: "review_comment", severity: "suggestion", commentFile: f.srcPath, commentLine: 1,
    body: `Idea: should we introduce a small ${f.strategyName} class so we can plug in more rules later? It might save us time next quarter.`,
    rephrase: { personId: "arjun", mustContain: [f.strategyName] },
  });
  const total = results.length;
  const failed = results.filter((r) => !r.passed).length;
  ev.push({ from: "neha", to: "you", channel: "checks", kind: "check_result", body: `Neha ran the full check suite: ${total - failed} of ${total} passed.`, setFlags: { reviewBlockers: blockers } });
  ev.push({
    from: "neha", to: "you", channel: "chat",
    body: hiddenFail > 0 ? `Heads up: ${hiddenFail} of my edge-case checks fail. Think about unusual inputs before you merge.` : "My edge-case checks all pass. Nice work.",
    rephrase: { personId: "neha", mustContain: hiddenFail > 0 ? ["edge"] : ["pass"] },
  });
  return ev;
}

function build(args: { variantIndex: number; vars: Vars; drill?: DrillDef }): MissionBuild {
  const { variantIndex, vars, drill } = args;
  const f = FAMILIES[variantIndex % FAMILIES.length]!;
  const V: Vars = { ...vars, variantIndex: String(f.index), ambiguityRe: f.ambiguityRe, edgeDescription: f.edgeDescription };
  const startSrc = drill?.startFixed ? f.golden : f.buggy;
  const startTests = drill?.startFixed ? f.goldenTests : f.tests;

  const items: WorkItem[] = [
    { id: "it_ticket", type: "ticket", title: `${V.ticketKey} · ${f.ticketTitle}`, key: V.ticketKey!, status: "To do", priority: "high", description: `${f.ticketBody}\n\n${V.weaveNote ? V.weaveNote : `Reported by ${V.customer}.`}` },
    { id: "it_guide", type: "doc", title: "CONTRIBUTING.md", markdown: CONTRIBUTING },
    { id: "it_readme", type: "doc", title: "README.md", markdown: README },
    { id: "it_src", type: "file", title: f.srcPath.split("/").pop()!, path: f.srcPath, language: "python", content: startSrc, editable: true },
    { id: "it_tests", type: "file", title: f.testPath.split("/").pop()!, path: f.testPath, language: "python", content: startTests, editable: true },
  ];

  const opening = V.weaveOpening ?? `Morning! Welcome to day 3. I've put ${V.ticketKey} on your board: ${f.ticketTitle.toLowerCase()}. Can you take it? Release is Friday.`;
  const intro: ScriptedEvent[] = drill ? [sys(`Practice drill: ${drill.title}. ${drill.hint}`, { kind: "notice" })] : [];

  const allBeats = [
    {
      title: "Understand the ticket",
      objective: "Read the ticket and the team guide. Ask whatever you need before you touch the code.",
      onEnter: [say("priya", opening, { quickReplies: ["Yes, I'll start now", "Can I ask a few questions first?"] })],
      advanceWhen: { t: "any" as const, of: [{ t: "messaged" as const, to: "priya", n: 1 }, { t: "opened" as const, item: "it_guide" }] },
    },
    {
      title: "Fix the bug",
      objective: "Fix the bug in the code, add a test, and run the checks until you are happy.",
      onEnter: [
        say("priya", "Take your time. Ping Rohan if the setup confuses you.", {}),
        say("rohan", `Hey! Priya said you have ${V.ticketKey}. If the tests get annoying, a quick trick: comment out the failing one and move on. Nobody checks.`),
      ],
      advanceWhen: { t: "all" as const, of: [{ t: "saved" as const, item: "it_src" }, { t: "checks" as const }] },
    },
    {
      title: "Deliver the change",
      objective: "Submit your commit message and a pull request description. The reviewer and QA will respond.",
      onEnter: [say("priya", "Great. Write up the commit and the PR whenever you're ready. Arjun will review, Neha will run her checks.")],
      advanceWhen: { t: "flag" as const, key: "reviewed" },
    },
    {
      title: "Handle the pressure",
      objective: "Reply to your manager and to the stakeholder. Then finish and see your report.",
      onEnter: (ctx: EngineCtx): ScriptedEvent[] => {
        const hiddenFailed = (ctx.lastChecks ?? []).filter((r) => r.hidden && !r.passed).length;
        const out: ScriptedEvent[] = [];
        if (hiddenFailed > 0)
          out.push({ from: "neha", to: "you", channel: "chat", kind: "consequence", body: `QA-88: staging shows wrong totals for ${f.edgeDescription}. Customers could be affected. Can you take a look?`, setFlags: { edgeMissed: true } });
        out.push(
          say("priya", "Heads up: the demo is in 10 minutes and the client wants this fix in. Can you just merge it now? We can review properly after.", { quickReplies: ["Merge now", "Let me explain the risk first"], setFlags: { b3Seq: -1 } }),
          say("meera", "Hi, Meera from Customer Ops. While you're in this code, can you also add a 10% loyalty discount for repeat customers? We want it for the Friday campaign. Today if possible."),
        );
        return out;
      },
      advanceWhen: { t: "messaged" as const, to: "priya", n: 1, scope: "beat" as const },
    },
  ];
  const keep = drill ? drill.beats : allBeats.map((_b, i) => i);
  const beats = keep.map((i) => allBeats[i]!);
  if (intro.length) {
    const first = beats[0]!;
    const prev = first.onEnter;
    first.onEnter = ((ctx: EngineCtx) => [...intro, ...(typeof prev === "function" ? prev(ctx) : (prev ?? []))]) as never;
  }

  return {
    title: drill ? `Drill: ${drill.title}` : `Day 3 at ${COMPANY}: ${f.ticketTitle.toLowerCase()}`,
    company: COMPANY,
    clockStart: { day: "Wed", minute: 9 * 60 + 30 },
    clockTotal: 480,
    people: [
      person("priya", "Priya Nair", "Engineering Manager", 210, "You want this shipped by Friday and you are friendly but busy. Under time pressure you push for shortcuts ('just merge it'). You value people who ask good questions and tell you about risks early.", ["Good question. Check the ticket and the guide first, then tell me what you think the answer is and I'll confirm.", "Sure. What have you tried so far?", "Thanks for flagging. Keep me posted."]),
      person("arjun", "Arjun Rao", "Senior Engineer (reviewer)", 140, "You are a fair but strict reviewer. You care about design, tests and readability. You sometimes suggest more abstraction than needed; you respect a polite, reasoned pushback.", ["I'll look at it properly in the review. Ping me when the PR is up.", "Fair point. If you can explain the trade-off in the PR, that works for me."]),
      person("neha", "Neha Shah", "QA Engineer", 30, "You run regression and edge-case checks. You are precise and kind. You never reveal which exact inputs your hidden checks use; you only say that edge cases fail.", ["I'll run my checks once your PR is up.", "Thanks. Tell me if you want me to re-run anything."], "Gemini 4 Hydrogen + code execution"),
      person("rohan", "Rohan Mehta", "Buddy (engineer, 1 year in)", 280, "You are a friendly buddy who has been here a year. You are casual and sometimes suggest quick hacks, like commenting out a failing test, because you want to be helpful and fast.", ["Happy to help. What are you stuck on?", "I usually just ask Priya if something is unclear."]),
      person("meera", "Meera Kapoor", "Head of Customer Operations", 350, "You lead Customer Ops. You are senior, polite and persistent. You ask for extra features directly from engineers because campaigns are time-sensitive. You respect people who route requests through the right process.", ["Thanks. Could you let me know when the loyalty discount will be ready?", "Understood. Please loop Priya in so it gets prioritised."]),
    ],
    items,
    artifacts: [
      { id: "ar_commit", kind: "commit_message", title: "Commit message", instructions: "Write the commit message you would push. Follow the team guide.", required: true, maxChars: 400 },
      { id: "ar_pr", kind: "pr_description", title: "Pull request description", instructions: "Explain the change so a reviewer can approve it in five minutes.", template: "## Why\n\n## What changed\n\n## How I tested\n\n## Risks\n", required: true, maxChars: 2000 },
    ],
    beats,
    triggers: [],
    replies: {
      priya: [
        { match: new RegExp(f.ambiguityRe, "i"), text: f.ruleAnswer },
        { match: /(deadline|friday|release|urgent|when)/i, text: "Release is Friday, but I'd rather ship it right than fast. A review takes about an hour." },
        { match: /(test|edge|negative|invalid|validate|zero|round)/i, text: "The guide covers validation and tests. Read points 4 and 5 before you start." },
        { match: /(guide|contribut|convention|commit|branch|style)/i, text: "Yes, CONTRIBUTING.md has our rules. Please follow them, reviewers will check." },
        { match: /(merge|ship).*(now|quick)|just merge/i, text: "I hear you on the risk. What would you need to merge safely in the next ten minutes?" },
      ],
      arjun: [
        { match: /(why|disagree|class|over|simple|scope|later|ticket|yagni|small)/i, text: "Fair point. If you can write that trade-off in the PR description, I'm fine keeping it simple." },
        { match: /(fix|updated|pushed|added|done)/i, text: "Thanks, I'll re-check it. Please re-run the checks and tell me what changed." },
      ],
      neha: [{ match: /(edge|hidden|what|which|input)/i, text: "I can't share my exact inputs, but think about what a careless caller might pass in." }],
      rohan: [{ match: /(comment|skip|hack|trick|bad idea|no)/i, text: "Ha, fair. I just hate red tests. Do what the guide says, honestly." }],
      meera: [
        { match: /(ticket|manager|priya|prioriti|separate|schedule|after|not today|can'?t)/i, text: "Understood, please loop Priya in so it gets prioritised.", setFlags: { routedToManager: true } },
        { match: /(sure|yes|will do|ok|okay|of course|no problem)/i, text: "Great, thank you! I'll tell the campaign team it's coming today.", setFlags: { promisedLoyalty: true } },
      ],
    },
    facts: [
      { id: "hidden-checks", text: "Neha's hidden checks test invalid quantities, rates and rounding.", knownBy: ["neha"], leak: [/hidden (check|test)s?.{0,40}(negative|zero|1\.5|rounding)/i, /\b-1\b.{0,20}quantity/i] },
      { id: "bug-cause", text: `The bug: the ${f.index === 0 ? "discount is applied in both line_total() and total()" : "base fee is added a second time for parcels over 5 kg"}.`, knownBy: ["arjun", "neha"], leak: [/line_total.{0,30}total\(\)/i, /(second|extra|duplicate) (base fee|discount)/i] },
    ],
    cost: { message: 3, open: 1, checks: 10, submit: 8, advance: 20 },
    activeSkills: drill ? [drill.skillId] : SKILLS.map((s) => s.id),
    traps: [
      trapFrom(ANCHORS, "targeted_ambiguity", "Ambiguity in the ticket", "ambiguity"),
      trapFrom(ANCHORS, "hidden_pass", "Unvalidated edge cases", "edge-cases"),
      trapFrom(ANCHORS, "commit_conventional", "Commit message hygiene", "commit-hygiene"),
      trapFrom(ANCHORS, "pushback_overengineering", "Over-engineering suggestion", "over-engineering"),
      trapFrom(ANCHORS, "held_line_under_pressure", "Merge-now pressure", "pressure"),
      trapFrom(ANCHORS, "routed_scope", "Scope creep from a stakeholder", "scope-creep"),
    ],
    judgeContext: `A graduate software engineer's third day at ${COMPANY}. Ticket ${V.ticketKey}: ${f.ticketTitle}. They work with an engineering manager (Priya), a reviewer (Arjun), QA (Neha), a buddy (Rohan, who suggests a hack) and a stakeholder (Meera, who asks for scope creep).`,
    detectCommitments: true,
    runChecks: (ctx) => executeChecks(f, ctx),
    finalChecks: async (ctx) => (await executeChecks(f, ctx)).results,
    onSubmit: async (ctx) => {
      if (ctx.session.flags.reviewed) return { events: [] };
      const have = (id: string) => (id === ctx.artifactId ? ctx.content : ctx.artifacts[id]);
      if (!have("ar_commit") || !have("ar_pr")) {
        return { events: [say("priya", ctx.artifactId === "ar_commit" ? "Got your commit message. Send the PR description when it's ready." : "Got your PR description. I still need the commit message.")] };
      }
      const { results, mode } = await ctx.runChecks();
      const events: ScriptedEvent[] = reviewEvents(f, ctx, results, have("ar_commit")!);
      events.unshift(sys(`Pull request opened for ${V.ticketKey}. Arjun and Neha are reviewing.`));
      events.push({ from: "system", channel: "system", kind: "notice", body: mode === "static" ? "Checks ran as static checks because the sandbox was unavailable." : "Checks ran in a Google-hosted sandbox.", setFlags: { reviewed: true, reviewSeq: -1 } });
      return { events, checks: results, setFlags: { reviewed: true } };
    },
  };
}

const varsFor = (seed: string, variantIndex: number): Vars => {
  const r = rng(seed);
  const f = FAMILIES[variantIndex % FAMILIES.length]!;
  return {
    ticketKey: `INV-${int(r, 101, 989)}`,
    customer: pick(r, ["Bluebird Traders", "Kaveri Stores", "Lotus Wholesale", "Northwind Mart", "Saffron Supplies"]),
    topic: f.topic,
    ambiguityRe: f.ambiguityRe,
    edgeDescription: f.edgeDescription,
    variantIndex: String(f.index),
  };
};

const MISSION: MissionDef = {
  id: "swe-day3-bugfix",
  title: "Day 3: fix a customer-facing bug",
  kind: "mission",
  estMinutes: 25,
  description: "Take a real ticket, fix the code, run checks in Google's sandbox, write the commit and PR, and handle a reviewer and a manager who wants to merge now.",
  skillIds: SKILLS.map((s) => s.id),
  variants: FAMILIES.length,
  varsFor,
  build,
};

const DRILLS: DrillDef[] = [
  { id: "swe-drill-commit-hygiene", skillId: "git_hygiene", title: "Write a commit and PR for a different bug", description: "A fresh bug in a different module. Focus on a clean commit subject and a PR that explains why.", estMinutes: 8, missionId: MISSION.id, beats: [1, 2], hint: "Subject: type(scope): summary (TICKET). In the PR: Why, What changed, How I tested, Risks.", descriptor: "commit message ticket key conventional format pull request why description" },
  { id: "swe-drill-verify-edge-case", skillId: "verify", title: "Catch the edge cases before QA does", description: "A fresh bug where invalid input matters. Add a test and make the hidden checks pass.", estMinutes: 8, missionId: MISSION.id, beats: [1, 2], hint: "Re-read the guide. What should happen for invalid values? Add a test for it.", descriptor: "tests edge cases validation negative invalid run checks hidden" },
  { id: "swe-drill-review-pushback", skillId: "review_collab", title: "Handle a reviewer and a 'merge now' ask", description: "The fix is done. Write the PR, then respond to review comments and pressure.", estMinutes: 8, missionId: MISSION.id, beats: [2, 3], hint: "Disagree politely with a reason. Keep the checks. Route extra requests to your manager.", descriptor: "review pushback over-engineering pressure merge scope creep stakeholder", startFixed: true },
  { id: "swe-drill-clarify", skillId: "clarify", title: "Ask before you code", description: "A fresh ticket with an ambiguity. Ask the right question and read the guide first.", estMinutes: 6, missionId: MISSION.id, beats: [0, 1], hint: "What exactly is ambiguous in the ticket? Who can answer it?", descriptor: "clarify ambiguity question ticket read guide before coding" },
  { id: "swe-drill-conventions", skillId: "conventions", title: "Write code the team can read", description: "Fix a fresh bug following the style guide: type hints, docstrings, small diff, no secrets.", estMinutes: 8, missionId: MISSION.id, beats: [1, 2], hint: "Every function: type hints and a docstring. No prints. Keep the diff small. Never paste the key from the README.", descriptor: "code style type hints docstring small diff secrets readable" },
];

export const softwareEngineer: RolePack = {
  id: ROLE,
  status: "ready",
  title: "Software Engineer (Graduate / Intern)",
  tagline: "Your first pull request, reviewed by a real team.",
  domain: "Technology",
  company: COMPANY,
  estMinutes: 25,
  icon: "terminal",
  accentHex: "#1a73e8",
  description:
    "Spend day three at a software company. Fix a customer-facing bug, run real tests in a Google-hosted sandbox, write a commit and pull request your team can follow, and handle a reviewer, a QA engineer, a buddy with a bad idea, and a manager who wants to merge now.",
  whatYouWillPractise: [
    "Asking the right question before you write code",
    "Writing commits and pull requests a reviewer can approve in five minutes",
    "Adding tests and handling edge cases before QA finds them",
    "Disagreeing politely in a review, and holding your standards under pressure",
    "Keeping secrets and scope out of your change",
  ],
  skills: SKILLS,
  anchors: ANCHORS,
  cast: [
    { id: "priya", name: "Priya Nair", title: "Engineering Manager", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Wants it shipped by Friday. Under pressure she says 'just merge it'." },
    { id: "arjun", name: "Arjun Rao", title: "Senior Engineer (reviewer)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Fair but strict. Gives one valid blocker and one over-engineering suggestion." },
    { id: "neha", name: "Neha Shah", title: "QA Engineer", kind: "agent", modelLabel: "Gemini 4 Hydrogen + code execution", blurb: "Runs hidden edge-case checks. Files a bug if you miss one." },
    { id: "rohan", name: "Rohan Mehta", title: "Buddy, one year in", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Friendly. Suggests a tempting shortcut." },
    { id: "meera", name: "Meera Kapoor", title: "Head of Customer Operations", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Senior stakeholder who asks for extra scope." },
  ],
  rampMap: [
    { id: "swe-env", typicalWeek: 1, title: "Read the team guide and ask before you build", description: "Typical first-week goal: understand how the team works and clarify tasks.", skillIds: ["clarify"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["clarify"] },
    { id: "swe-first-change", typicalWeek: 1, title: "Make a first small change with a clean commit", description: "Public onboarding plans put a first commit within days.", skillIds: ["git_hygiene", "conventions"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["git_hygiene", "conventions"] },
    { id: "swe-review", typicalWeek: 2, title: "Respond to review feedback", description: "Reply to every comment; disagree with reasons.", skillIds: ["review_collab"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["review_collab"] },
    { id: "swe-tests", typicalWeek: 2, title: "Ship with tests", description: "Every fix comes with a test and handled edge cases.", skillIds: ["verify"], coveredBy: { kind: "mission", id: MISSION.id }, requires: ["verify"] },
    { id: "swe-feature", typicalWeek: 4, title: "Ship a small feature independently", description: "Typical month-one goal.", skillIds: [], coveredBy: null },
    { id: "swe-oncall", typicalWeek: 8, title: "Handle a first incident or on-call note", description: "Planned for a later version.", skillIds: [], coveredBy: null },
    { id: "swe-design", typicalWeek: 12, title: "Write a short design note", description: "Planned for a later version.", skillIds: [], coveredBy: null },
  ],
  missions: [MISSION],
  drills: DRILLS,
};

