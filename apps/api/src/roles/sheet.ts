/**
 * Reads a spreadsheet the learner submits. The web app reads an uploaded .xlsx in the browser and sends it as text
 * (one row per line, cells separated by " | "); a learner can also type or paste the same table. The server never
 * receives the binary file, so there is nothing to execute and nothing to store.
 */

export interface SheetRow {
  cells: string[];
  label: string;
  nums: number[];
  text: string;
}

const SPLIT = /\s*\|\s*|\t/;

/** "12.5%", "₹1,200", "(5)" and "-3" are all numbers; anything else is not. */
export function toNumber(cell: string): number | null {
  const c = cell.trim().replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!c) return null;
  const neg = /^\(.*\)$/.test(c);
  const m = c.replace(/[()%]/g, "").match(/^[-+]?\d+(?:\.\d+)?$/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return neg ? -Math.abs(n) : n;
}

export function parseSheet(text: string): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || /^\[xlsx/i.test(line) || /^sheet\s*:/i.test(line)) continue;
    let cells = line.split(SPLIT).map((c) => c.trim());
    if (cells.length === 1 && (line.match(/,/g) ?? []).length >= 2 && !/[a-z]{4,}\s[a-z]{3,}\s[a-z]{3,}/i.test(line)) cells = line.split(",").map((c) => c.trim());
    const nums = cells.slice(1).map(toNumber).filter((n): n is number => n !== null);
    rows.push({ cells, label: cells[0] ?? "", nums, text: line });
  }
  return rows;
}

export const findRow = (rows: SheetRow[], re: RegExp): SheetRow | undefined => rows.find((r) => re.test(r.label));

/** True if x equals one of the values within an absolute tolerance, also accepting a percentage written as a fraction. */
export const near = (x: number, target: number, tol: number): boolean => Math.abs(x - target) <= tol;
export const nearPct = (x: number, pct: number, tol = 1): boolean => near(x, pct, tol) || near(x * 100, pct, tol);

/** Numbers a learner cites in prose, next to a rupee or lakh sign or unit. */
export const MONEY = /(?:₹|rs\.?\s?)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:lakhs?|lacs?|crores?|cr\b)/gi;
export const citedMoney = (t: string): number[] => [...t.matchAll(MONEY)].map((m) => parseFloat((m[1] ?? m[2] ?? "0").replace(/,/g, "")));
