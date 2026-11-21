import { en, type I18nKey } from "../i18n/en";
import { hi } from "../i18n/hi";
import { dicts } from "./dict";
import type { Lang } from "../contract";
import { useApp } from "../app/store";
import type { ApiFailure } from "../api/client";

export type T = (key: I18nKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: I18nKey, vars?: Record<string, string | number>) {
  const s: string = (lang === "hi" ? hi[key] : lang === "en" ? en[key] : dicts[lang]?.[key]) ?? en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

export function useT(): T {
  const lang = useApp((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

/** Plain-language copy for an API error. */
export function errorText(t: T, e: unknown): string {
  const err = e as Partial<ApiFailure> | undefined;
  switch (err?.code) {
    case "consent_required": return t("err.consent_required");
    case "attempt_cap": return t("err.attempt_cap");
    case "rate_limited": return t("err.rate_limited", { n: Math.ceil((err.retryAfterMs ?? 5000) / 1000) });
    case "model_unavailable": return t("err.model_unavailable");
    case "unauthenticated": return t("err.unauthenticated");
    case "not_found": return err.message || t("err.not_found");
    case "network": return t("err.network");
    case "validation": case "conflict": return err.message || t("err.generic");
    default: return t("err.generic");
  }
}
