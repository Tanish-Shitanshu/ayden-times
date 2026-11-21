/** Languages the interface can be shown in, and extra languages a colleague may speak. Codes are Cloud Translation codes. */
export const UI_LANGUAGES = [
  { code: "en", native: "English" },
  { code: "hi", native: "हिन्दी" },
  { code: "bn", native: "বাংলা" },
  { code: "te", native: "తెలుగు" },
  { code: "mr", native: "मराठी" },
  { code: "ta", native: "தமிழ்" },
  { code: "gu", native: "ગુજરાતી" },
  { code: "ur", native: "اردو" },
  { code: "kn", native: "ಕನ್ನಡ" },
  { code: "ml", native: "മലയാളം" },
  { code: "or", native: "ଓଡ଼ିଆ" },
  { code: "pa", native: "ਪੰਜਾਬੀ" },
  { code: "as", native: "অসমীয়া" },
] as const;

/** A colleague may speak one of these (the Italian colleague is the worked example). */
export const COLLEAGUE_LANGUAGES = ["it", "fr", "de", "es"] as const;

export const UI_CODES = UI_LANGUAGES.map((l) => l.code);
export const ALL_CODES = [...UI_CODES, ...COLLEAGUE_LANGUAGES] as const;
export const LANGUAGE_NAMES: Record<string, string> = { it: "Italian", fr: "French", de: "German", es: "Spanish", en: "English", hi: "Hindi" };
