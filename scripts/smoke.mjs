// End-to-end smoke test against a running Ayden server.
//   BASE_URL=https://<service-url> node scripts/smoke.mjs
// Plays a full Software Engineer mission through the public API and checks the report.
const BASE = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
let cookie = "";
let step = 0;
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);
const fail = (m, extra) => {
  console.error(`  ✗ ${m}`, extra ?? "");
  process.exit(1);
};
async function call(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const GOLD = {
  pricing: `"""Order pricing for OrderDesk."""\n\n\ndef line_total(unit_price: float, quantity: int) -> float:\n    """Price of one order line before any order-level discount."""\n    if quantity < 0:\n        raise ValueError("quantity must be zero or more")\n    return unit_price * quantity\n\n\ndef total(lines: list, discount_rate: float = 0.0) -> float:\n    """Order total with the discount applied once to the whole order."""\n    if not 0 <= discount_rate <= 1:\n        raise ValueError("discount_rate must be between 0 and 1")\n    subtotal = sum(line_total(p, q) for p, q in lines)\n    return round(subtotal * (1 - discount_rate), 2)\n`,
  shipping: `"""Shipping cost for OrderDesk."""\n\nBASE_FEE = 40.0\nPER_KG = 12.0\nEXPRESS_MULTIPLIER = 1.25\n\n\ndef shipping_cost(weight_kg: float, express: bool = False) -> float:\n    """Cost of sending one parcel. The base fee is charged once."""\n    if weight_kg <= 0:\n        raise ValueError("weight_kg must be above zero")\n    cost = BASE_FEE + weight_kg * PER_KG\n    if express:\n        cost *= EXPRESS_MULTIPLIER\n    return round(cost, 2)\n`,
};

console.log(`Smoke test against ${BASE}`);
let r = await call("GET", "/health");
if (r.status !== 200) fail("health", r);
ok("health");
r = await call("GET", "/roles");
if (r.body.length !== 5) fail("roles", r.body);
ok(`roles listed (${r.body.filter((x) => x.status === "ready").length} ready)`);
const status = (await call("GET", "/system/status")).body;
ok(`runtime mode: ${status.runtime}; store/services: ${status.googleServices.map((s) => `${s.name}=${s.state}`).join(", ")}`);

await call("POST", "/session/guest", {});
await call("PUT", "/me/consent", { age18: true, storeWork: true, shareAnonymousPatterns: true });
await call("POST", "/onboarding", { roleId: "software-engineer", experience: "none", selfRatings: { clarify: 4, verify: 4, conventions: 4, git_hygiene: 4, review_collab: 4 } });
r = await call("POST", "/missions", { roleId: "software-engineer", mode: "quick" });
if (r.status !== 200) fail("create mission", r);
const m = r.body;
ok(`mission created (${m.variantLabel}), mode ${m.runtime.mode}`);
let seq = 0;
const act = async (b) => {
  const x = await call("POST", `/missions/${m.id}/act`, { clientSeq: ++seq, ...b });
  if (x.status !== 200) fail(`act ${b.kind}`, x.body);
  return x.body;
};
const isShipping = m.items.some((i) => i.path === "src/shipping.py");
const mod = isShipping ? "shipping" : "pricing";
const key = m.items.find((i) => i.type === "ticket").key;

await act({ kind: "open_item", itemId: "it_guide" });
let x = await act({ kind: "message", to: "priya", channel: "chat", text: "Before I start: should the rule apply once, and to what exactly? Just to confirm my understanding." });
if (!x.events.some((e) => e.from === "priya")) fail("priya did not reply");
ok("manager replied");
await act({ kind: "advance" });
await act({ kind: "save_file", itemId: "it_src", content: GOLD[mod] });
x = await act({ kind: "run_checks" });
const checks = x.events.find((e) => e.kind === "check_result");
ok(`checks ran: ${checks.body}`);
await act({ kind: "advance" });
await act({ kind: "submit_artifact", artifactId: "ar_commit", content: `fix(${mod}): apply the rule once (${key})` });
x = await act({ kind: "submit_artifact", artifactId: "ar_pr", content: "## Why\nCustomers were overcharged because the rule was applied twice.\n\n## What changed\nApplied it once and validated input.\n\n## How I tested\nRan the checks.\n\n## Risks\nLow." });
if (!x.events.some((e) => e.from === "arjun")) fail("reviewer did not respond", x.events);
ok("reviewer and QA responded");
await act({ kind: "advance" });
x = await act({ kind: "message", to: "priya", channel: "chat", text: "I'd rather not merge before the checks and review are green. The risk is customers being overcharged again." });
if (!x.delta.canFinish) fail("cannot finish");
const fin = await call("POST", `/missions/${m.id}/finish`, {});
if (fin.status !== 200) fail("finish", fin);
const rep = (await call("GET", `/reports/${fin.body.reportId}`)).body;
if (rep.skills.length !== 5) fail("report skills", rep);
ok(`report ready: "${rep.headline}"`);
ok(`integrity: mode=${rep.integrity.mode}, judge=${rep.integrity.judgeModel}, quotes verified=${rep.integrity.quotesVerified}`);
const prog = (await call("GET", "/me/progress?roleId=software-engineer")).body;
ok(`progress: ${prog.milestonesAchieved}/${prog.milestonesTotal} milestones`);
console.log("SMOKE PASSED");
