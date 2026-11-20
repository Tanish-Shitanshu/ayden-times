import type { RolePack, MissionDef, MockMission } from "../types";
import { findLearner, artifactHas, opened, learnerMsgs } from "../types";

const P = {
  latha: { id: "latha", name: "Latha Menon", title: "Charge Nurse", kind: "agent", avatarHue: 160, presence: "online", modelLabel: "Gemini 4 Hydrogen" },
  kabir: { id: "kabir", name: "Dr. Kabir Sethi", title: "Doctor on call", kind: "agent", avatarHue: 200, presence: "busy", modelLabel: "Gemini 4 Hydrogen" },
  anita: { id: "anita", name: "Anita D'Souza", title: "Outgoing nurse (handover)", kind: "agent", avatarHue: 340, presence: "away", modelLabel: "Gemini 4 Hydrogen" },
} as const;

const GUIDE = `# Escalation guide (simplified for training)

- If **two or more observations** move outside the normal range, or there is **new confusion**, escalate to the doctor on call **within 30 minutes**.
- Use **SBAR**: Situation, Background, Assessment, Recommendation.
- Give the **actual numbers** and the trend, not "a bit up and down".
- In your recommendation, ask for a review and **agree a time**.
- **Never suggest drugs or doses.** That is the doctor's decision.
- Write what was agreed in the handover for the next shift.
`;

const DRUGS = /(\bmg\b|\bdose\b|paracetamol|antibiotic|\bbolus\b|give (him|her) (some|a)|morphine|insulin)/i;
const allLearnerText = (m: MockMission) => learnerMsgs(m).map((e) => e.body).join("\n") + "\n" + Object.values(m.submitted).join("\n");

