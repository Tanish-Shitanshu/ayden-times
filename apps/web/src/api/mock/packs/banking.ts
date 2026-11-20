import type { RolePack, MissionDef } from "../types";
import { findLearner, artifactHas, artifactLacks, opened, learnerMsgs } from "../types";

const P = {
  meera: { id: "meera", name: "Meera Iyer", title: "Operations Team Lead", kind: "agent", avatarHue: 20, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  vikram: { id: "vikram", name: "Vikram Bose", title: "Compliance Officer", kind: "agent", avatarHue: 250, presence: "busy", modelLabel: "Gemini 4 Hydrogen" },
  sana: { id: "sana", name: "Sana Qureshi", title: "Payments Desk (colleague)", kind: "agent", avatarHue: 330, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  caller: { id: "caller", name: "Mr Chopra", title: "Customer (phone)", kind: "agent", avatarHue: 100, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
} as const;

const PLAYBOOK = `# Ops desk playbook (Kaveri Bank, fictional)

1. **Never release an outward payment** for an account whose KYC is expired or due. Keep it on hold.
2. **Escalate KYC exceptions to Compliance within 30 minutes.** Include the account, the amount, the reason for the hold, what you have done, and what you need.
3. Payments above **₹10 lakh** need four-eyes approval: a second checker must approve before release.
4. When you update a customer, say what is happening and when they will hear next. **Do not share internal risk flags** or compliance reasons.
5. Pressure from relationship managers does not change rules 1 to 3. Say no, give the reason, and offer the fastest correct path.
`;

const mission: MissionDef = {
  id: "bank-payment-hold",
  title: "Morning on the payments desk: a held transfer",
  description: "A large outward payment is on hold. Find out why, hold the line under pressure, escalate correctly and update the customer.",
  estMinutes: 20,
  company: "Kaveri Bank (fictional)",
  startLabel: { day: "Mon", minutes: 10 * 60 },
  people: [P.meera, P.vikram, P.sana, P.caller],
  skillIds: ["kyc_checks", "escalation", "say_no", "customer_comms", "rule_following"],
  items: [
    { id: "it_ticket", type: "ticket", title: "{{ticket}} · Outward payment on hold", key: "{{ticket}}", status: "On hold", priority: "urgent", description: "Outward transfer of **₹{{amount}} lakh** from {{customer}} to a new beneficiary is on hold. System flag: `KYC_REVIEW_DUE`. Customer wants it released today." },
    { id: "it_record", type: "record", title: "Customer KYC record · {{customer}}", fields: [{ label: "Account", value: "XXXX XXXX 4417 (current account)" }, { label: "Customer since", value: "2019" }, { label: "KYC status", value: "Re-KYC due" }, { label: "Address proof", value: "Utility bill dated {{proofDate}}" }, { label: "Proof validity", value: "Expired (older than 3 months at last review)" }, { label: "PAN", value: "XXXXX1234X (verified)" }, { label: "Risk category", value: "Medium" }], note: "Simplified training record. All data is fictional." },
    { id: "it_queue", type: "table", title: "Today's payment queue", columns: ["Ref", "Customer", "Amount", "Beneficiary", "Status"], rows: [["TX-5531", "Lotus Foods", "₹2.4 lakh", "Existing", "Released"], ["TX-5534", "{{customer}}", "₹{{amount}} lakh", "New", "On hold"], ["TX-5540", "Sharma & Sons", "₹0.8 lakh", "Existing", "Released"]], note: "Amounts above ₹10 lakh need a second checker." },
    { id: "it_playbook", type: "doc", title: "Ops desk playbook", markdown: PLAYBOOK },
  ],
  artifacts: [
    { id: "ar_escalation", kind: "email", title: "Escalation to Compliance", instructions: "Escalate the hold to Compliance so they can act without asking you anything.", template: "To: Compliance (Vikram Bose)\nSubject: \n\nAccount:\nAmount:\nWhy it is on hold:\nWhat I have done:\nWhat I need from you:\n", required: true, maxChars: 1500 },
    { id: "ar_customer", kind: "text", title: "Update to the customer", instructions: "Write the message the customer will receive. Plain language, no internal jargon.", required: true, maxChars: 800 },
  ],
  beats: [
    { title: "Review the hold", objective: "Open the ticket, the customer record and the playbook. Work out why the payment is held.", enter: [{ from: "meera", body: "Good morning. **{{ticket}}** is yours: a ₹{{amount}} lakh transfer for {{customer}} is on hold. Have a look and tell me what you find.", meta: { quickReplies: ["On it", "What usually causes these holds?"] } }], canAdvance: (m) => opened(m, "it_ticket") && opened(m, "it_record") },
    { title: "Hold the line and escalate", objective: "Decide what happens to the payment and escalate to Compliance.", enter: [{ from: "sana", wait: 12, body: "The relationship manager has called three times. It's a big client and the beneficiary is legit, I know them. Can we just release it and fix the paperwork later?", meta: { quickReplies: ["We can't release it yet", "Let me check the playbook first"] } }, { from: "caller", channel: "call", wait: 3, body: "Hello, this is Mr Chopra from {{customer}}. My payment has been pending since yesterday. Why is it delayed?" }], canAdvance: (m) => !!m.submitted.ar_escalation },
    { title: "Update the customer", objective: "Send the customer a clear update without sharing internal flags. Then finish.", enter: [{ from: "vikram", wait: 20, body: "Got your escalation. I can review an updated address proof within two hours of receiving it. Payment stays on hold until then." }], canAdvance: () => false },
  ],
  replies: [
    { id: "m_cause", to: "meera", match: /(cause|why|usually|reason)/i, reply: "Usually KYC. Check the customer record against the playbook, it's all there.", signal: "asked_for_context" },
    { id: "m_found", to: "meera", match: /(expired|kyc|address proof|re-?kyc|outdated)/i, reply: "Good catch. That's exactly why it's held. You know what the playbook says next.", signal: "identified_kyc_issue" },
    { id: "m_ok", to: "meera", match: /(on it|ok|sure|yes)/i, reply: "Thanks. Escalations to Compliance within 30 minutes, please." },
    { id: "s_no", to: "sana", match: /(can't|cannot|not able|won't|no[, ]|hold|not release)/i, reply: "Fair. I'll tell the RM it's with Compliance. What should I say on timing?", signal: "declined_unsafe_request" },
    { id: "s_check", to: "sana", match: /(playbook|check|rule)/i, reply: "Sure, but please be quick. The RM is not happy." },
    { id: "c_any", to: "caller", match: /./, reply: "Fine. But I want an update by this afternoon.", signal: "updated_customer" },
    { id: "v_q", to: "vikram", match: /./, reply: "Send me the escalation with the account, amount and reason, and I'll pick it up straight away.", signal: "contacted_compliance" },
  ],
  fallback: { caller: ["Please call me back with an update."], meera: ["Thanks, keep me posted.", "Use the playbook, it covers this."], sana: ["Okay, let me know what to tell the RM."], vikram: ["Noted. Send it through the escalation form."] },
  rejections: [
    { personId: "sana", summary: "Proposed tool release_payment(TX-5534)", reason: "Rejected: agents cannot change payment state. Only the learner's decision moves the story." },
    { personId: "meera", summary: "Proposed tool reply(chat, \"The address proof expired on…\")", reason: "Rejected: reveals the hidden fact before the learner opens the record." },
  ],
  onSubmit: (id, content) => {
    if (id !== "ar_escalation") return { lines: [], trace: [] };
    const hasAmt = /(₹|lakh|rs\.?|inr|\d{2,})/i.test(content);
    const hasAcct = /(account|4417|xxxx)/i.test(content);
    return { lines: [], trace: [
      { summary: `Deterministic check: escalation names the account → ${hasAcct ? "pass" : "fail"}`, verdict: "accepted" },
      { summary: `Deterministic check: escalation states the amount → ${hasAmt ? "pass" : "fail"}`, verdict: "accepted" },
    ] };
  },
};

const drill: MissionDef = {
  id: "banking-drill-say-no", title: "Drill: say no to a release under pressure", description: "Decline an unsafe request and offer the fastest correct path.", estMinutes: 6, company: "Kaveri Bank (fictional)", startLabel: { day: "Tue", minutes: 15 * 60 },
  people: [P.sana], skillIds: ["say_no"],
  items: [{ id: "it_playbook", type: "doc", title: "Ops desk playbook", markdown: PLAYBOOK }],
  artifacts: [{ id: "ar_reply", kind: "text", title: "Your reply to Sana", instructions: "Decline, give the reason, and offer the fastest correct path.", required: true, maxChars: 600 }],
  beats: [{ title: "Respond", objective: "Reply to Sana and submit your answer.", hint: "Say no clearly, cite the rule, then offer what you can do and by when.", enter: [{ from: "sana", body: "Branch head says release the ₹14 lakh transfer now and do the second check tomorrow. Can you do it?" }], canAdvance: () => false }],
  replies: [{ id: "s_no", to: "sana", match: /(can't|cannot|no|not)/i, reply: "Understood. I'll tell the branch head it needs a second checker first.", signal: "declined_unsafe_request" }],
  fallback: { sana: ["So what do I tell the branch head?"] }, rejections: [],
};

export const banking: RolePack = {
  summary: { id: "banking-ops", title: "Banking Operations Associate (KYC & payments)", tagline: "A held payment, an impatient client, and rules that do not bend.", domain: "Finance", status: "ready", company: "Kaveri Bank (fictional)", estMinutes: 20, skillCount: 5, icon: "account_balance", accentHex: "#e37400" },
  description: "You start on the payments desk of Kaveri Bank, a fictional bank. A large transfer is on hold, a colleague wants it released, and Compliance needs a clean escalation.",
  whatYouWillPractise: ["Spotting a KYC problem in a customer record", "Escalating with everything the other team needs", "Saying no with a reason under pressure", "Updating a customer without leaking internal flags"],
  safetyNote: "Simplified training scenario with fictional data. Not reviewed by a compliance professional.",
  cast: [
    { id: "meera", name: "Meera Iyer", title: "Operations Team Lead", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Calm and exact. Expects escalations within 30 minutes." },
    { id: "vikram", name: "Vikram Bose", title: "Compliance Officer", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Busy. Acts fast when an escalation has everything he needs." },
    { id: "sana", name: "Sana Qureshi", title: "Payments Desk (colleague)", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Friendly, under pressure from a relationship manager, and tempted to cut corners." },
  ],
  skills: [
    { def: { id: "kyc_checks", label: "Spot the KYC problem", description: "Read the record against the rules and name the exact issue.", targetLevel: 2 }, missedFact: "The address proof was older than three months, which triggers re-KYC.", badge: { title: "Found the real issue", description: "You named the KYC problem from the record." }, anchors: [
      { text: "Opened the customer record", source: "code", test: (m) => ({ met: opened(m, "it_record") }) },
      { text: "Named the expired address proof", source: "judge", test: (m) => { const a = findLearner(m, /(expired|outdated|re-?kyc|address proof|old proof)/i); return a.met ? a : artifactHas(m, "ar_escalation", /(expired|outdated|re-?kyc|address proof)/i); } },
      { text: "Checked the playbook", source: "code", test: (m) => ({ met: opened(m, "it_playbook") }) },
    ] },
    { def: { id: "escalation", label: "Escalate at the right time", description: "Escalate early, with everything the other team needs to act.", targetLevel: 2 }, missedFact: "The playbook gives Compliance escalations a 30-minute window.", badge: { title: "Complete escalations", description: "Your escalation let Compliance act without a follow-up question." }, anchors: [
      { text: "Escalation states account and amount", source: "code", test: (m) => { const a = artifactHas(m, "ar_escalation", /(₹|lakh|\d{2,})/i); return { ...a, met: a.met && /(account|4417|xxxx)/i.test(m.submitted.ar_escalation ?? "") }; } },
      { text: "Escalation says what you need", source: "judge", test: (m) => artifactHas(m, "ar_escalation", /(need|request|please (confirm|advise|review|approve)|can you)/i) },
      { text: "Contacted Compliance directly", source: "code", test: (m) => { const e = learnerMsgs(m, "vikram")[0]; return e ? { met: true, seq: e.seq, quote: e.body.slice(0, 100) } : { met: !!m.submitted.ar_escalation, seq: m.submittedSeq.ar_escalation }; } },
    ] },
    { def: { id: "say_no", label: "Say no with a reason", description: "Decline unsafe requests clearly, cite the rule and offer a path.", targetLevel: 2 }, badge: { title: "Held the line", description: "You declined an unsafe release and explained why." }, anchors: [
      { text: "Declined to release the payment", source: "judge", test: (m) => findLearner(m, /(can't|cannot|not able|won't|no[, ]|keep it on hold|not release)/i, "sana") },
      { text: "Gave the reason", source: "judge", test: (m) => findLearner(m, /(kyc|policy|playbook|compliance|rule)/i, "sana") },
      { text: "Offered the fastest correct path", source: "judge", test: (m) => findLearner(m, /(escalat|compliance|once|as soon as|within|today)/i, "sana") },
    ] },
    { def: { id: "customer_comms", label: "Clear customer updates", description: "Say what is happening and when they will hear next, in plain words.", targetLevel: 2 }, badge: { title: "Clear with customers", description: "Your customer update was clear and safe." }, anchors: [
      { text: "Said when the customer will hear next", source: "judge", test: (m) => artifactHas(m, "ar_customer", /(today|hours?|by \d|within|tomorrow|this afternoon)/i) },
      { text: "Asked for the document needed", source: "judge", test: (m) => artifactHas(m, "ar_customer", /(document|proof|upload|submit|share|bring)/i) },
      { text: "Did not share internal risk flags", source: "code", test: (m) => artifactLacks(m, "ar_customer", /(risk|flag|aml|suspicious|kyc_review)/i) },
    ] },
    { def: { id: "rule_following", label: "Follow the four-eyes rule", description: "Large payments need a second checker before release.", targetLevel: 1 }, missedFact: "Payments above ₹10 lakh need a second checker, even after Compliance clears them.", badge: { title: "Four eyes", description: "You remembered the second-checker rule." }, anchors: [
      { text: "Mentioned the second checker", source: "judge", test: (m) => { const a = findLearner(m, /(four[- ]eyes|second (checker|approv)|checker|maker)/i); return a.met ? a : artifactHas(m, "ar_escalation", /(four[- ]eyes|second (checker|approv)|checker)/i); } },
      { text: "Checked the amount against the limit", source: "judge", test: (m) => { const a = findLearner(m, /(10 lakh|limit|threshold|above)/i); return a.met ? a : artifactHas(m, "ar_escalation", /(10 lakh|limit|threshold)/i); } },
    ] },
  ],
  ramp: [
    { id: "b_w1_systems", typicalWeek: 1, title: "Read a customer record against the rules", description: "Spot what does not match the playbook.", skillIds: ["kyc_checks"], coveredBy: { kind: "mission", id: "bank-payment-hold" } },
    { id: "b_w2_escalate", typicalWeek: 2, title: "Escalate an exception within the window", description: "A complete escalation, on time.", skillIds: ["escalation"], coveredBy: { kind: "mission", id: "bank-payment-hold" } },
    { id: "b_w4_pressure", typicalWeek: 4, title: "Hold a rule under pressure", description: "Say no to a senior request, with a reason and a path.", skillIds: ["say_no"], coveredBy: { kind: "drill", id: "banking-drill-say-no" } },
    { id: "b_w4_customer", typicalWeek: 4, title: "Update a customer on a delay", description: "Clear, honest, and safe.", skillIds: ["customer_comms"], coveredBy: { kind: "mission", id: "bank-payment-hold" } },
    { id: "b_w8_checker", typicalWeek: 8, title: "Act as second checker", description: "Approve or return another associate's work.", skillIds: [], coveredBy: null },
    { id: "b_w12_audit", typicalWeek: 12, title: "Prepare for an internal audit", description: "Show the trail for your decisions.", skillIds: [], coveredBy: null },
  ],
  mission,
  drills: [{ id: "banking-drill-say-no", skillId: "say_no", title: "Say no to a release under pressure", why: "", estMinutes: 6, mission: drill }],
  variants: [
    { seed: "B4LK", label: "exporter transfer", vars: { ticket: "PAY-311", customer: "Ananya Traders", amount: "18", proofDate: "12 Mar 2026" } },
    { seed: "R2HQ", label: "textile supplier transfer", vars: { ticket: "PAY-348", customer: "Rathod Textiles", amount: "24", proofDate: "02 Feb 2026" } },
  ],
  consequence: { title: "Compliance had to ask you for the basics", detail: "Your escalation lacked the account or amount, so Compliance replied with questions and the customer waited another 40 minutes.", when: (m) => !/(₹|lakh|\d{2,})/i.test(m.submitted.ar_escalation ?? "") },
  headline: (s, g) => s.length && g.length ? `You ${s[0].toLowerCase()}. Next: ${g[0].toLowerCase()}.` : g.length ? `A solid first morning. Next: ${g[0].toLowerCase()}.` : "Clean work on the desk. Try a fresh variant to make it stick.",
};
