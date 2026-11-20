/**
 * Static copy for the landing and "How it works" pages. Everything else comes from the API.
 * Statistics are shown ONLY when `verified: true`, after a founder has opened the source.
 */

export interface Stat { text: string; source: string; url: string; verified: boolean }

export const content = {
  feedbackUrl: "",
  hero: {
    title: "Rehearse your first 90 days.",
    sub: "Practise the real work of your first job with an AI team, find the skills you are missing, and fix them before day one.",
    cta: "Try the demo, no sign-up",
    secondary: "See how it works",
    note: "Takes 20 to 25 minutes. Private to you.",
  },
  loop: [
    { icon: "radiology", title: "Diagnose", body: "Work a realistic first week with an AI team. Your actions, not a quiz, show where you are." },
    { icon: "fitness_center", title: "Train", body: "Short drills on fresh variants target the exact skill you missed, with your own words as the starting point." },
    { icon: "flag", title: "Prove", body: "Show the behaviour again on new material. Your Ramp Map fills in, milestone by milestone." },
  ],
  neverTaught: ["Commit and PR hygiene", "Escalating at the right time", "Reading a team's unwritten rules", "Saying no with a reason"],
  whyNow: {
    title: "Why now",
    qualitative: "New hires usually spend their first two or three months getting productive, learning things no course teaches: how a team works, when to escalate, how to write for a busy reviewer. Ayden lets you rehearse those milestones before day one. Our target is 15 to 30 days of rehearsed readiness; we will measure real ramp time in a pilot.",
    stats: [] as Stat[],
  },
  privacy: [
    { icon: "lock", text: "You own your report. Export or delete it any time." },
    { icon: "groups", text: "Colleges and companies see only anonymous group patterns, in groups of 5 or more." },
    { icon: "leaderboard", text: "No leaderboards, no rankings, no scores shared with employers." },
  ],
  google: ["Gemini API", "Cloud Run", "Firestore", "Secret Manager"],
  faq: [
    { q: "Is this a test?", a: "No. It is practice. Your first shift sets your starting point and is private to you." },
    { q: "Is it scripted?", a: "The story, rules and checks are fixed so feedback is reliable. Names, numbers and emphasis change with each variant, and colleagues reply in free text." },
    { q: "Who sees my results?", a: "Only you. Group leads see anonymous patterns from groups of 5 or more, and only if you allow it." },
  ],
  scoring: [
    { icon: "code", title: "Signals first", body: "Code checks what can be checked: tests in a sandbox, commit format, required SBAR sections, numbers tied to the data." },
    { icon: "format_quote", title: "A quote-bound judge", body: "A Gemini judge adds observations only when it can quote your exact words as evidence." },
    { icon: "verified", title: "Every quote verified", body: "The server checks each quote is a word-for-word substring of your message. Quotes that are not are dropped." },
    { icon: "balance", title: "Two runs, honest uncertainty", body: "The judge runs twice. When the runs disagree, the skill is marked Uncertain instead of guessed." },
  ],
  security: [
    { area: "Model key", how: "Stored in Secret Manager and mounted at runtime. Never in the repo or the browser.", service: "Secret Manager" },
    { area: "Learner code", how: "Runs only inside Google's code execution sandbox, never on our servers.", service: "Gemini code execution" },
    { area: "Sessions", how: "httpOnly, SameSite cookie. No passwords stored.", service: "Cloud Run" },
    { area: "Your data", how: "Consent before anything is stored; export and delete from the Privacy centre.", service: "Firestore" },
    { area: "Group insights", how: "Only aggregates, and only for groups of 5 or more consenting members.", service: "Firestore" },
    { area: "Logs", how: "Structured logs without message bodies.", service: "Cloud Logging" },
  ],
  built: [
    "Four role packs on one engine: software engineer, banking operations, nurse, tech consulting",
    "Multi-agent team with engine validation and a visible trace",
    "Skill X-ray with quote-verified evidence",
    "Ramp Map, drills and fresh variants",
    "Privacy centre with export and delete",
    "Group console with k ≥ 5 suppression",
    "English and Hindi interface",
    "Personal data redacted before Gemini (Sensitive Data Protection) and anonymous skill patterns in BigQuery",
    "Spot the trap: a private warm-up game, no leaderboard",
  ],
  planned: [
    "Data Analyst role with real BigQuery SQL",
    "Voice escalations (phone-call SBAR)",
    "Full day mode",
    "Role Compiler for new roles from a job description",
    "Google sign-in",
    "Pilot to measure real ramp time",
    "Gym API for AI agents (roadmap)",
  ],
};