const mission: MissionDef = {
  id: "nurse-night-handover",
  title: "Night shift, Ward 4: the patient in bed {{bed}}",
  description: "Take a handover that downplays a worsening patient, spot the trend, escalate with SBAR and close the loop.",
  estMinutes: 20,
  company: "St. Anne's General Hospital (fictional)",
  startLabel: { day: "Thu", minutes: 4 * 60 + 10 },
  people: [P.latha, P.kabir, P.anita],
  skillIds: ["trend_spotting", "timely_escalation", "sbar", "scope_safety", "handover"],
  items: [
    { id: "it_patient", type: "record", title: "Bed {{bed}} · Mr. {{patient}}, 67", fields: [{ label: "Admitted", value: "Day 2 after hip surgery" }, { label: "Allergies", value: "Penicillin" }, { label: "Usual blood pressure", value: "132/80" }, { label: "Mobility", value: "Bed rest, physio from tomorrow" }, { label: "Family", value: "Daughter asks to be called about any change" }], note: "Fictional training patient." },
    { id: "it_obs", type: "table", title: "Observations, bed {{bed}} (simplified chart)", columns: ["Time", "BP", "Heart rate", "Resp. rate", "Temp °C", "SpO₂ %", "Alertness"], rows: [["20:00", "128/78", 88, 16, 37.2, 97, "Alert"], ["00:00", "118/72", 98, 19, 37.6, 96, "Alert"], ["04:00", "{{bp}}", "{{hr}}", 23, 38.3, 94, "New confusion"]], note: "Training values. Compare each row with the one before." },
    { id: "it_handover", type: "doc", title: "Handover notes from Anita", markdown: "**Bed {{bed}}, Mr. {{patient}}**\n\n- Settled most of the night.\n- Obs a bit up and down, probably pain.\n- Family called at 22:00.\n- Nothing else to flag." },
    { id: "it_guide", type: "doc", title: "Escalation guide", markdown: GUIDE },
  ],
  artifacts: [
    { id: "ar_sbar", kind: "sbar", title: "SBAR escalation", instructions: "Escalate to the doctor on call. Use the numbers.", template: "S (Situation):\n\nB (Background):\n\nA (Assessment):\n\nR (Recommendation):\n", required: true, maxChars: 1500 },
    { id: "ar_note", kind: "text", title: "Handover note for the day team", instructions: "What happened, what was agreed, and what to watch.", required: true, maxChars: 1000 },
  ],
  beats: [
    { title: "Take the handover", objective: "Read Anita's handover and check the patient's observations yourself.", enter: [{ from: "anita", body: "Handover for bed {{bed}}: he's fine, obs a bit up and down, probably pain. I'm heading off, okay?", meta: { quickReplies: ["Before you go, what were his last obs?", "Thanks, I'll check him"] } }], canAdvance: (m) => opened(m, "it_obs") },
    { title: "Escalate", objective: "If the trend worries you, escalate to the doctor on call using SBAR.", enter: [
      { from: "system", kind: "system", wait: 4, body: "04:20 · New observations recorded for bed {{bed}}: BP {{bp}}, heart rate {{hr}}, breathing rate 24, newly confused.", meta: { itemId: "it_patient" }, updateItem: { id: "it_patient", patch: { fields: [{ label: "Admitted", value: "Day 2 after hip surgery" }, { label: "Allergies", value: "Penicillin" }, { label: "Usual blood pressure", value: "132/80" }, { label: "Observations at 04:20", value: "BP {{bp}}, HR {{hr}}, RR 24, Temp 38.4 °C" }, { label: "Alertness", value: "Newly confused" }, { label: "Family", value: "Daughter asks to be called about any change" }] } } },{ from: "latha", wait: 8, body: "How's bed {{bed}}? Day team asked about him. If you're worried, escalate, don't wait for the ward round." }], canAdvance: (m) => !!m.submitted.ar_sbar },
    { title: "Close the loop", objective: "Write the handover note for the day team, then finish.", enter: [{ from: "kabir", wait: 10, body: "Thanks for the clear SBAR. I'll see him in 20 minutes. Please repeat his observations in 15 and call me if anything drops further." }], canAdvance: () => false },
  ],
  replies: [
    { id: "a_obs", to: "anita", match: /(obs|last|number|bp|pressure|heart|temp|before you go)/i, reply: "Last set was at 04:00, it's on the chart. I thought it was pain, he was a bit muddled too.", signal: "questioned_handover" },
    { id: "a_bye", to: "anita", match: /./, reply: "Thanks, see you tomorrow." },
    { id: "l_worry", to: "latha", match: /(worr|concern|trend|dropping|rising|confus|escalat|doctor)/i, reply: "Agree, that trend is a concern. Call Dr. Sethi now with SBAR, I'll cover your other patients for ten minutes.", signal: "raised_concern" },
    { id: "l_ok", to: "latha", match: /./, reply: "Okay. Trust the numbers, not the handover." },
    { id: "k_call", to: "kabir", match: /./, reply: "I'm listening. Give me SBAR with the numbers please.", signal: "called_doctor" },
  ],
  fallback: { latha: ["Okay, keep me posted."], kabir: ["Send the SBAR through and I'll come."], anita: ["Sorry, I've got to go."] },
  rejections: [
    { personId: "kabir", summary: "Proposed tool reply(chat, \"Give him 1 g of …\")", reason: "Rejected: training scenarios never include drug or dose instructions." },
    { personId: "anita", summary: "Proposed tool reply(chat, \"It's probably an infection\")", reason: "Rejected: the outgoing nurse persona does not know the hidden assessment." },
  ],
  onSubmit: (id, content) => {
    if (id !== "ar_sbar") return { lines: [], trace: [] };
    const sections = ["S", "B", "A", "R"].filter((k) => new RegExp(`^${k}[^\\n]*:\\s*\\n?\\s*\\S`, "m").test(content)).length;
    return { lines: [], trace: [
      { summary: `Deterministic check: SBAR sections filled ${sections}/4`, verdict: "accepted" },
      { summary: `Deterministic check: includes observation numbers → ${/\d{2,3}/.test(content) ? "pass" : "fail"}`, verdict: "accepted" },
      { summary: `Safety rule: no drug or dose suggested → ${DRUGS.test(content) ? "violated" : "pass"}`, verdict: DRUGS.test(content) ? "rejected" : "accepted", reason: DRUGS.test(content) ? "The SBAR suggests a drug or dose, which is outside the nurse's scope in this scenario." : undefined },
    ] };
  },
};

