import type { CheckResult } from "@ayden/contract";

/** The Python code families for the Software Engineer mission. Each has a bug, visible tests, hidden tests and a golden fix. */
export interface SweFamily {
  index: number;
  module: string; // python module name, e.g. "pricing"
  srcPath: string;
  testPath: string;
  buggy: string;
  tests: string;
  hidden: string;
  golden: string;
  goldenTests: string;
  ambiguityRe: string;
  ruleAnswer: string;
  edgeDescription: string;
  strategyName: string;
  ticketTitle: string;
  ticketBody: string;
  topic: string;
}

const PRICING: SweFamily = {
  index: 0,
  module: "pricing",
  srcPath: "src/pricing.py",
  testPath: "tests/test_pricing.py",
  topic: "bulk-order pricing",
  ticketTitle: "Discount applied twice on bulk orders",
  ticketBody:
    "Customers report that orders with a discount code are charged too little. The discount seems to be applied twice. Acceptance criteria: the discount applies once to the whole order; totals are rounded to 2 decimal places; invalid input is rejected as described in the team guide.",
  ambiguityRe: "(per|each|every) (line|item)|whole order|\\bonce\\b|twice|double|more than once|how many times",
  ruleAnswer: "Whole order, once. The discount rate applies one time to the order subtotal. The guide covers input validation too.",
  edgeDescription: "invalid quantities or discount rates",
  strategyName: "DiscountStrategy",
  buggy: `"""Order pricing for OrderDesk."""


def line_total(unit_price, quantity, discount_rate=0.0):
    # price of one order line, after discount
    return unit_price * quantity * (1 - discount_rate)


def total(lines, discount_rate=0.0):
    # lines is a list of (unit_price, quantity)
    subtotal = sum(line_total(p, q, discount_rate) for p, q in lines)
    return round(subtotal * (1 - discount_rate), 2)
`,
  tests: `from pricing import total


def test_total_without_discount():
    assert total([(10.0, 2)]) == 20.0


def test_total_with_discount_applies_once():
    assert total([(10.0, 10)], 0.1) == 90.0


def test_total_empty_order():
    assert total([]) == 0.0
`,
  hidden: `from pricing import total


def hidden_zero_quantity():
    assert total([(10.0, 0)], 0.1) == 0.0


def hidden_rounding():
    assert total([(19.99, 3)], 0.15) == 50.97


def hidden_invalid_discount():
    try:
        total([(10.0, 1)], 1.5)
    except ValueError:
        return
    raise AssertionError("discount_rate above 1 should raise ValueError")


def hidden_negative_quantity():
    try:
        total([(10.0, -1)])
    except ValueError:
        return
    raise AssertionError("negative quantity should raise ValueError")
`,
  golden: `"""Order pricing for OrderDesk."""


def line_total(unit_price: float, quantity: int) -> float:
    """Price of one order line before any order-level discount."""
    if quantity < 0:
        raise ValueError("quantity must be zero or more")
    return unit_price * quantity


def total(lines: list, discount_rate: float = 0.0) -> float:
    """Order total with the discount applied once to the whole order."""
    if not 0 <= discount_rate <= 1:
        raise ValueError("discount_rate must be between 0 and 1")
    subtotal = sum(line_total(p, q) for p, q in lines)
    return round(subtotal * (1 - discount_rate), 2)
`,
  goldenTests: `from pricing import total


def test_total_without_discount():
    assert total([(10.0, 2)]) == 20.0


def test_total_with_discount_applies_once():
    assert total([(10.0, 10)], 0.1) == 90.0


def test_total_empty_order():
    assert total([]) == 0.0


def test_negative_quantity_is_rejected():
    try:
        total([(10.0, -1)])
    except ValueError:
        return
    raise AssertionError("expected ValueError")
`,
};

