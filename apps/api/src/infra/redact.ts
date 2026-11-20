import { DlpServiceClient } from "@google-cloud/dlp";
import { config } from "../config.js";
import { warn } from "./log.js";
import type { Store } from "./store.js";

/** Always-on baseline: obvious personal identifiers never reach a model. */
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[phone]"],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[id-number]"],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[pan]"],
  [/\b(?:\d[ -]?){13,16}\b/g, "[card]"],
];

export function basicRedact(text: string): string {
  return PATTERNS.reduce((t, [re, label]) => t.replace(re, label), text);
}

let client: DlpServiceClient | null = null;

/** Redact personal data before text is sent to Gemini: regex baseline, then Google Sensitive Data Protection (when DLP=on). */
export async function redact(text: string, store?: Store): Promise<string> {
  const base = basicRedact(text);
  if (process.env.DLP !== "on" || !config.project || base.length < 4) return base;
  try {
    client ??= new DlpServiceClient();
    const infoTypes = ["EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD_NUMBER", "INDIA_AADHAAR_INDIVIDUAL", "INDIA_PAN_INDIVIDUAL", "IP_ADDRESS"].map((name) => ({ name }));
    const [res] = await client.deidentifyContent({
      parent: `projects/${config.project}/locations/global`,
      inspectConfig: { infoTypes, minLikelihood: "POSSIBLE" },
      deidentifyConfig: { infoTypeTransformations: { transformations: [{ primitiveTransformation: { replaceWithInfoTypeConfig: {} } }] } },
      item: { value: base },
    });
    void store?.incr("redactions");
    return res.item?.value ?? base;
  } catch (e) {
    warn("sensitive data protection call failed; regex redaction used", { error: String((e as Error).message).slice(0, 120) });
    return base;
  }
}