const drill: MissionDef = {
  id: "nurse-drill-sbar", title: "Drill: a complete SBAR", description: "Escalate a new patient with all four parts and the numbers.", estMinutes: 7, company: "St. Anne's General Hospital (fictional)", startLabel: { day: "Fri", minutes: 2 * 60 },
  people: [P.kabir], skillIds: ["sbar"],
  items: [{ id: "it_obs", type: "table", title: "Observations, bed 3", columns: ["Time", "BP", "Heart rate", "Resp. rate", "SpO₂ %"], rows: [["22:00", "124/76", 84, 16, 97], ["02:00", "102/64", 112, 22, 93]], note: "Training values." }, { id: "it_guide", type: "doc", title: "Escalation guide", markdown: GUIDE }],
  artifacts: [{ id: "ar_sbar", kind: "sbar", title: "SBAR escalation", instructions: "All four parts, with numbers and a review time.", template: "S (Situation):\n\nB (Background):\n\nA (Assessment):\n\nR (Recommendation):\n", required: true, maxChars: 1500 }],
  beats: [{ title: "Escalate", objective: "Write and submit the SBAR.", hint: "Situation in one line, the trend with numbers in Assessment, and ask for a review within a time in Recommendation.", enter: [{ from: "kabir", body: "I'm on call tonight. Send me an SBAR if you need me." }], canAdvance: () => false }],
  replies: [{ id: "k", to: "kabir", match: /./, reply: "Put it in the SBAR with the numbers and I'll act on it." }], fallback: { kabir: ["Send the SBAR."] }, rejections: [],
};

