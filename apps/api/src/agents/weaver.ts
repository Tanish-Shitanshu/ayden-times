import { config } from "../config.js";
import type { MissionDef, Vars } from "../domain/types.js";
import type { LlmClient } from "./llm.js";

const SCHEMA = {
  type: "object",
  properties: {
    opening: { type: "string", description: "The manager's first chat message, 1-2 sentences, warm and realistic, mentioning the ticket or task." },
    note: { type: "string", description: "One realistic extra detail about the customer or situation, max 160 characters." },
  },
  required: ["opening", "note"],
};

export interface Profile {
  experience: string;
  weakSkills: string[];
  reseed: boolean;
}

/**
 * Scenario Weaver (Gemini, structured output): personalises the surface of a mission for this learner.
 * The engine owns the facts; Weaver only supplies wording, and its output is length-checked.
 * Returns extra vars (weaveOpening, weaveNote) or null when the model is unavailable.
 */
export async function weave(llm: LlmClient, def: MissionDef, vars: Vars, profile: Profile): Promise<Vars | null> {
  if (!llm.live()) return null;
  try {
    const res = await llm.structured({
      model: config.models.reason,
      system:
        "You write the surface wording of a realistic workplace training scenario. Keep every factual detail in BASE VARIABLES exactly as given. Do not add numbers or names that are not provided. Plain English, Indian workplace tone.",
      input: `MISSION: ${def.title}\nBASE VARIABLES: ${JSON.stringify(vars)}\nLEARNER: experience=${profile.experience}; skills they find hard: ${profile.weakSkills.join(", ") || "unknown"}.\nWrite a fresh opening message and a small realistic detail.`,
      schema: SCHEMA,
      timeoutMs: 20_000,
    });
    const d = res.data as { opening?: string; note?: string };
    const opening = String(d.opening ?? "").trim();
    const note = String(d.note ?? "").trim();
    if (opening.length < 15 || opening.length > 320 || note.length > 200) return null;
    return { weaveOpening: opening, weaveNote: note };
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Rank candidate texts by similarity to `query` with gemini-embedding-2. Returns null if embeddings are unavailable. */
export async function rankBySimilarity(llm: LlmClient, query: string, candidates: string[]): Promise<number[] | null> {
  if (!llm.live() || candidates.length < 2) return null;
  try {
    const embs = await llm.embed([query, ...candidates]);
    if (embs.length !== candidates.length + 1) return null;
    return candidates.map((_c, i) => cosine(embs[0]!, embs[i + 1]!));
  } catch {
    return null;
  }
}
