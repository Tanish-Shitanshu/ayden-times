import { en } from "../i18n/en";
import { api } from "../api/client";
import type { Lang } from "../contract";

/** Interface dictionaries translated at runtime by Google Cloud Translation. Cached on the device. */
export const dicts: Partial<Record<Lang, Record<string, string>>> = {};

const sig = () => { const s = JSON.stringify(en); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

export async function fetchDictionary(lang: Lang): Promise<boolean> {
  if (dicts[lang]) return true;
  const key = `ayden_dict_${lang}_${sig()}`;
  try { const c = localStorage.getItem(key); if (c) { dicts[lang] = JSON.parse(c); return true; } } catch { /* ignore */ }
  try {
    const r = await api.translateUi(lang, en as unknown as Record<string, string>);
    dicts[lang] = r.strings;
    try { localStorage.setItem(key, JSON.stringify(r.strings)); } catch { /* quota */ }
    return true;
  } catch { return false; }
}