export const nurse: RolePack = {
  summary: { id: "nurse", title: "Staff Nurse (Ward)", tagline: "A night-shift handover where the details matter.", domain: "Healthcare", status: "ready", company: "St. Anne's General Hospital (fictional)", estMinutes: 20, skillCount: 5, icon: "stethoscope", accentHex: "#1e8e3e" },
  description: "You are on nights on Ward 4 of a fictional hospital. The handover says a patient is fine. The chart says otherwise. Practise trusting the numbers and escalating clearly.",
  whatYouWillPractise: ["Reading an observation trend instead of a reassuring handover", "Escalating within the window", "A complete SBAR with numbers", "Staying in scope and closing the loop"],
  safetyNote: "Training scenario, not clinical advice. You never choose drugs or doses. Simplified and not reviewed by a clinician.",
  cast: [
    { id: "latha", name: "Latha Menon", title: "Charge Nurse", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Supportive. Wants you to trust the chart and escalate early." },
    { id: "kabir", name: "Dr. Kabir Sethi", title: "Doctor on call", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Busy across three wards. Acts fast on a clear SBAR with numbers." },
    { id: "anita", name: "Anita D'Souza", title: "Outgoing nurse", kind: "agent", modelLabel: "Gemini 4 Hydrogen", blurb: "Tired after a long shift. Her handover underplays the trend." },
  ],
  skills: [
    { def: { id: "trend_spotting", label: "Read the trend, not the reassurance", description: "Compare observations over time and notice what is changing.", targetLevel: 2 }, missedFact: "Blood pressure fell while heart rate, breathing rate and temperature rose, with new confusion. Together that meets the escalation rule.", badge: { title: "Trusted the numbers", description: "You checked the chart instead of relying on the handover." }, anchors: [
      { text: "Opened the observation chart", source: "code", test: (m) => ({ met: opened(m, "it_obs") }) },
      { text: "Questioned the handover", source: "judge", test: (m) => findLearner(m, /(obs|number|pressure|bp|heart|trend|last)/i, "anita") },
      { text: "Named the changing observations", source: "judge", test: (m) => artifactHas(m, "ar_sbar", /(heart rate|blood pressure|bp|resp|temp|confus)/i) },
    ] },
    { def: { id: "timely_escalation", label: "Escalate in time", description: "Escalate within the window, without waiting for the ward round.", targetLevel: 2 }, badge: { title: "Escalated in time", description: "You escalated within the window." }, anchors: [
      { text: "Raised the concern with the charge nurse", source: "judge", test: (m) => findLearner(m, /(worr|concern|trend|dropping|rising|confus|escalat)/i, "latha") },
      { text: "Contacted the doctor", source: "code", test: (m) => { const e = learnerMsgs(m, "kabir")[0]; return e ? { met: true, seq: e.seq, quote: e.body.slice(0, 100) } : { met: !!m.submitted.ar_sbar, seq: m.submittedSeq.ar_sbar }; } },
      { text: "Escalated within 30 simulated minutes", source: "code", test: (m) => ({ met: !!m.submittedSeq.ar_sbar && (m.events.find((e) => e.seq === m.submittedSeq.ar_sbar)?.simMinute ?? 999) <= 40, seq: m.submittedSeq.ar_sbar }) },
    ] },
    { def: { id: "sbar", label: "A complete SBAR", description: "Situation, background, assessment and a recommendation with the numbers.", targetLevel: 2 }, missedFact: "The guide asks you to agree a review time in the Recommendation.", badge: { title: "Clear SBAR", description: "Your SBAR had all four parts and the numbers." }, anchors: [
      { text: "All four SBAR sections filled", source: "code", test: (m) => { const c = m.submitted.ar_sbar ?? ""; const n = ["S", "B", "A", "R"].filter((k) => new RegExp(`^${k}[^\\n]*:\\s*\\n?\\s*\\S`, "m").test(c)).length; return { met: n === 4, seq: m.submittedSeq.ar_sbar }; } },
      { text: "Included the observation numbers", source: "code", test: (m) => artifactHas(m, "ar_sbar", /\d{2,3}\/\d{2}|\b1\d\d\b|\b3[89]\.\d/) },
      { text: "Asked for a review with a time", source: "judge", test: (m) => artifactHas(m, "ar_sbar", /(review|see him|attend|within \d+|in \d+ ?min|now)/i) },
    ] },
    { def: { id: "scope_safety", label: "Stay in scope", description: "Escalate the facts. Leave drug and dose decisions to the doctor.", targetLevel: 1 }, badge: { title: "Stayed in scope", description: "You escalated facts and left treatment to the doctor." }, anchors: [
      { text: "Did not suggest drugs or doses", source: "code", test: (m) => ({ met: !!m.submitted.ar_sbar && !DRUGS.test(allLearnerText(m)), seq: m.submittedSeq.ar_sbar }) },
      { text: "Mentioned the allergy when relevant", source: "judge", test: (m) => artifactHas(m, "ar_sbar", /penicillin|allerg/i) },
    ] },
    { def: { id: "handover", label: "Close the loop", description: "Write what was agreed and what to watch, so the next shift can act.", targetLevel: 2 }, badge: { title: "Closed the loop", description: "Your handover told the day team what to do." }, anchors: [
      { text: "Handover states the agreed plan", source: "judge", test: (m) => artifactHas(m, "ar_note", /(repeat|recheck|review|obs|doctor|20 min|15 min)/i) },
      { text: "Handover mentions the family", source: "judge", test: (m) => artifactHas(m, "ar_note", /(family|daughter)/i) },
      { text: "Handover uses numbers", source: "code", test: (m) => artifactHas(m, "ar_note", /\d{2,3}/) },
    ] },
  ],
  ramp: [
    { id: "n_w1_chart", typicalWeek: 1, title: "Read a chart for trends", description: "Compare each set of observations with the last.", skillIds: ["trend_spotting"], coveredBy: { kind: "mission", id: "nurse-night-handover" } },
    { id: "n_w2_escalate", typicalWeek: 2, title: "Escalate a deteriorating patient", description: "Within the window, using SBAR.", skillIds: ["timely_escalation", "sbar"], coveredBy: { kind: "mission", id: "nurse-night-handover" } },
    { id: "n_w2_scope", typicalWeek: 2, title: "Know your scope", description: "Escalate facts; leave prescribing to doctors.", skillIds: ["scope_safety"], coveredBy: { kind: "mission", id: "nurse-night-handover" } },
    { id: "n_w4_handover", typicalWeek: 4, title: "Give a safe handover", description: "What happened, what was agreed, what to watch.", skillIds: ["handover"], coveredBy: { kind: "mission", id: "nurse-night-handover" } },
    { id: "n_w8_family", typicalWeek: 8, title: "Update a worried family", description: "Explain a change honestly and kindly.", skillIds: [], coveredBy: null },
    { id: "n_w12_lead", typicalWeek: 12, title: "Lead a bay on a night shift", description: "Prioritise across several patients.", skillIds: [], coveredBy: null },
  ],
  mission,
  drills: [{ id: "nurse-drill-sbar", skillId: "sbar", title: "Write a complete SBAR for a new patient", why: "", estMinutes: 7, mission: drill }],
  variants: [
    { seed: "N12A", label: "post-op hip, bed 12", vars: { bed: "12", patient: "R. Iyer", bp: "98/60", hr: "118" } },
    { seed: "N07C", label: "post-op knee, bed 7", vars: { bed: "7", patient: "S. Khan", bp: "94/58", hr: "124" } },
  ],
  consequence: { title: "The doctor had to call back for the numbers", detail: "Without the observations in your SBAR, the review started 15 simulated minutes later.", when: (m) => !/\d{2,3}/.test(m.submitted.ar_sbar ?? "") },
  headline: (s, g) => s.length && g.length ? `You ${s[0].toLowerCase()}. Next: ${g[0].toLowerCase()}.` : g.length ? `A safe start. Next: ${g[0].toLowerCase()}.` : "A clear, safe escalation. Rehearse it on a fresh patient.",
};
