import type { RolePack } from "../domain/types.js";

/** Planned: needs the BigQuery wiring (real SQL on a public dataset). Shown as a non-clickable "Planned" card. */
export const dataAnalyst: RolePack = {
  id: "data-analyst",
  status: "planned",
  title: "Data Analyst (Business Analytics)",
  tagline: "Write real SQL, then explain it to a stakeholder.",
  domain: "Data",
  company: "Lumen Retail (fictional)",
  estMinutes: 20,
  icon: "query_stats",
  accentHex: "#9334e6",
  description: "Planned: run real SQL on a public BigQuery dataset, avoid join fan-out and partial-month traps, and present an answer-first insight.",
  whatYouWillPractise: ["Clarifying a vague question", "Writing correct SQL", "Stating caveats", "Communicating insight answer-first", "Reproducible queries"],
  skills: [],
  anchors: [],
  cast: [],
  rampMap: [],
  missions: [],
  drills: [],
};