const SHIPPING: SweFamily = {
  index: 1,
  module: "shipping",
  srcPath: "src/shipping.py",
  testPath: "tests/test_shipping.py",
  topic: "parcel shipping",
  ticketTitle: "Heavy parcels are charged the base fee twice",
  ticketBody:
    "Customers shipping parcels over 5 kg are overcharged. The base fee seems to be charged twice for heavy parcels. Acceptance criteria: the base fee is charged once per parcel; express shipping adds 25%; costs are rounded to 2 decimal places; invalid input is rejected as described in the team guide.",
  ambiguityRe: "(base fee|heavy|over 5|\\bonce\\b|twice|double|how many times|surcharge|per parcel)",
  ruleAnswer: "The base fee is charged once per parcel. Heavy parcels should not pay it a second time. The guide covers input validation too.",
  edgeDescription: "invalid weights or express parcels",
  strategyName: "ShippingRule",
  buggy: `"""Shipping cost for OrderDesk."""

BASE_FEE = 40.0
PER_KG = 12.0
HEAVY_KG = 5


def shipping_cost(weight_kg, express=False):
    # cost of sending one parcel
    cost = BASE_FEE + weight_kg * PER_KG
    if weight_kg > HEAVY_KG:
        cost += BASE_FEE
    if express:
        cost *= 1.25
    return round(cost, 2)
`,
  tests: `from shipping import shipping_cost


def test_light_parcel():
    assert shipping_cost(2) == 64.0


def test_heavy_parcel_pays_base_fee_once():
    assert shipping_cost(8) == 136.0


def test_express_adds_a_quarter():
    assert shipping_cost(2, True) == 80.0
`,
  hidden: `from shipping import shipping_cost


def hidden_rounding_express():
    assert shipping_cost(2.5, True) == 87.5


def hidden_heavy_express():
    assert shipping_cost(6, True) == 140.0


def hidden_zero_weight():
    try:
        shipping_cost(0)
    except ValueError:
        return
    raise AssertionError("zero weight should raise ValueError")


def hidden_negative_weight():
    try:
        shipping_cost(-2)
    except ValueError:
        return
    raise AssertionError("negative weight should raise ValueError")
`,
  golden: `"""Shipping cost for OrderDesk."""

BASE_FEE = 40.0
PER_KG = 12.0
EXPRESS_MULTIPLIER = 1.25


def shipping_cost(weight_kg: float, express: bool = False) -> float:
    """Cost of sending one parcel. The base fee is charged once."""
    if weight_kg <= 0:
        raise ValueError("weight_kg must be above zero")
    cost = BASE_FEE + weight_kg * PER_KG
    if express:
        cost *= EXPRESS_MULTIPLIER
    return round(cost, 2)
`,
  goldenTests: `from shipping import shipping_cost


def test_light_parcel():
    assert shipping_cost(2) == 64.0


def test_heavy_parcel_pays_base_fee_once():
    assert shipping_cost(8) == 136.0


def test_express_adds_a_quarter():
    assert shipping_cost(2, True) == 80.0


def test_zero_weight_is_rejected():
    try:
        shipping_cost(0)
    except ValueError:
        return
    raise AssertionError("expected ValueError")
`,
};

export const FAMILIES: SweFamily[] = [PRICING, SHIPPING];

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** One self-contained Python program: loads the learner's module, then the visible and hidden tests, and prints one JSON line. */
export function buildProgram(f: SweFamily, src: string, tests: string): string {
  return `import sys, types, base64, json
def _dec(s):
    return base64.b64decode(s).decode("utf-8")
def _load(name, code):
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    exec(compile(code, name + ".py", "exec"), mod.__dict__)
    return mod
_results = []
try:
    _load("${f.module}", _dec("${b64(src)}"))
    _t = _load("_visible_tests", _dec("${b64(tests)}"))
    _h = _load("_hidden_tests", _dec("${b64(f.hidden)}"))
    for _mod, _prefix in ((_t, "test_"), (_h, "hidden_")):
        for _name, _fn in list(_mod.__dict__.items()):
            if callable(_fn) and _name.startswith(_prefix):
                try:
                    _fn()
                    _results.append({"id": _name, "passed": True})
                except BaseException as _e:
                    _results.append({"id": _name, "passed": False, "msg": (type(_e).__name__ + ": " + str(_e))[:110]})
except BaseException as _e:
    _results.append({"id": "load", "passed": False, "msg": (type(_e).__name__ + ": " + str(_e))[:140]})
print("AYDEN_RESULTS:" + json.dumps(_results))
`;
}

export function parseResults(raw: string): CheckResult[] {
  let arr: { id: string; passed: boolean; msg?: string }[];
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  let hiddenN = 0;
  return arr.map((r, i) => {
    const hidden = r.id.startsWith("hidden_");
    if (hidden) hiddenN++;
    return {
      id: `c${i + 1}`,
      name: hidden ? `Hidden check ${hiddenN}` : r.id === "load" ? "Code loads" : r.id,
      kind: "test" as const,
      passed: r.passed,
      hidden,
      message: r.passed ? undefined : hidden ? "A hidden check failed. Think about unusual inputs." : r.msg,
    };
  });
}

/** Used only when the sandbox is unavailable. Heuristic, labelled as static in the UI. */
export function staticChecks(f: SweFamily, src: string): CheckResult[] {
  const mk = (i: number, name: string, passed: boolean, message?: string): CheckResult => ({ id: `s${i}`, name, kind: "lint", passed, hidden: false, message: passed ? undefined : message });
  const out: CheckResult[] = [];
  out.push(mk(1, "Static: code has no syntax-looking problems", src.trim().length > 20 && (src.match(/\(/g)?.length ?? 0) === (src.match(/\)/g)?.length ?? 0), "Unbalanced brackets"));
  if (f.index === 0) {
    const mentions = (src.match(/1\s*-\s*\w*discount\w*/g) ?? []).length;
    out.push(mk(2, "Static: discount applied only once", mentions === 1, "The discount factor appears more than once"));
  } else {
    const base = (src.match(/BASE_FEE/g) ?? []).length;
    out.push(mk(2, "Static: base fee added once", base <= 2 && !/cost\s*\+=\s*BASE_FEE/.test(src), "The base fee is added again for heavy parcels"));
  }
  out.push(mk(3, "Static: invalid input raises ValueError", /raise\s+ValueError/.test(src), "No ValueError for invalid input"));
  out.push(mk(4, "Static: result is rounded", /round\(/.test(src), "No rounding to 2 decimals"));
  return out;
}

export const countTests = (src: string) => (src.match(/^\s*def\s+test_\w+/gm) ?? []).length;
