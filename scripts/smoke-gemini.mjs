// Checks the live Gemini calls Ayden depends on. Needs GEMINI_API_KEY in the environment.
//   node --env-file=apps/api/.env.local scripts/smoke-gemini.mjs
// Never prints the key.
import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set (put it in apps/api/.env.local)");
  process.exit(2);
}
const ai = new GoogleGenAI({ apiKey: key });
const M = { agent: process.env.MODEL_AGENT ?? "gemini-4-hydrogen", reason: process.env.MODEL_REASON ?? "gemini-4-argon", embed: process.env.MODEL_EMBED ?? "gemini-embedding-2" };
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push([name, true, `${Date.now() - t0} ms ${detail ?? ""}`]);
  } catch (e) {
    results.push([name, false, String(e.message ?? e).slice(0, 220)]);
  }
}
const strings = (v, out = []) => (typeof v === "string" ? out.push(v) : v && typeof v === "object" && Object.values(v).forEach((x) => strings(x, out)), out);

await check(`text (${M.agent})`, async () => {
  const r = await ai.interactions.create({ model: M.agent, input: "Reply with the single word: ready" });
  if (!r.output_text) throw new Error("no output_text");
});
await check(`system_instruction (${M.agent})`, async () => {
  const r = await ai.interactions.create({ model: M.agent, system_instruction: "You are Priya, an engineering manager. Reply in one short sentence.", input: "Good morning" });
  if (!r.output_text) throw new Error("no output_text");
});
await check(`structured output (${M.reason})`, async () => {
  const r = await ai.interactions.create({ model: M.reason, input: "Return JSON with ok=true", response_format: { type: "text", mime_type: "application/json", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } });
  if (JSON.parse(r.output_text).ok !== true) throw new Error("bad json");
});
await check(`function calling (${M.agent})`, async () => {
  const r = await ai.interactions.create({ model: M.agent, input: "Greet the learner using the reply tool.", tools: [{ type: "function", name: "reply", description: "Send a chat reply", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] });
  if (!r.steps.some((s) => s.type === "function_call")) throw new Error("no function_call step");
});
await check(`code execution (${M.agent})`, async () => {
  const program = 'import json\nprint("AYDEN_RESULTS:" + json.dumps([{"id":"t","passed":True}]))';
  const r = await ai.interactions.create({ model: M.agent, input: "Run this Python with the code execution tool exactly as written, then reply with only the AYDEN_RESULTS line it printed:\n```python\n" + program + "\n```", tools: [{ type: "code_execution" }] });
  const sandbox = r.steps.filter((s) => String(s.type).includes("code_execution_result"));
  const hit = strings(sandbox.length ? sandbox : r.steps).some((s) => s.includes("AYDEN_RESULTS:"));
  if (!hit) throw new Error("sandbox output not found; step types: " + r.steps.map((s) => s.type).join(","));
  return `(sandbox steps: ${sandbox.length})`;
});
await check(`embedding (${M.embed})`, async () => {
  const r = await ai.models.embedContent({ model: M.embed, contents: ["commit message hygiene", "write a good pull request"] });
  if (!r.embeddings?.[0]?.values?.length) throw new Error("no embeddings");
  return `(dims ${r.embeddings[0].values.length})`;
});

for (const [n, ok, d] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${n}  ${d}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);
