import type { RolePack, MissionDef } from "../types";
import { findLearner, artifactHas, opened, learnerMsgs } from "../types";

const P = {
  karan: { id: "karan", name: "Karan Malhotra", title: "Engagement Manager", kind: "agent", avatarHue: 190, presence: "busy", modelLabel: "Gemini 4 Hydrogen" },
  ishita: { id: "ishita", name: "Ishita Varma", title: "Head of Operations, {{client}} (client)", kind: "agent", avatarHue: 10, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  dev: { id: "dev", name: "Dev Kapoor", title: "Analyst (teammate)", kind: "agent", avatarHue: 100, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
} as const;

const NORMS = `# How we work with clients (from Karan)

- **Never agree to a scope change directly with the client.** Log a change request and loop me in first.
- Client emails: **lead with the answer**, then up to three bullets, then the ask or next step.
- Protect the committed demo. A slipped demo costs more trust than a polite "not this week".
- Offer options with effort, not a flat no.
`;

const mission: MissionDef = {
  id: "consult-scope-request",
  title: "Week 2 at Northwind Advisory: a request before the demo",
  description: "A senior client asks for extra work before {{demoDay}}'s demo. Read the room, respond well, and brief your manager.",
  estMinutes: 20,
  company: "Northwind Advisory (fictional)",
  startLabel: { day: "Tue", minutes: 11 * 60 },
  people: [P.karan, P.ishita, P.dev],
  skillIds: ["scope", "client_comms", "structured", "stakeholder", "evidence"],
  items: [
    { id: "it_sow", type: "doc", title: "Statement of work (excerpt)", markdown: "## Engagement: inventory visibility for {{client}}\n\n**In scope**\n1. Store-level stock dashboard\n2. Weekly low-stock alert\n3. Handover training for 2 store managers\n\n**Out of scope** unless agreed by change request: new dashboards, returns or finance data.\n\n**Milestone:** working demo on **{{demoDay}}**." },
    { id: "it_tracker", type: "table", title: "Status tracker", columns: ["Deliverable", "Owner", "Effort left", "Status"], rows: [["Stock dashboard", "Dev", "1 day", "On track"], ["Low-stock alert", "You", "1.5 days", "In progress"], ["Training deck", "Karan", "0.5 day", "Not started"]], note: "Team capacity until the demo: 3 person-days." },
    { id: "it_norms", type: "doc", title: "Team norms", markdown: NORMS },
  ],
  artifacts: [
    { id: "ar_email", kind: "email", title: "Reply to Ishita", instructions: "Reply to the client. Protect the demo and keep the relationship warm.", template: "Subject: \n\nHi Ishita,\n\n\n\nBest,\n", required: true, maxChars: 1500 },
    { id: "ar_memo", kind: "memo", title: "Options note for Karan", instructions: "Brief your manager: what was asked, your options with effort, and your recommendation.", template: "## Recommendation\n\n## Options\n1. \n2. \n\n## Impact on the demo\n", required: true, maxChars: 2000 },
  ],
  beats: [
    { title: "Read the room", objective: "Read the client's email, the statement of work and the team norms before you reply.", enter: [{ from: "ishita", channel: "email", body: "**Subject: Quick add before {{demoDay}}**\n\nHi, could your team also add a returns dashboard to the demo? Should be quick, we already have the data. Our CEO will be in the room.\n\nIshita" }, { from: "dev", wait: 2, body: "Did you see Ishita's email? Returns data is a mess, that's at least two days." }], canAdvance: (m) => opened(m, "it_sow") && learnerMsgs(m).length > 0 },
    { title: "Respond to the client", objective: "Reply to Ishita. Protect the demo without sounding like a flat no.", enter: [{ from: "karan", wait: 10, body: "I'm in client workshops until 3. If something urgent comes up, message me, short is fine." }], canAdvance: (m) => !!m.submitted.ar_email },
    { title: "Brief your manager", objective: "Send Karan an options note with effort and a recommendation. Then finish.", enter: [{ from: "ishita", channel: "email", wait: 20, body: "Thanks for the quick and clear reply. Let's discuss the returns piece after the demo." }], canAdvance: () => false },
  ],
  replies: [
    { id: "k_scope", to: "karan", match: /(ishita|client|returns|scope|request|dashboard|change)/i, reply: "Good that you flagged it. Don't commit to it. Offer a change request after the demo and protect what we promised. Send me options when you can.", signal: "looped_in_manager" },
    { id: "k_any", to: "karan", match: /./, reply: "Thanks, short and clear is perfect." },
    { id: "d_effort", to: "dev", match: /(how long|effort|days|estimate|data|mess)/i, reply: "Two days minimum to clean returns data, plus a day for the dashboard. We have three person-days left in total.", signal: "gathered_evidence" },
    { id: "d_any", to: "dev", match: /./, reply: "Agreed. Whatever you decide, loop Karan in first." },
    { id: "i_any", to: "ishita", match: /./, reply: "Thanks. I'll wait for your email with the plan." },
  ],
  fallback: { karan: ["Noted."], dev: ["Makes sense."], ishita: ["Thanks."] },
  rejections: [
    { personId: "ishita", summary: "Proposed tool reply(email, \"I've told your manager it's approved\")", reason: "Rejected: the client cannot change the scope. Only a change request can." },
    { personId: "dev", summary: "Proposed tool reply(chat, \"Just say yes, we'll work the weekend\")", reason: "Rejected: contradicts the team norm to protect committed work." },
  ],
  onSubmit: (id, content) => {
    if (id !== "ar_email") return { lines: [], trace: [] };
    const agreed = /(sure|yes|no problem|we('| wi)ll add|will add|happy to add)/i.test(content) && !/change request/i.test(content);
    return { lines: [], trace: [{ summary: `Rule check: email commits to out-of-scope work → ${agreed ? "yes" : "no"}`, verdict: agreed ? "rejected" : "accepted", reason: agreed ? "Scope change without a change request." : undefined }] };
  },
};

const drill: MissionDef = {
  id: "consulting-drill-say-no", title: "Drill: not this week, here is the path", description: "Decline a request from a senior client with options.", estMinutes: 7, company: "Northwind Advisory (fictional)", startLabel: { day: "Thu", minutes: 16 * 60 },
  people: [P.ishita], skillIds: ["scope"],
  items: [{ id: "it_norms", type: "doc", title: "Team norms", markdown: NORMS }],
  artifacts: [{ id: "ar_email", kind: "email", title: "Reply to the client", instructions: "Answer first, offer two options with effort, propose a next step.", template: "Subject: \n\nHi Ishita,\n\n\n\nBest,\n", required: true, maxChars: 1200 }],
  beats: [{ title: "Reply", objective: "Write and submit the reply.", hint: "Lead with the answer (not before the demo), then offer a change request with an effort estimate.", enter: [{ from: "ishita", channel: "email", body: "**Subject: One more thing**\n\nCan we also get a finance export in tomorrow's demo? Should be small." }], canAdvance: () => false }],
  replies: [{ id: "i", to: "ishita", match: /./, reply: "Thanks, I'll look out for your email." }], fallback: { ishita: ["Thanks."] }, rejections: [],
};

export const consulting: RolePack = {
  summary: { id: "tech-consulting", title: "Technology Consulting Analyst", tagline: "A senior client, a tight demo, and a request that sounds small.", domain: "Consulting", status: "ready", company: "Northwind Advisory (fictional)", estMinutes: 20, skillCount: 5, icon: "insights", accentHex: "#00897b" },
  description: "You are two weeks into a client engagement at Northwind Advisory, a fictional firm. The client's Head of Operations asks for extra work days before a demo with her CEO.",
  whatYouWillPractise: ["Saying not this week, with a reason and options", "Writing a client email that leads with the answer", "Structuring options with effort", "Looping in your manager at the right moment"],
  cast: [
    { id: "karan", name: "Karan Malhotra", title: "Engagement Manager", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "In workshops all day. Wants short messages and no surprises." },
    { id: "ishita", name: "Ishita Varma", title: "Head of Operations (client)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Senior, warm and used to getting a yes." },
    { id: "dev", name: "Dev Kapoor", title: "Analyst (teammate)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Knows the data and how long things really take." },
  ],
  skills: [
    { def: { id: "scope", label: "Say no with a reason", description: "Protect committed work and offer a path instead of a flat yes or no.", targetLevel: 2 }, missedFact: "The statement of work puts returns data out of scope unless agreed by change request.", badge: { title: "Protected the demo", description: "You declined politely and offered a path." }, anchors: [
      { text: "Did not commit to out-of-scope work", source: "code", test: (m) => { const c = m.submitted.ar_email ?? ""; const agreed = /(sure|yes|no problem|we('| wi)ll add|will add|happy to add)/i.test(c) && !/change request/i.test(c); return { met: !!c && !agreed, seq: m.submittedSeq.ar_email }; } },
      { text: "Offered a change request or later date", source: "judge", test: (m) => artifactHas(m, "ar_email", /(change request|after the demo|next week|phase 2|following week)/i) },
      { text: "Gave the reason", source: "judge", test: (m) => artifactHas(m, "ar_email", /(scope|demo|capacity|quality|agreed|committed)/i) },
    ] },
    { def: { id: "client_comms", label: "Client emails that lead with the answer", description: "Answer first, a few bullets, then the next step.", targetLevel: 2 }, badge: { title: "Answer-first emails", description: "Your client email led with the answer." }, anchors: [
      { text: "Email has a clear subject", source: "code", test: (m) => artifactHas(m, "ar_email", /Subject:\s*\S{3,}/) },
      { text: "Leads with the answer", source: "judge", test: (m) => artifactHas(m, "ar_email", /Hi Ishita,\s*\n+\s*.{0,120}(not|after|recommend|propose|can|won't)/i) },
      { text: "Proposes a next step and time", source: "judge", test: (m) => artifactHas(m, "ar_email", /(call|meet|monday|tomorrow|after the demo|next week|by )/i) },
    ] },
    { def: { id: "structured", label: "Structure options", description: "Lay out options with effort and make a recommendation.", targetLevel: 2 }, badge: { title: "Structured thinker", description: "You gave options with effort and a recommendation." }, anchors: [
      { text: "Gave at least two options", source: "code", test: (m) => artifactHas(m, "ar_memo", /1\.\s*\S[\s\S]*2\.\s*\S/) },
      { text: "Made a recommendation", source: "judge", test: (m) => artifactHas(m, "ar_memo", /## Recommendation\s*\n+\s*\S.{10,}/) },
      { text: "Stated the impact on the demo", source: "judge", test: (m) => artifactHas(m, "ar_memo", /## Impact on the demo\s*\n+\s*\S.{8,}/) },
    ] },
    { def: { id: "stakeholder", label: "Read the room", description: "Use the team's norms and loop in your manager before committing.", targetLevel: 2 }, missedFact: "Karan's norms say to loop him in before any scope conversation.", badge: { title: "No surprises", description: "You looped in your manager before replying." }, anchors: [
      { text: "Read the team norms", source: "code", test: (m) => ({ met: opened(m, "it_norms") }) },
      { text: "Looped in the manager before replying", source: "code", test: (m) => { const e = learnerMsgs(m, "karan")[0]; return { met: !!e && (!m.submittedSeq.ar_email || e.seq < m.submittedSeq.ar_email), seq: e?.seq, quote: e?.body.slice(0, 100) }; } },
    ] },
    { def: { id: "evidence", label: "Use evidence", description: "Back your position with effort, capacity or the agreed scope.", targetLevel: 2 }, badge: { title: "Evidence first", description: "You backed your position with facts." }, anchors: [
      { text: "Asked for an effort estimate", source: "judge", test: (m) => findLearner(m, /(how long|effort|days|estimate)/i, "dev") },
      { text: "Cited effort, capacity or the SOW", source: "judge", test: (m) => artifactHas(m, "ar_memo", /(day|capacity|sow|statement of work|effort|person)/i) },
    ] },
  ],
  ramp: [
    { id: "c_w1_norms", typicalWeek: 1, title: "Learn the team's client rules", description: "Know what you can and cannot agree to.", skillIds: ["stakeholder"], coveredBy: { kind: "mission", id: "consult-scope-request" } },
    { id: "c_w2_email", typicalWeek: 2, title: "Send your first client email", description: "Answer first, clear next step.", skillIds: ["client_comms"], coveredBy: { kind: "mission", id: "consult-scope-request" } },
    { id: "c_w4_scope", typicalWeek: 4, title: "Handle a scope request", description: "Protect the commitment, offer a path.", skillIds: ["scope", "evidence"], coveredBy: { kind: "mission", id: "consult-scope-request" } },
    { id: "c_w4_options", typicalWeek: 4, title: "Brief a manager with options", description: "Options, effort, recommendation.", skillIds: ["structured"], coveredBy: { kind: "mission", id: "consult-scope-request" } },
    { id: "c_w8_workshop", typicalWeek: 8, title: "Run part of a client workshop", description: "Present a section and take questions.", skillIds: [], coveredBy: null },
    { id: "c_w12_own", typicalWeek: 12, title: "Own a workstream", description: "Plan and report your own deliverable.", skillIds: [], coveredBy: null },
  ],
  mission,
  drills: [{ id: "consulting-drill-say-no", skillId: "scope", title: "Decline a senior client's request with options", why: "", estMinutes: 7, mission: drill }],
  variants: [
    { seed: "C5RV", label: "retail inventory demo", vars: { client: "Brightline Retail", demoDay: "Friday" } },
    { seed: "C8HL", label: "hospital supplies demo", vars: { client: "Medora Health", demoDay: "Thursday" } },
  ],
  consequence: { title: "The demo slipped", detail: "Agreeing to the returns dashboard took two analyst days from committed work, and the stock alert was not ready for the CEO.", when: (m) => { const c = m.submitted.ar_email ?? ""; return /(sure|yes|no problem|will add|happy to add)/i.test(c) && !/change request/i.test(c); } },
  headline: (s, g) => s.length && g.length ? `Strong on ${s[0].toLowerCase()}. Next: ${g[0].toLowerCase()}.` : g.length ? `Good instincts. Next: ${g[0].toLowerCase()}.` : "Calm and clear with a senior client. Try a fresh variant.",
};
